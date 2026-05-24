import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { Hono } from "hono";
import { findWorkspaceRoot, getArtifactSettings, type Lifecoach } from "@lifecoach/core";

type DeploymentStatus = {
  gitSha: string;
  gitBranch: string;
  builtAt: string | null;
  dataDir: string;
  environment: string;
};

const readGitValue = (root: string, args: string[]): string | null => {
  try {
    const value = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

const envValue = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const deploymentStatus = (lc: Lifecoach): DeploymentStatus => {
  const root = findWorkspaceRoot();
  const dataDir = path.relative(root, lc.config.dataDir) || ".";
  const environment =
    envValue("LIFECOACH_ENV") ?? envValue("NODE_ENV") ?? "development";

  return {
    gitSha:
      envValue("LIFECOACH_GIT_SHA") ??
      readGitValue(root, ["rev-parse", "--short", "HEAD"]) ??
      "unknown",
    gitBranch:
      envValue("LIFECOACH_GIT_BRANCH") ??
      readGitValue(root, ["branch", "--show-current"]) ??
      "unknown",
    builtAt: envValue("LIFECOACH_BUILD_TIME"),
    dataDir,
    environment,
  };
};

export const statusRoutes = (lc: Lifecoach) => {
  const app = new Hono();
  const deployment = deploymentStatus(lc);

  app.get("/", (c) => {
    const recent = lc.memory.episodic.recentSessions(1)[0];
    const artifactSettings = getArtifactSettings(lc.storage);
    return c.json({
      deployment,
      model: lc.config.model,
      embedder: { enabled: lc.embedder.enabled, dim: lc.config.embeddingDim },
      todoist: lc.todoist != null,
      capacities: lc.capacities != null,
      artifactsAutoExtract: artifactSettings.enabled,
      counts: {
        profileEntries: lc.memory.identity.entries().length,
        facts: lc.storage.facts.count(),
        documents: lc.storage.documents.count(),
        measurements: lc.storage.measurements.count(),
        embeddings: lc.storage.embeddings.count(),
        reflections: lc.storage.reflections.count(),
        insights: lc.storage.insights.count(),
        sessions: lc.storage.sessions.count(),
        messages: lc.storage.messages.count(),
        activeTasks: lc.storage.tasks.list({ status: "active", limit: 1_000_000 }).length,
        artifacts: lc.storage.artifacts.count(),
      },
      lastSession: recent
        ? { id: recent.id, startedAt: recent.startedAt }
        : null,
    });
  });

  return app;
};
