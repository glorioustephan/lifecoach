import type { Memory } from "../../memory/index.js";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type { Extractor } from "../../ingest/index.js";
import type { TodoistClient, CapacitiesClient } from "../../integrations/index.js";
import type { Reflector } from "../../memory/reflector.js";
import type { Insighter } from "../../memory/insighter.js";
import { buildProfileTools } from "./profile.js";
import { buildRecallTool } from "./recall.js";
import { buildRememberTools } from "./remember.js";
import { buildEpisodicTools } from "./episodic.js";
import { buildMeasurementTools } from "./measurements.js";
import { buildReflectionTools } from "./reflections.js";
import { buildIngestTools } from "./ingest.js";
import { buildTaskTools } from "./tasks.js";
import { buildForgetDocumentTools } from "./forget-document.js";
import { buildInsightTools } from "./insights.js";
import { buildGoalTools } from "./goals.js";
import { buildCapacitiesTools } from "./capacities.js";
import { buildFinancialTools } from "./financial.js";
import { buildCategorizationTools } from "./categorization.js";
import { buildWebResearchTools } from "./web-research.js";

export interface ToolDeps {
  memory: Memory;
  storage: Storage;
  embedder: Embedder;
  extractor: Extractor | null;
  todoist: TodoistClient | null;
  capacities: CapacitiesClient | null;
  reflector: Reflector | null;
  insighter: Insighter | null;
  /** Default target space for Capacities write-back tools. */
  capacitiesDefaultSpaceId?: string | undefined;
  /** Required for web-research tools (Anthropic web_search server tool). */
  anthropicApiKey?: string | undefined;
  /** Model used by sub-call tools (e.g. web research). */
  model?: string | undefined;
}

/**
 * Build the full agent tool surface. Same surface is reused by the MCP server.
 */
export const buildAllTools = (deps: ToolDeps) => [
  ...buildProfileTools(deps.memory),
  buildRecallTool(deps.memory),
  ...buildRememberTools(deps.memory),
  ...buildEpisodicTools(deps.memory),
  ...buildMeasurementTools(deps.storage),
  ...buildReflectionTools({
    memory: deps.memory,
    storage: deps.storage,
    reflector: deps.reflector,
  }),
  ...buildIngestTools({
    storage: deps.storage,
    embedder: deps.embedder,
    memory: deps.memory,
    extractor: deps.extractor,
  }),
  ...buildTaskTools({ storage: deps.storage, embedder: deps.embedder, todoist: deps.todoist }),
  ...buildForgetDocumentTools({ storage: deps.storage }),
  ...buildInsightTools({
    storage: deps.storage,
    memory: deps.memory,
    insighter: deps.insighter,
  }),
  ...buildGoalTools({ storage: deps.storage }),
  ...buildCapacitiesTools({
    capacities: deps.capacities,
    storage: deps.storage,
    defaultSpaceId: deps.capacitiesDefaultSpaceId,
  }),
  ...buildFinancialTools(deps.storage),
  ...buildCategorizationTools(deps.storage),
  ...buildWebResearchTools({ apiKey: deps.anthropicApiKey, model: deps.model }),
];

export type LifecoachTool = ReturnType<typeof buildAllTools>[number];
