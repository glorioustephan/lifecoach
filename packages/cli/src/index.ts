#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { findWorkspaceRoot } from "@lifecoach/core";
// Two failure modes we need to handle simultaneously:
//   1. Shell has `ANTHROPIC_API_KEY=""` exported (common in dev shells). The
//      empty value masks the real key in .env. → Need to override it.
//   2. User passes a legitimate command-line env var like
//      `LIFECOACH_DATA_DIR=/path/to/restore lifecoach import …`. → Must NOT
//      be overridden by .env.
// Solution: parse .env first, then for each key copy it into process.env
// only when the existing value is unset OR an empty string.
const envPath = path.join(findWorkspaceRoot(), ".env");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    const existing = process.env[k];
    if (existing === undefined || existing === "") process.env[k] = v;
  }
}

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
import { registerExport, registerImport } from "./commands/snapshot.js";

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
registerExport(program);
registerImport(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
