#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { findWorkspaceRoot } from "@lifecoach/core";
// Override empty (or unset) values from .env, but never clobber legit
// command-line env vars.
const envPath = path.join(findWorkspaceRoot(), ".env");
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) {
    const existing = process.env[k];
    if (existing === undefined || existing === "") process.env[k] = v;
  }
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createLifecoach } from "@lifecoach/core";
import { registerMemoryTools } from "./tools.js";

const main = async (): Promise<void> => {
  const lc = createLifecoach();
  const server = new McpServer({
    name: "lifecoach",
    version: "0.0.1",
  });

  registerMemoryTools(server, lc.memory);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } finally {
      lc.close();
      process.exit(0);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
