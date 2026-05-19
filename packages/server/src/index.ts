#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { serve } from "@hono/node-server";
import { createLifecoach, findWorkspaceRoot } from "@lifecoach/core";
dotenv.config({ path: path.join(findWorkspaceRoot(), ".env"), override: true });

import { chatRoutes } from "./routes/chat.js";
import { profileRoutes } from "./routes/profile.js";
import { memoryRoutes } from "./routes/memory.js";
import { taskRoutes } from "./routes/tasks.js";
import { sourceRoutes } from "./routes/sources.js";
import { statusRoutes } from "./routes/status.js";
import { ingestRoutes } from "./routes/ingest.js";
import { loadAuthConfig, requireAuth } from "./middleware/auth.js";

const lc = createLifecoach();
const authConfig = loadAuthConfig();

const app = new Hono();
app.use("*", logger());

// Dev-mode CORS for the Vite dev server. In production the server serves the
// built frontend directly, so this is a no-op for same-origin requests.
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin ?? "*",
    credentials: true,
  }),
);

// API routes — all under /api.
const api = new Hono();
api.use("*", requireAuth(authConfig));
api.route("/chat", chatRoutes(lc));
api.route("/profile", profileRoutes(lc));
api.route("/memory", memoryRoutes(lc));
api.route("/tasks", taskRoutes(lc));
api.route("/sources", sourceRoutes(lc));
api.route("/status", statusRoutes(lc));
api.route("/ingest", ingestRoutes(lc));
app.route("/api", api);

app.get("/health", (c) => c.text("ok"));

// Static frontend bundle — only served when the built dist exists. In dev,
// Vite serves the frontend on a separate port and proxies /api here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, "../../web/dist");
if (fs.existsSync(webDist)) {
  app.use(
    "/*",
    serveStatic({
      root: path.relative(process.cwd(), webDist),
    }),
  );
  // SPA fallback — let TanStack Router handle unknown routes client-side.
  app.notFound((c) => {
    const indexPath = path.join(webDist, "index.html");
    if (fs.existsSync(indexPath)) {
      return c.html(fs.readFileSync(indexPath, "utf8"));
    }
    return c.text("not found", 404);
  });
}

const port = Number(process.env["PORT"] ?? "3717");

const server = serve(
  { fetch: app.fetch, port },
  (info) => {
    const mode = authConfig.permissive ? "permissive (Tailscale-only)" : "email allow-list";
    console.log(`Lifecoach server → http://localhost:${info.port}`);
    console.log(`  auth: ${mode}`);
    console.log(`  todoist: ${lc.todoist ? "connected" : "not configured"}`);
    console.log(`  embedder: ${lc.embedder.enabled ? "on" : "off"}`);
    if (!fs.existsSync(webDist)) {
      console.log(`  web bundle: not built — run \`pnpm --filter @lifecoach/web dev\` for the dev server`);
    }
  },
);

const shutdown = (): void => {
  console.log("\nShutting down…");
  server.close(() => {
    lc.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
