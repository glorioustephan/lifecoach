import { registerArtifactPlugin } from "./registry.js";
import { recipePlugin } from "./plugins/recipe.js";
import {
  spendingAlertPlugin,
  debtPayoffPlanPlugin,
  cashflowSummaryPlugin,
  portfolioSnapshotPlugin,
} from "./plugins/index.js";

// Register built-in artifact plugins. Adding a type = one import + one call.
registerArtifactPlugin(recipePlugin);
registerArtifactPlugin(spendingAlertPlugin);
registerArtifactPlugin(debtPayoffPlanPlugin);
registerArtifactPlugin(cashflowSummaryPlugin);
registerArtifactPlugin(portfolioSnapshotPlugin);

export { ArtifactExtractor, type ArtifactExtractorOptions } from "./extractor.js";
export {
  registerArtifactPlugin,
  getArtifactPlugin,
  allArtifactPlugins,
  artifactPluginsFor,
} from "./registry.js";
export type { ArtifactPlugin, FormattedArtifact, ExtractedArtifact } from "./types.js";
export { scanArtifacts, type ScanOptions, type ScanResult } from "./scan.js";
export {
  ARTIFACT_PROFILE_KEYS,
  EMPTY_RUN_LIMIT,
  MIN_CRON_CONFIDENCE,
  getArtifactSettings,
  isAutoExtractEnabled,
  setAutoExtractEnabled,
  recordCronRun,
  type ArtifactSettings,
} from "./settings.js";
export { recipePlugin } from "./plugins/recipe.js";
