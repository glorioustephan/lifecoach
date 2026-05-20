import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

/**
 * Capacities API client (api.capacities.io).
 *
 * The API is intentionally minimal — as of late 2025 / early 2026 it exposes:
 *   - GET  /spaces             list spaces
 *   - GET  /space-info         structures + collections for one space
 *   - POST /lookup             title-prefix search within a space
 *   - POST /save-to-daily-note write markdown into today's daily note
 *   - POST /save-weblink       capture a URL as a Weblink object
 *
 * Notably absent: any way to fetch the body of an existing object. So we
 * can build a *directory* of titles → URLs (via repeated /lookup sweeps) but
 * we cannot mirror the body content. The "open in Capacities" cross-link is
 * what makes the directory useful for trust + drill-down.
 *
 * Rate limits (per official docs):
 *   - /spaces, /space-info     5 / 60s
 *   - /save-to-daily-note      5 / 60s
 *   - /save-weblink           10 / 60s
 *   - /lookup               120 / 60s
 *
 * The withRetry wrapper handles 429s with exponential backoff + jitter.
 */
const BASE_URL = "https://api.capacities.io";

export interface CapacitiesSpace {
  id: string;
  title: string;
  icon?: { type: string; val?: string } | null;
}

export interface CapacitiesPropertyDef {
  id: string;
  name: string;
  dataType: string;
}

export interface CapacitiesCollection {
  id: string;
  title: string;
}

export interface CapacitiesStructure {
  id: string;
  title: string;
  pluralName?: string;
  labelColor?: string;
  propertyDefinitions?: CapacitiesPropertyDef[];
  collections?: CapacitiesCollection[];
}

export interface CapacitiesSpaceInfo {
  structures: CapacitiesStructure[];
}

export interface CapacitiesLookupResult {
  id: string;
  structureId: string;
  title: string;
}

export interface CapacitiesSavedWeblink {
  id: string;
  spaceId: string;
  url: string;
  title?: string;
}

export interface SaveToDailyNoteInput {
  spaceId: string;
  /** Markdown body to append to today's daily note. */
  mdText: string;
  /** Tag the origin so the user can identify lifecoach-written entries. */
  origin?: "commandPalette" | "mcp";
  /** If true, Capacities omits its usual timestamp prefix. */
  noTimeStamp?: boolean;
}

export interface SaveWeblinkInput {
  spaceId: string;
  url: string;
  titleOverwrite?: string;
  descriptionOverwrite?: string;
  tags?: string[];
  /** Optional markdown body appended to the Weblink notes. */
  mdText?: string;
}

export class CapacitiesClient {
  constructor(private readonly apiToken: string) {
    if (!apiToken) {
      throw new LifecoachError(
        "CapacitiesClient requires an API token",
        "CAPACITIES_NO_TOKEN",
      );
    }
  }

  async listSpaces(): Promise<CapacitiesSpace[]> {
    const resp = await this.request<{ spaces: CapacitiesSpace[] }>("GET", "/spaces");
    return resp.spaces ?? [];
  }

  async getSpaceInfo(spaceId: string): Promise<CapacitiesSpaceInfo> {
    const params = new URLSearchParams({ spaceid: spaceId });
    return this.request<CapacitiesSpaceInfo>("GET", `/space-info?${params.toString()}`);
  }

  /**
   * Title-prefix search within a space. Returns up to a few dozen hits.
   * Capacities does not document the result cap; observed behavior is ~10.
   */
  async lookup(spaceId: string, searchTerm: string): Promise<CapacitiesLookupResult[]> {
    const resp = await this.request<{ results: CapacitiesLookupResult[] }>(
      "POST",
      "/lookup",
      { spaceId, searchTerm },
    );
    return resp.results ?? [];
  }

  /**
   * Append markdown to today's daily note. Used by the reflection write-back
   * (Phase 5.3) and by the agent-facing save_to_daily_note tool.
   */
  async saveToDailyNote(input: SaveToDailyNoteInput): Promise<void> {
    const body: Record<string, unknown> = {
      spaceId: input.spaceId,
      mdText: input.mdText,
    };
    if (input.origin) body["origin"] = input.origin;
    if (input.noTimeStamp !== undefined) body["noTimeStamp"] = input.noTimeStamp;
    await this.request<unknown>("POST", "/save-to-daily-note", body);
  }

  /**
   * Capture a URL into Capacities as a Weblink object. The agent uses this
   * to surface external references the user might want to keep.
   */
  async saveWeblink(input: SaveWeblinkInput): Promise<CapacitiesSavedWeblink | null> {
    const body: Record<string, unknown> = {
      spaceId: input.spaceId,
      url: input.url,
    };
    if (input.titleOverwrite) body["titleOverwrite"] = input.titleOverwrite;
    if (input.descriptionOverwrite) body["descriptionOverwrite"] = input.descriptionOverwrite;
    if (input.tags && input.tags.length > 0) body["tags"] = input.tags;
    if (input.mdText) body["mdText"] = input.mdText;
    return this.request<CapacitiesSavedWeblink>("POST", "/save-weblink", body);
  }

  /**
   * Build the canonical capacities:// URL for an object. This is what the
   * web UI surfaces as "open in Capacities" — Capacities registers the URL
   * scheme on the desktop client so the link launches the app at the right
   * page on macOS / Windows.
   */
  static buildObjectUrl(spaceId: string, objectId: string): string {
    return `capacities://${spaceId}/${objectId}`;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    return withRetry(
      async () => {
        const resp = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new CapacitiesApiError(
            `Capacities ${method} ${path} failed: ${resp.status} ${resp.statusText}${
              text ? ` — ${text.slice(0, 200)}` : ""
            }`,
            resp.status,
          );
        }
        if (resp.status === 204) return undefined as T;
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return undefined as T;
        return (await resp.json()) as T;
      },
      { maxAttempts: 4 },
    );
  }
}

export class CapacitiesApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CapacitiesApiError";
    this.status = status;
  }
}
