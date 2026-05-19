import { loadConfig, type LifecoachConfig } from "./config/index.js";
import { createStorage, type Storage } from "./storage/index.js";
import { createEmbedder, type Embedder } from "./embeddings/index.js";
import { createMemory, type Memory } from "./memory/index.js";
import { AgentRuntime } from "./agent/index.js";
import { AnthropicExtractor, type Extractor } from "./ingest/index.js";
import { TodoistClient } from "./integrations/index.js";

export interface Lifecoach {
  config: LifecoachConfig;
  storage: Storage;
  embedder: Embedder;
  memory: Memory;
  agent: AgentRuntime;
  /** Available when ANTHROPIC_API_KEY is set. Used by IngestPipeline for fact + measurement extraction. */
  extractor: Extractor | null;
  /** Available when TODOIST_API_TOKEN is set. */
  todoist: TodoistClient | null;
  close: () => void;
}

/**
 * Wire the whole thing up. Single call returns everything the CLI / MCP server
 * needs. Caller is responsible for invoking `close()` to release the DB.
 */
export const createLifecoach = (overrides?: Partial<LifecoachConfig>): Lifecoach => {
  const config = loadConfig(overrides);
  const storage = createStorage(config);
  const embedder = createEmbedder(config);
  const memory = createMemory(storage, embedder);
  const extractor = config.anthropicApiKey
    ? new AnthropicExtractor({
        apiKey: config.anthropicApiKey,
        model: config.extractionModel,
      })
    : null;
  const todoist = config.todoistApiToken ? new TodoistClient(config.todoistApiToken) : null;
  const agent = new AgentRuntime({ config, memory, storage, embedder, extractor, todoist });

  return {
    config,
    storage,
    embedder,
    memory,
    agent,
    extractor,
    todoist,
    close: () => storage.close(),
  };
};

export { loadConfig, findWorkspaceRoot } from "./config/index.js";
export type { LifecoachConfig } from "./config/index.js";
export type { Storage } from "./storage/index.js";
export type { Embedder } from "./embeddings/index.js";
export type { Memory } from "./memory/index.js";
export { AgentRuntime } from "./agent/index.js";
export { IngestPipeline } from "./ingest/index.js";
export type { IngestPipelineDeps, IngestResult } from "./ingest/index.js";
export {
  TodoistClient,
  TodoistApiError,
  syncTodoist,
  type TodoistSyncResult,
} from "./integrations/index.js";
export { forgetDocument, type ForgetDocumentResult } from "./memory/forget.js";
export { NotImplementedError, LifecoachError } from "./util/errors.js";
