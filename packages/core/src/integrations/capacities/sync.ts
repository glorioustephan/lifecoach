import type { Document, NewDocument } from "@lifecoach/schemas";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import {
  CapacitiesClient,
  type CapacitiesLookupResult,
  type CapacitiesSpace,
  type CapacitiesStructure,
} from "./client.js";
import { routeCapacitiesObject } from "./type-router.js";

export const CAPACITIES_SOURCE = "capacities";

export interface CapacitiesSyncResult {
  spacesScanned: number;
  structuresIndexed: number;
  objectsDiscovered: number;
  upserted: number;
  embedded: number;
  removed: number;
  /** Facts created/updated by type-aware routing (Person, Recipe). */
  factsRouted: number;
  /** Projects created/updated by type-aware routing. */
  projectsRouted: number;
  /** Lookup terms used in this sweep (alphabet by default + structure pluralNames). */
  searchTermsUsed: number;
}

export interface CapacitiesSyncOptions {
  /**
   * Override the sweep terms. When omitted, we use a–z + 0–9 + structure
   * pluralNames discovered in /space-info. That hits the API limit budget
   * with a healthy margin under the 120/60s ceiling on /lookup.
   */
  searchTerms?: string[];
  /**
   * If true, documents previously synced from Capacities that we DIDN'T see
   * in this sweep are deleted. Off by default because the sweep is best-effort
   * (Capacities doesn't expose a real enumeration endpoint, so absence ≠ deletion).
   * Turn it on once you've tuned `searchTerms` to be exhaustive for your space.
   */
  pruneMissing?: boolean;
}

const DEFAULT_TERMS: string[] = [
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."0123456789".split(""),
];

/**
 * Build the text we embed for a Capacities object. Title + structure name is
 * all we have — there's no public endpoint for the object body, so this is
 * the best signal for "you have a Capacities Person named X" recall.
 */
const renderForEmbedding = (
  result: CapacitiesLookupResult,
  structure: CapacitiesStructure | undefined,
  spaceTitle: string,
): string => {
  const lines: string[] = [];
  const typeLabel = structure?.title ?? "object";
  lines.push(`[capacities · ${typeLabel}] ${result.title}`);
  lines.push(`space: ${spaceTitle}`);
  return lines.join("\n");
};

const toNewDocument = (
  result: CapacitiesLookupResult,
  structure: CapacitiesStructure | undefined,
  space: CapacitiesSpace,
): NewDocument => {
  const typeLabel = structure?.title ?? "object";
  // The body is deliberately a SELF-DESCRIBING STUB, not a claim of content.
  // The REST /lookup sweep that builds this directory only returns titles —
  // it has no access to page bodies. Spelling that out here means that when
  // recall surfaces this document, the model reads an honest note instead of
  // assuming it holds the page's contents (which previously led the coach to
  // confidently "summarize" a page it had only the title of).
  const body =
    `Capacities ${typeLabel} titled "${result.title}" (directory entry).\n\n` +
    `Only the title is mirrored locally — the page body is NOT stored here. ` +
    `To read its actual contents: use the Capacities MCP tools (search / get_capacities_object_content) ` +
    `if configured, open it in Capacities, or ask the user to paste/export it. ` +
    `Do not infer or fabricate the body from the title alone.`;
  return {
    source: CAPACITIES_SOURCE,
    mime: "application/vnd.capacities.object+json",
    title: result.title,
    body,
    metadata: {
      spaceId: space.id,
      spaceTitle: space.title,
      structureId: result.structureId,
      structureTitle: structure?.title ?? null,
      structurePluralName: structure?.pluralName ?? null,
      url: CapacitiesClient.buildObjectUrl(space.id, result.id),
      // Explicit flag so other code (artifact scan, recall) can tell this is a
      // title-only stub and skip treating it as real content.
      contentMirrored: false,
    },
    externalId: result.id,
    externalSource: CAPACITIES_SOURCE,
  };
};

/**
 * Sweep one space: run every `searchTerm` through /lookup, dedupe by object id,
 * upsert each as a document with structure metadata, embed in one batch.
 *
 * Returns the set of external_ids seen, so the caller can choose to prune.
 */
const syncSpace = async (
  client: CapacitiesClient,
  storage: Storage,
  embedder: Embedder,
  space: CapacitiesSpace,
  searchTerms: string[],
): Promise<{
  structures: CapacitiesStructure[];
  seenIds: Set<string>;
  upserted: Document[];
  factsRouted: number;
  projectsRouted: number;
}> => {
  const info = await client.getSpaceInfo(space.id);
  const structures = info.structures ?? [];
  const structureById = new Map(structures.map((s) => [s.id, s]));

  // Dedupe — the same object will surface for multiple prefix sweeps.
  const seen = new Map<string, CapacitiesLookupResult>();
  for (const term of searchTerms) {
    let results: CapacitiesLookupResult[] = [];
    try {
      results = await client.lookup(space.id, term);
    } catch (err) {
      // Don't let one bad term kill the whole sweep — log and move on.
      console.warn(
        `[capacities] lookup("${term}") in space ${space.title} failed: ${(err as Error).message}`,
      );
      continue;
    }
    for (const r of results) {
      if (!seen.has(r.id)) seen.set(r.id, r);
    }
  }

  const upserted: Document[] = [];
  let factsRouted = 0;
  let projectsRouted = 0;
  for (const r of seen.values()) {
    const structure = structureById.get(r.structureId);
    const doc = storage.documents.upsertByExternal(toNewDocument(r, structure, space));
    upserted.push(doc);
    // Type-aware routing: Person → facts, Project → projects, Recipe → facts.
    // Unknown types are document-only.
    const routed = routeCapacitiesObject(storage, space, structure, r);
    factsRouted += routed.factsTouched;
    projectsRouted += routed.projectsTouched;
  }

  // Batch-embed. Voyage caps a single request at 1000 items; chunk to stay
  // well under that. Earlier versions of this code did one giant call and
  // crashed with `batch size limit is 1000` on spaces with 1000+ objects.
  const EMBED_BATCH = 256;
  if (embedder.enabled && upserted.length > 0) {
    const texts = upserted.map((doc) =>
      renderForEmbedding(
        {
          id: doc.externalId!,
          structureId: (doc.metadata?.["structureId"] as string) ?? "",
          title: doc.title ?? "",
        },
        structureById.get((doc.metadata?.["structureId"] as string) ?? ""),
        space.title,
      ),
    );
    for (let start = 0; start < upserted.length; start += EMBED_BATCH) {
      const slice = upserted.slice(start, start + EMBED_BATCH);
      const sliceTexts = texts.slice(start, start + EMBED_BATCH);
      const vectors = await embedder.embedDocuments(sliceTexts);
      for (let i = 0; i < slice.length; i += 1) {
        const doc = slice[i]!;
        const vec = vectors[i];
        if (!vec || vec.length === 0) continue;
        storage.embeddings.deleteForRef("document", doc.id);
        storage.embeddings.insert({
          refType: "document",
          refId: doc.id,
          chunkIndex: 0,
          text: sliceTexts[i]!,
          embedding: vec,
          model: embedder.metadata.model,
          dimension: embedder.metadata.dimension,
          sourceUpdatedAt: doc.ingestedAt,
        });
      }
    }
  }

  return {
    structures,
    seenIds: new Set(seen.keys()),
    upserted,
    factsRouted,
    projectsRouted,
  };
};

/**
 * Top-level sync entry point. Pulls every space, sweeps each one, and
 * (optionally) prunes documents no longer present.
 *
 * The sync is best-effort by design: Capacities doesn't expose object
 * enumeration, so coverage scales with how many sweep terms we issue.
 * The defaults (a–z + 0–9 + structure plural names) catch most titles.
 */
export const syncCapacities = async (
  client: CapacitiesClient,
  storage: Storage,
  embedder: Embedder,
  options: CapacitiesSyncOptions = {},
): Promise<CapacitiesSyncResult> => {
  const spaces = await client.listSpaces();

  let structuresIndexed = 0;
  let objectsDiscovered = 0;
  let upserted = 0;
  let embedded = 0;
  let removed = 0;
  let factsRouted = 0;
  let projectsRouted = 0;
  const allSeenIds = new Set<string>();
  let termsUsed = 0;

  for (const space of spaces) {
    // Build the term list for this space: caller override > defaults + structure pluralNames.
    let info: { structures: CapacitiesStructure[] } | null = null;
    if (!options.searchTerms) {
      info = await client.getSpaceInfo(space.id);
    }
    const structurePlurals = (info?.structures ?? [])
      .map((s) => s.pluralName ?? s.title)
      .filter((s): s is string => typeof s === "string" && s.length > 0);
    const terms =
      options.searchTerms ?? Array.from(new Set([...DEFAULT_TERMS, ...structurePlurals]));
    termsUsed += terms.length;

    const result = await syncSpace(client, storage, embedder, space, terms);
    structuresIndexed += result.structures.length;
    objectsDiscovered += result.seenIds.size;
    upserted += result.upserted.length;
    if (embedder.enabled) embedded += result.upserted.length;
    factsRouted += result.factsRouted;
    projectsRouted += result.projectsRouted;
    for (const id of result.seenIds) allSeenIds.add(id);
  }

  if (options.pruneMissing) {
    const stale = storage.documents.deleteStaleByExternal(CAPACITIES_SOURCE, allSeenIds);
    for (const id of stale) {
      storage.embeddings.deleteForRef("document", id);
    }
    removed = stale.length;
  }

  return {
    spacesScanned: spaces.length,
    structuresIndexed,
    objectsDiscovered,
    upserted,
    embedded,
    removed,
    factsRouted,
    projectsRouted,
    searchTermsUsed: termsUsed,
  };
};
