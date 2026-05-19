#!/usr/bin/env node
import path from "node:path";
import dotenv from "dotenv";
import { findWorkspaceRoot } from "@lifecoach/core";
// `override: true` so .env wins over shadow shell values (e.g., a stray empty
// ANTHROPIC_API_KEY="" exported in shell config that would otherwise mask the
// real key in .env).
dotenv.config({ path: path.join(findWorkspaceRoot(), ".env"), override: true });

import { Command } from "commander";
import { registerInit } from "./commands/init.js";
import { registerChat } from "./commands/chat.js";
import { registerQuery } from "./commands/query.js";
import { registerStatus } from "./commands/status.js";
import { registerIngest } from "./commands/ingest.js";

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

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
