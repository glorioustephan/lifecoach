import { loadConfig, type LifecoachConfig } from "./config/index.js";
import { createStorage, type Storage } from "./storage/index.js";
import { createEmbedder, type Embedder } from "./embeddings/index.js";
import { createMemory, type Memory } from "./memory/index.js";
import { AgentRuntime } from "./agent/index.js";
import { AnthropicExtractor, type Extractor } from "./ingest/index.js";
import { TodoistClient, CapacitiesClient } from "./integrations/index.js";
import { Reflector } from "./memory/reflector.js";
import { Insighter } from "./memory/insighter.js";
import { ArtifactExtractor } from "./artifacts/index.js";

export interface Lifecoach {
  config: LifecoachConfig;
  storage: Storage;
  embedder: Embedder;
  memory: Memory;
  agent: AgentRuntime;
  /** Available when ANTHROPIC_API_KEY is set. Used by IngestPipeline for fact + measurement extraction. */
  extractor: Extractor | null;
  /** Available when ANTHROPIC_API_KEY is set. Generates structured reflections. */
  reflector: Reflector | null;
  /** Available when ANTHROPIC_API_KEY is set. Generates ranked insights from the user's data. */
  insighter: Insighter | null;
  /** Available when ANTHROPIC_API_KEY is set. Extracts + formats artifacts (recipes, …). */
  artifactExtractor: ArtifactExtractor | null;
  /** Available when TODOIST_API_TOKEN is set. */
  todoist: TodoistClient | null;
  /** Available when CAPACITIES_API_TOKEN is set. */
  capacities: CapacitiesClient | null;
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
  const capacities = config.capacitiesApiToken
    ? new CapacitiesClient(config.capacitiesApiToken)
    : null;
  const reflector = config.anthropicApiKey
    ? new Reflector({ apiKey: config.anthropicApiKey, model: config.extractionModel })
    : null;
  const insighter = config.anthropicApiKey
    ? new Insighter({ apiKey: config.anthropicApiKey, model: config.extractionModel })
    : null;
  const artifactExtractor = config.anthropicApiKey
    ? new ArtifactExtractor({ apiKey: config.anthropicApiKey, model: config.extractionModel })
    : null;
  const agent = new AgentRuntime({
    config,
    memory,
    storage,
    embedder,
    extractor,
    todoist,
    capacities,
    reflector,
    insighter,
  });

  return {
    config,
    storage,
    embedder,
    memory,
    agent,
    extractor,
    reflector,
    insighter,
    artifactExtractor,
    todoist,
    capacities,
    close: () => storage.close(),
  };
};

export { loadConfig, findWorkspaceRoot, loadEnvironmentConfig } from "./config/index.js";
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
  CapacitiesClient,
  CapacitiesApiError,
  syncCapacities,
  CAPACITIES_SOURCE,
  type CapacitiesSyncResult,
  type CapacitiesSyncOptions,
  type CapacitiesSpace,
  type CapacitiesStructure,
  type CapacitiesLookupResult,
  pushReflectionToCapacities,
  type ReflectionWritebackOptions,
} from "./integrations/index.js";
export { forgetDocument, type ForgetDocumentResult } from "./memory/forget.js";
export { refreshAttentionSignals } from "./memory/attention.js";
export { Reflector, kindWindow, type ReflectionPayload } from "./memory/reflector.js";
export { Insighter } from "./memory/insighter.js";
export {
  ArtifactExtractor,
  type ArtifactExtractorOptions,
  registerArtifactPlugin,
  getArtifactPlugin,
  allArtifactPlugins,
  artifactPluginsFor,
  type ArtifactPlugin,
  type FormattedArtifact,
  type ExtractedArtifact,
  scanArtifacts,
  type ScanOptions,
  type ScanResult,
  ARTIFACT_PROFILE_KEYS,
  EMPTY_RUN_LIMIT,
  MIN_CRON_CONFIDENCE,
  getArtifactSettings,
  isAutoExtractEnabled,
  setAutoExtractEnabled,
  recordCronRun,
  type ArtifactSettings,
} from "./artifacts/index.js";
export {
  exportSnapshot,
  importSnapshot,
  type SnapshotManifest,
  type ExportOptions,
  type ImportOptions,
  type ExportEvent,
  type ImportEvent,
} from "./util/snapshot.js";
export { NotImplementedError, LifecoachError } from "./util/errors.js";
