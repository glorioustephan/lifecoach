import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CapacitiesClient } from "../../integrations/index.js";
import type { Storage } from "../../storage/index.js";
import { CAPACITIES_SOURCE } from "../../integrations/capacities/sync.js";
import { LifecoachError } from "../../util/errors.js";

export interface CapacitiesToolDeps {
  capacities: CapacitiesClient | null;
  storage: Storage;
  /** Used as the default target space for write-back tools when caller omits spaceId. */
  defaultSpaceId: string | undefined;
}

const requireClient = (client: CapacitiesClient | null): CapacitiesClient => {
  if (!client) {
    throw new LifecoachError(
      "Capacities is not configured. Add CAPACITIES_API_TOKEN to .env to enable.",
      "CAPACITIES_NOT_CONFIGURED",
    );
  }
  return client;
};

const resolveSpaceId = (provided: string | undefined, fallback: string | undefined): string => {
  const id = provided ?? fallback;
  if (!id) {
    throw new LifecoachError(
      "No Capacities space specified. Pass spaceId, or set CAPACITIES_DEFAULT_SPACE_ID in .env.",
      "CAPACITIES_NO_SPACE",
    );
  }
  return id;
};

/**
 * Build the Capacities tool surface. These complement the read-side directory
 * built by `lifecoach sync capacities` — even when the sweep missed an object,
 * the agent can call `lookup_in_capacities` live to find it by title.
 *
 *   - list_capacities_spaces      list spaces (for the agent to ask "where?")
 *   - lookup_in_capacities        live title search
 *   - save_to_daily_note          append markdown to today's daily note
 *   - save_to_capacities          capture a URL as a Weblink object
 */
export const buildCapacitiesTools = (deps: CapacitiesToolDeps) => [
  tool(
    "list_capacities_spaces",
    "List the user's Capacities spaces. Useful for picking the right spaceId when save-style tools need it explicitly.",
    {},
    async () => {
      const client = requireClient(deps.capacities);
      const spaces = await client.listSpaces();
      if (spaces.length === 0) {
        return { content: [{ type: "text", text: "No Capacities spaces found." }] };
      }
      const lines = spaces.map((s) => `${s.id}  ${s.title}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  ),

  tool(
    "lookup_in_capacities",
    "Live title search in Capacities. Returns up to a few matching objects with their type, title, and a capacities:// URL that opens the object in the desktop app. Use this when recall surfaces a fact the user mentioned 'is in Capacities' but the local mirror doesn't have it yet.",
    {
      searchTerm: z.string().min(1).describe("Title prefix or word to match"),
      spaceId: z
        .string()
        .optional()
        .describe("Capacities space id. Defaults to CAPACITIES_DEFAULT_SPACE_ID."),
    },
    async ({ searchTerm, spaceId }) => {
      const client = requireClient(deps.capacities);
      const space = resolveSpaceId(spaceId, deps.defaultSpaceId);
      const results = await client.lookup(space, searchTerm);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: `No Capacities objects matched "${searchTerm}".` }],
        };
      }
      const lines = results.map(
        (r) => `[${r.id.slice(0, 8)}] ${r.title}  →  ${r.id}\n    capacities://${space}/${r.id}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `${results.length} match${results.length === 1 ? "" : "es"}\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  ),

  tool(
    "save_to_daily_note",
    "Append markdown to today's Capacities daily note. Use this when the user wants to drop a thought, recap, or quick note into Capacities that should land alongside today's date. Prefer save_to_capacities for URLs/links.",
    {
      mdText: z.string().min(1).describe("Markdown body to append"),
      spaceId: z
        .string()
        .optional()
        .describe("Capacities space id. Defaults to CAPACITIES_DEFAULT_SPACE_ID."),
      noTimeStamp: z
        .boolean()
        .optional()
        .describe("If true, Capacities omits its automatic timestamp prefix."),
    },
    async ({ mdText, spaceId, noTimeStamp }) => {
      const client = requireClient(deps.capacities);
      const space = resolveSpaceId(spaceId, deps.defaultSpaceId);
      await client.saveToDailyNote({
        spaceId: space,
        mdText,
        origin: "mcp",
        ...(noTimeStamp !== undefined ? { noTimeStamp } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: `Saved to Capacities daily note (space ${space.slice(0, 8)}…).`,
          },
        ],
      };
    },
  ),

  tool(
    "save_to_capacities",
    "Save a URL into Capacities as a Weblink object — bookmark-style. Use when the user references an article, video, or any link they'll want again. Falls back to save_to_daily_note for text without a URL.",
    {
      url: z.string().url().describe("URL to capture"),
      title: z.string().optional().describe("Override the page's <title>"),
      description: z.string().optional().describe("Override the auto-extracted description"),
      tags: z.array(z.string()).optional().describe("Tags to apply to the Weblink"),
      notes: z.string().optional().describe("Optional markdown notes appended to the Weblink"),
      spaceId: z
        .string()
        .optional()
        .describe("Capacities space id. Defaults to CAPACITIES_DEFAULT_SPACE_ID."),
    },
    async ({ url, title, description, tags, notes, spaceId }) => {
      const client = requireClient(deps.capacities);
      const space = resolveSpaceId(spaceId, deps.defaultSpaceId);
      const result = await client.saveWeblink({
        spaceId: space,
        url,
        ...(title !== undefined ? { titleOverwrite: title } : {}),
        ...(description !== undefined ? { descriptionOverwrite: description } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(notes !== undefined ? { mdText: notes } : {}),
      });
      const summary =
        result?.id
          ? `Saved Weblink ${result.id.slice(0, 8)} — ${result.title ?? url}\ncapacities://${space}/${result.id}`
          : `Saved Weblink for ${url}.`;
      return { content: [{ type: "text", text: summary }] };
    },
  ),

  tool(
    "list_local_capacities_directory",
    "List Capacities objects we've mirrored locally via `lifecoach sync capacities`. This is a TITLE-ONLY directory — it tells you a page exists and its type/space/URL, but NOT its contents. Faster than lookup_in_capacities for browsing (no API call). To read a page's body, use the Capacities MCP content tools (if configured) or open the capacities:// URL; never infer contents from a title here.",
    {
      limit: z.number().int().min(1).max(200).optional().describe("Default: 50"),
    },
    async ({ limit }) => {
      const docs = deps.storage.documents.list({
        externalSource: CAPACITIES_SOURCE,
        limit: limit ?? 50,
      });
      if (docs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "No Capacities objects mirrored locally yet. Run `lifecoach sync capacities` to build the directory.",
            },
          ],
        };
      }
      const lines = docs.map((d) => {
        const meta = d.metadata ?? {};
        const struct = (meta["structureTitle"] as string | null) ?? "Object";
        const space = (meta["spaceTitle"] as string | null) ?? "?";
        const url = (meta["url"] as string | null) ?? "";
        return `[${struct}] ${d.title ?? "(untitled)"} · ${space}\n    ${url}`;
      });
      return {
        content: [
          {
            type: "text",
            text: `${docs.length} mirrored object${docs.length === 1 ? "" : "s"}\n\n${lines.join("\n")}`,
          },
        ],
      };
    },
  ),
];
