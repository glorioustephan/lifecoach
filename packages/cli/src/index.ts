#!/usr/bin/env node
import { findWorkspaceRoot, loadEnvironmentConfig } from "@lifecoach/core";

// Load environment-specific config (.env.{env} or .env)
// Handles overriding empty shell env vars while preserving legitimate CLI overrides
loadEnvironmentConfig(findWorkspaceRoot());

import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerChat } from "./commands/chat.js";
import { registerQuery } from "./commands/query.js";
import { registerStatus } from "./commands/status.js";
import { registerIngest } from "./commands/ingest.js";
import { registerWatch } from "./commands/watch.js";
import { registerSync } from "./commands/sync.js";
import { registerForget } from "./commands/forget.js";
import { registerReflect } from "./commands/reflect.js";
import { registerInsights } from "./commands/insights.js";
import { registerGoalReview } from "./commands/goal-review.js";
import { registerArtifacts } from "./commands/artifacts.js";
import { registerExport, registerImport } from "./commands/snapshot.js";
import { registerReset } from "./commands/reset.js";

const program = new Command();

program
  .name("lifecoach")
  .description("Personal life/health coach agent")
  .version("0.0.1");

registerInit(program);
registerChat(program);
registerQuery(program);
registerStatus(program);
registerIngest(program);
registerWatch(program);
registerSync(program);
registerForget(program);
registerReflect(program);
registerInsights(program);
registerGoalReview(program);
registerArtifacts(program);
registerExport(program);
registerImport(program);
registerReset(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
