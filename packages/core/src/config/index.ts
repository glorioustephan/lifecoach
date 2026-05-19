import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export interface LifecoachConfig {
  dataDir: string;
  dbPath: string;
  rawDir: string;
  snapshotsDir: string;
  anthropicApiKey: string | undefined;
  voyageApiKey: string | undefined;
  todoistApiToken: string | undefined;
  /** Model used by the conversational agent. */
  model: string;
  /** Model used by the ingest extractor. Defaults to Sonnet for accuracy at low cost. */
  extractionModel: string;
  embeddingDim: number;
}

const DEFAULT_MODEL = "claude-opus-4-7";
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

export const loadConfig = (overrides: Partial<LifecoachConfig> = {}): LifecoachConfig => {
  const root = findWorkspaceRoot();
  const rawDataDir = overrides.dataDir ?? process.env.LIFECOACH_DATA_DIR;
  // path.resolve handles both cases:
  //   absolute input → returned as-is
  //   relative input → resolved against the workspace root (NOT process.cwd, which
  //   shifts under `pnpm --filter` and would scatter DB files across packages)
  const dataDir = rawDataDir ? path.resolve(root, rawDataDir) : path.join(root, "data");

  return {
    dataDir,
    dbPath: overrides.dbPath ?? path.join(dataDir, "lifecoach.db"),
    rawDir: overrides.rawDir ?? path.join(dataDir, "raw"),
    snapshotsDir: overrides.snapshotsDir ?? path.join(dataDir, "snapshots"),
    anthropicApiKey: overrides.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
    voyageApiKey: overrides.voyageApiKey ?? process.env.VOYAGE_API_KEY,
    todoistApiToken: overrides.todoistApiToken ?? process.env.TODOIST_API_TOKEN,
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
