import type { Memory } from "../../memory/index.js";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type { Extractor } from "../../ingest/index.js";
import type { TodoistClient } from "../../integrations/index.js";
import { buildProfileTools } from "./profile.js";
import { buildRecallTool } from "./recall.js";
import { buildRememberTools } from "./remember.js";
import { buildEpisodicTools } from "./episodic.js";
import { buildMeasurementTools } from "./measurements.js";
import { buildReflectionTools } from "./reflections.js";
import { buildIngestTools } from "./ingest.js";
import { buildTaskTools } from "./tasks.js";

export interface ToolDeps {
  memory: Memory;
  storage: Storage;
  embedder: Embedder;
  extractor: Extractor | null;
  todoist: TodoistClient | null;
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
  ...buildIngestTools({
    storage: deps.storage,
    embedder: deps.embedder,
    memory: deps.memory,
    extractor: deps.extractor,
  }),
  ...buildTaskTools({ storage: deps.storage, todoist: deps.todoist }),
];

export type LifecoachTool = ReturnType<typeof buildAllTools>[number];
