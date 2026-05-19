import type { Memory } from "../../memory/index.js";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import { buildProfileTools } from "./profile.js";
import { buildRecallTool } from "./recall.js";
import { buildRememberTools } from "./remember.js";
import { buildEpisodicTools } from "./episodic.js";
import { buildMeasurementTools } from "./measurements.js";
import { buildReflectionTools } from "./reflections.js";
import { buildIngestTools } from "./ingest.js";

export interface ToolDeps {
  memory: Memory;
  storage: Storage;
  embedder: Embedder;
}

/**
 * Build the full agent tool surface. Same surface is reused by the MCP server.
 */
export const buildAllTools = (deps: ToolDeps) => [
  ...buildProfileTools(deps.memory),
  buildRecallTool(deps.memory),
  ...buildRememberTools(deps.memory),
  ...buildEpisodicTools(deps.memory),
  ...buildMeasurementTools(deps.memory),
  ...buildReflectionTools(deps.memory),
  ...buildIngestTools({ storage: deps.storage, embedder: deps.embedder }),
];

export type LifecoachTool = ReturnType<typeof buildAllTools>[number];
