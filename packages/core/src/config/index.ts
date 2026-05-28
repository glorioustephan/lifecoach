import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

export interface LifecoachConfig {
  dataDir: string;
  dbPath: string;
  rawDir: string;
  snapshotsDir: string;
  anthropicApiKey: string | undefined;
  voyageApiKey: string | undefined;
  voyageEmbeddingModel: string | undefined;
  voyageRerankModel: string | undefined;
  todoistApiToken: string | undefined;
  capacitiesApiToken: string | undefined;
  /**
   * Default space id for Capacities write-back (reflections, save-to-daily-note).
   * When unset, write-back tools fail unless the agent specifies a spaceId.
   */
  capacitiesDefaultSpaceId: string | undefined;
  /**
   * Capacities MCP server URL (default https://api.capacities.io/mcp). When a
   * token is also set, the agent gains live `search` / `getObjectContent` tools
   * that CAN read page bodies — the one thing the REST API can't do. Requires
   * completing Capacities' MCP OAuth authorization (see env.example).
   */
  capacitiesMcpUrl: string | undefined;
  /** Bearer token for the Capacities MCP server. When unset, the MCP is not wired in. */
  capacitiesMcpToken: string | undefined;
  monarchSessionFile: string | undefined;
  /** Email for Monarch Money login (MONARCH_EMAIL). Used when no session file exists. */
  monarchEmail: string | undefined;
  /** Password for Monarch Money login (MONARCH_PASSWORD). Used when no session file exists. */
  monarchPassword: string | undefined;
  /** TOTP secret for Monarch Money MFA (MONARCH_MFA_SECRET). Optional. */
  monarchMfaSecret: string | undefined;
  monarchSyncEnabled: boolean;
  /** Model used by the conversational agent. */
  model: string;
  /** Model used by the ingest extractor. Defaults to Sonnet for accuracy at low cost. */
  extractionModel: string;
  embeddingDim: number;
}

// Sonnet 4.6 is the chat default — supports tool use like every other Claude
// model, but at ~5x lower per-token cost than Opus. Override with LIFECOACH_MODEL
// in .env if you want Opus 4.7 for harder reasoning, or Haiku 4.5 for even
// cheaper turns.
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-4-6";
const DEFAULT_EMBEDDING_DIM = 1024;

/**
 * Walk up from the start directory until we find a workspace root marker
 * (pnpm-workspace.yaml or .git). Falls back to the start directory if neither
 * is found, so single-package usage still works.
 */
export const findWorkspaceRoot = (start: string = process.cwd()): string => {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (
      fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
};

/**
 * Load environment-specific .env file into process.env.
 * Tries `.env.${env}` first, then falls back to `.env`.
 * Only sets values that aren't already in process.env, allowing CLI overrides.
 */
export const loadEnvironmentConfig = (root: string = findWorkspaceRoot()): void => {
  const env = process.env.LIFECOACH_ENV || process.env.NODE_ENV || "development";
  const envSpecificPath = path.join(root, `.env.${env}`);
  const envPath = path.join(root, ".env");

  let envFile: string | null = null;
  if (fs.existsSync(envSpecificPath)) {
    envFile = envSpecificPath;
  } else if (fs.existsSync(envPath)) {
    envFile = envPath;
  }

  if (envFile) {
    const parsed = dotenv.parse(fs.readFileSync(envFile, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      const existing = process.env[k];
      // Only set if undefined or empty, allowing CLI overrides
      if (existing === undefined || existing === "") {
        process.env[k] = v;
      }
    }
  }
};

export const loadConfig = (overrides: Partial<LifecoachConfig> = {}): LifecoachConfig => {
  const root = findWorkspaceRoot();
  const rawDataDir = overrides.dataDir ?? process.env.LIFECOACH_DATA_DIR;
  // path.resolve handles both cases:
  //   absolute input → returned as-is
  //   relative input → resolved against the workspace root (NOT process.cwd, which
  //   shifts under `pnpm --filter` and would scatter DB files across packages)
  let dataDir: string;
  if (rawDataDir) {
    dataDir = path.resolve(root, rawDataDir);
  } else {
    // Default to environment-specific data directory (data-development, data-production, etc.)
    const env = process.env.LIFECOACH_ENV || process.env.NODE_ENV || "development";
    dataDir = path.join(root, `data-${env}`);
  }

  return {
    dataDir,
    dbPath: overrides.dbPath ?? path.join(dataDir, "lifecoach.db"),
    rawDir: overrides.rawDir ?? path.join(dataDir, "raw"),
    snapshotsDir: overrides.snapshotsDir ?? path.join(dataDir, "snapshots"),
    anthropicApiKey: overrides.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    voyageApiKey: overrides.voyageApiKey ?? process.env.VOYAGE_API_KEY,
    voyageEmbeddingModel:
      overrides.voyageEmbeddingModel ?? process.env.VOYAGE_EMBEDDING_MODEL,
    voyageRerankModel:
      overrides.voyageRerankModel ?? process.env.VOYAGE_RERANK_MODEL,
    todoistApiToken: overrides.todoistApiToken ?? process.env.TODOIST_API_TOKEN,
    capacitiesApiToken: overrides.capacitiesApiToken ?? process.env.CAPACITIES_API_TOKEN,
    capacitiesDefaultSpaceId:
      overrides.capacitiesDefaultSpaceId ?? process.env.CAPACITIES_DEFAULT_SPACE_ID,
    capacitiesMcpUrl:
      overrides.capacitiesMcpUrl
      ?? process.env.CAPACITIES_MCP_URL
      ?? "https://api.capacities.io/mcp",
    capacitiesMcpToken: overrides.capacitiesMcpToken ?? process.env.CAPACITIES_MCP_TOKEN,
    // Anchor the Monarch session token to an absolute path in the data dir so
    // the web server and the cron sync job (which run from different cwds) share
    // one persisted token and reuse it instead of re-logging-in (which trips
    // Monarch's login rate limiter). Honour an explicit override/env first.
    monarchSessionFile:
      overrides.monarchSessionFile
      ?? process.env.MONARCH_SESSION_FILE
      ?? path.join(dataDir, "monarch-session.json"),
    monarchEmail: overrides.monarchEmail ?? process.env.MONARCH_EMAIL,
    monarchPassword: overrides.monarchPassword ?? process.env.MONARCH_PASSWORD,
    monarchMfaSecret: overrides.monarchMfaSecret ?? process.env.MONARCH_MFA_SECRET,
    monarchSyncEnabled:
      overrides.monarchSyncEnabled ?? (process.env.MONARCH_SYNC_ENABLED ?? "true") === "true",
    model: overrides.model ?? process.env.LIFECOACH_MODEL ?? DEFAULT_MODEL,
    extractionModel:
      overrides.extractionModel
      ?? process.env.LIFECOACH_EXTRACTION_MODEL
      ?? DEFAULT_EXTRACTION_MODEL,
    embeddingDim:
      overrides.embeddingDim
      ?? (process.env.LIFECOACH_EMBEDDING_DIM ? Number(process.env.LIFECOACH_EMBEDDING_DIM) : DEFAULT_EMBEDDING_DIM),
  };
};
