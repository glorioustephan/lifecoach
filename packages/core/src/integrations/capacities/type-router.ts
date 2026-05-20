import type { FactCategory, NewFact, NewProject } from "@lifecoach/schemas";
import type { Storage } from "../../storage/index.js";
import type {
  CapacitiesLookupResult,
  CapacitiesSpace,
  CapacitiesStructure,
} from "./client.js";
import { CapacitiesClient } from "./client.js";

/**
 * Phase 5.2 — type-aware extraction at sync time.
 *
 * The Capacities API doesn't expose object bodies, so we can't extract content
 * from individual objects. What we CAN do is route by structure type: when an
 * object's type matches a well-known Capacities default (Person, Project,
 * Recipe), we materialize a first-class entity in the matching local table
 * (facts/projects) in addition to the document mirror.
 *
 * Match rules — by `structureTitle` (case-insensitive). User-defined custom
 * types fall through to the catch-all document mirror; the directory still
 * makes them recall-able.
 *
 *   Person      → facts[category=person]
 *   Project     → projects table + facts[category=other] for cross-recall
 *   Recipe      → facts[category=recipe]
 *   Daily Note  → document only (already handled by base sync)
 *   default     → document only
 */

const normalize = (s: string | undefined | null): string =>
  (s ?? "").trim().toLowerCase();

export interface RoutingResult {
  /** Number of facts created/updated for this object. */
  factsTouched: number;
  /** Number of projects created/updated for this object. */
  projectsTouched: number;
}

const FACT_SOURCE_PREFIX = "capacities:";

/**
 * Build the source string we use on every fact derived from a Capacities object.
 * Stable across syncs so we can dedupe by querying for an existing fact whose
 * source string matches.
 */
const factSource = (objectId: string): string => `${FACT_SOURCE_PREFIX}${objectId}`;

/**
 * Idempotent fact upsert keyed by source string. We don't have a uniqueness
 * constraint on the column, so the existence check is a small query — fine
 * given sync runs are infrequent and Capacities object counts are bounded.
 */
const upsertCapacitiesFact = (
  storage: Storage,
  category: FactCategory,
  objectId: string,
  fact: Omit<NewFact, "source" | "category">,
): void => {
  const source = factSource(objectId);
  const db = storage.handle.db;
  const existing = db
    .prepare(
      "SELECT id FROM facts WHERE source = ? AND category = ? AND valid_to IS NULL LIMIT 1",
    )
    .get(source, category) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE facts SET subject = ?, body = ?, data = ? WHERE id = ?",
    ).run(
      fact.subject,
      fact.body,
      fact.data ? JSON.stringify(fact.data) : null,
      existing.id,
    );
    return;
  }
  storage.facts.create({ ...fact, category, source, confidence: fact.confidence ?? 1.0 });
};

/**
 * Idempotent project upsert by Capacities object id, stashed in the body text.
 * Projects don't have an external_id column, so we use a sentinel in the body
 * to find an existing row. This is the lowest-risk way to stay backwards
 * compatible without a schema change just for the Capacities sync.
 */
const projectBodySentinel = (objectId: string): string => `[capacities:${objectId}]`;

const upsertCapacitiesProject = (
  storage: Storage,
  objectId: string,
  title: string,
  spaceId: string,
): void => {
  const sentinel = projectBodySentinel(objectId);
  const body = `${sentinel}\nMirrored from Capacities Project. Open in Capacities: ${CapacitiesClient.buildObjectUrl(spaceId, objectId)}`;
  const db = storage.handle.db;
  const existing = db
    .prepare("SELECT id FROM projects WHERE body LIKE ? LIMIT 1")
    .get(`%${sentinel}%`) as { id: string } | undefined;

  if (existing) {
    db.prepare("UPDATE projects SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(
      title,
      body,
      Date.now(),
      existing.id,
    );
    return;
  }
  const newProject: NewProject = {
    title,
    body,
    status: "active",
  };
  storage.projects.create(newProject);
};

/**
 * Route a single Capacities object to the appropriate local entity beyond
 * the document mirror. Returns a count of touched rows for sync reporting.
 *
 * Idempotent: re-running the sync upserts rather than creating duplicates.
 */
export const routeCapacitiesObject = (
  storage: Storage,
  space: CapacitiesSpace,
  structure: CapacitiesStructure | undefined,
  obj: CapacitiesLookupResult,
): RoutingResult => {
  const result: RoutingResult = { factsTouched: 0, projectsTouched: 0 };
  const typeKey = normalize(structure?.title);
  const url = CapacitiesClient.buildObjectUrl(space.id, obj.id);

  switch (typeKey) {
    case "person":
    case "people": {
      upsertCapacitiesFact(storage, "person", obj.id, {
        subject: obj.title,
        body: `${obj.title} — Capacities Person (space: ${space.title}). Open: ${url}`,
        data: {
          capacities: {
            spaceId: space.id,
            objectId: obj.id,
            structureId: obj.structureId,
            url,
          },
        },
        confidence: 1.0,
      });
      result.factsTouched = 1;
      return result;
    }
    case "project":
    case "projects": {
      upsertCapacitiesProject(storage, obj.id, obj.title, space.id);
      result.projectsTouched = 1;
      return result;
    }
    case "recipe":
    case "recipes": {
      upsertCapacitiesFact(storage, "recipe", obj.id, {
        subject: obj.title,
        body: `Recipe: ${obj.title} — mirrored from Capacities (space: ${space.title}). Open: ${url}`,
        data: {
          capacities: {
            spaceId: space.id,
            objectId: obj.id,
            structureId: obj.structureId,
            url,
          },
        },
        confidence: 1.0,
      });
      result.factsTouched = 1;
      return result;
    }
    default:
      // Daily Note + everything custom: leave to the document mirror.
      return result;
  }
};
