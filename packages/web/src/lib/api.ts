// Same-origin fetch helpers. In dev, Vite proxies /api → http://localhost:3717.

export interface StatusResponse {
  deployment?: {
    gitSha: string;
    gitBranch: string;
    builtAt: string | null;
    dataDir: string;
    environment: string;
  };
  model: string;
  embedder: { enabled: boolean; dim: number };
  todoist: boolean;
  capacities?: boolean;
  artifactsAutoExtract?: boolean;
  counts: {
    profileEntries: number;
    facts: number;
    documents: number;
    measurements: number;
    embeddings: number;
    reflections: number;
    insights: number;
    sessions: number;
    messages: number;
    activeTasks: number;
    artifacts?: number;
  };
  lastSession: { id: string; startedAt: number } | null;
}

export type ArtifactOrigin = "conversation" | "cron" | "manual";

export interface ArtifactRow {
  id: string;
  type: string;
  title: string;
  body: string;
  category: string | null;
  tags: string[];
  confidence: number | null;
  origin: ArtifactOrigin;
  sourceSessionId: string | null;
  sourceMessageIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactSettingsRow {
  enabled: boolean;
  autoDisabled: boolean;
  emptyStreak: number;
  lastScanAt: number | null;
}

const get = async <T>(path: string): Promise<T> => {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
};

const del = async <T>(path: string): Promise<T> => {
  const resp = await fetch(path, { method: "DELETE" });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body?.error ?? `${path}: ${resp.status}`);
  }
  return resp.json();
};

export interface DocumentRow {
  id: string;
  source: string;
  mime: string | null;
  title: string | null;
  body_chars: number;
  ingested_at: number;
}

export interface ForgetDocumentResult {
  documentId: string;
  factsRemoved: number;
  measurementsRemoved: number;
  embeddingRefsRemoved: number;
  embeddingVectorsRemoved: number;
  ingestedFilesRemoved: number;
}

export interface ReflectionRow {
  id: string;
  kind: "daily" | "weekly" | "monthly";
  period_start: number;
  period_end: number;
  body: string;
  created_at: number;
}

export interface InsightRow {
  id: string;
  topic: string;
  body: string;
  rationale?: string;
  sourceFactIds: string[];
  priority: 1 | 2 | 3;
  createdAt: number;
  actedOnAt?: number | null;
  dismissedAt?: number | null;
  snoozedUntil?: number | null;
}

export type InsightState = "active" | "acted" | "dismissed" | "snoozed" | "all";

export interface GoalRow {
  id: string;
  title: string;
  body: string | null;
  horizon: "this-week" | "this-month" | "this-quarter" | "this-year" | "open";
  status: "active" | "paused" | "done" | "abandoned";
  successCriteria: string | null;
  parentGoalId: string | null;
  projectId: string | null;
  targetMetric: string | null;
  targetValue: number | null;
  currentProgress: number | null;
  dueAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRow {
  id: string;
  title: string;
  body: string | null;
  status: "active" | "paused" | "done" | "abandoned";
  targetDate: number | null;
  startedAt: number;
  endedAt: number | null;
}

const patchJson = async <T>(path: string, body: unknown): Promise<T> => {
  const resp = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as { error?: string } | T;
  if (!resp.ok) {
    throw new Error(
      ("error" in (data as { error?: string }) && (data as { error: string }).error) ||
        `${path}: ${resp.status}`,
    );
  }
  return data as T;
};

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await resp.json().catch(() => ({}))) as { error?: string } | T;
  if (!resp.ok) {
    throw new Error(("error" in (data as { error?: string }) && (data as { error: string }).error) || `${path}: ${resp.status}`);
  }
  return data as T;
};

export const api = {
  status: () => get<StatusResponse>("/api/status"),
  profile: () => get<{ profile: { key: string; value: unknown; updatedAt: number }[] }>("/api/profile"),
  documents: () => get<{ documents: DocumentRow[] }>("/api/memory/documents"),
  forgetDocument: (id: string) =>
    del<{ result: ForgetDocumentResult }>(`/api/memory/documents/${encodeURIComponent(id)}`),
  reflections: () => get<{ reflections: ReflectionRow[] }>("/api/memory/reflections"),
  generateReflection: (kind: "daily" | "weekly" | "monthly") =>
    postJson<{ reflection: ReflectionRow }>("/api/memory/reflections/generate", { kind }),
  inbox: (state: InsightState = "active") =>
    get<{ insights: InsightRow[] }>(`/api/inbox?state=${encodeURIComponent(state)}&limit=50`),
  generateInsights: () => postJson<{ insights: InsightRow[] }>("/api/inbox/generate", {}),
  actInsight: (id: string) =>
    postJson<{ ok: true }>(`/api/inbox/${encodeURIComponent(id)}/act`, {}),
  dismissInsight: (id: string) =>
    postJson<{ ok: true }>(`/api/inbox/${encodeURIComponent(id)}/dismiss`, {}),
  snoozeInsight: (id: string, until: string) =>
    postJson<{ ok: true; until: number }>(`/api/inbox/${encodeURIComponent(id)}/snooze`, { until }),
  reactivateInsight: (id: string) =>
    postJson<{ ok: true }>(`/api/inbox/${encodeURIComponent(id)}/reactivate`, {}),
  goals: (status: "active" | "paused" | "done" | "abandoned" | "all" = "active") =>
    get<{ goals: GoalRow[] }>(`/api/goals?status=${encodeURIComponent(status)}`),
  projects: (status: "active" | "paused" | "done" | "abandoned" | "all" = "active") =>
    get<{ projects: ProjectRow[] }>(`/api/goals/projects?status=${encodeURIComponent(status)}`),
  createGoal: (body: {
    title: string;
    body?: string;
    horizon?: GoalRow["horizon"];
    successCriteria?: string;
    targetMetric?: string;
    targetValue?: number;
    dueAt?: number;
    projectId?: string;
  }) => postJson<{ goal: GoalRow }>("/api/goals", body),
  updateGoal: (id: string, patch: Partial<{ status: GoalRow["status"]; currentProgress: number; body: string; successCriteria: string; targetValue: number }>) =>
    patchJson<{ goal: GoalRow }>(`/api/goals/${encodeURIComponent(id)}`, patch),
  createProject: (body: { title: string; body?: string; targetDate?: number }) =>
    postJson<{ project: ProjectRow }>("/api/goals/projects", body),
  briefing: () =>
    get<{
      generatedAt: number;
      tasks: {
        overdue: Array<{
          id: string;
          content: string;
          dueAt: number | null;
          dueString: string | null;
          projectName: string | null;
          priority: number | null;
        }>;
        dueToday: Array<{
          id: string;
          content: string;
          dueAt: number | null;
          dueString: string | null;
          projectName: string | null;
          priority: number | null;
        }>;
        totalActive: number;
      };
      goals: { active: GoalRow[]; totalActive: number };
      insights: InsightRow[];
      reflection: {
        id: string;
        kind: string;
        period_start: number;
        period_end: number;
        body: string;
        created_at: number;
      } | null;
    }>("/api/briefing"),
  recentSessions: () =>
    get<{
      sessions: Array<{
        id: string;
        startedAt: number;
        endedAt: number | null;
        summary: string | null;
        messageCount: number;
        preview: string | null;
      }>;
    }>("/api/chat/sessions?limit=50"),
  archivedSessions: () =>
    get<{
      sessions: Array<{
        id: string;
        startedAt: number;
        endedAt: number | null;
        summary: string | null;
        archivedAt: number | null;
        messageCount: number;
        preview: string | null;
      }>;
    }>("/api/chat/sessions?archived=true&limit=50"),
  archiveSession: (id: string) =>
    postJson<{ ok: true }>(`/api/chat/sessions/${encodeURIComponent(id)}/archive`, {}),
  unarchiveSession: (id: string) =>
    postJson<{ ok: true }>(`/api/chat/sessions/${encodeURIComponent(id)}/unarchive`, {}),
  session: (id: string) =>
    get<{
      session: { id: string; startedAt: number };
      messages: {
        id: string;
        sessionId: string;
        role: "user" | "assistant" | "system" | "tool";
        content: string;
        createdAt: number;
      }[];
    }>(`/api/chat/sessions/${encodeURIComponent(id)}`),
  sources: () =>
    get<{
      sources: Array<{
        id: string;
        name: string;
        connected: boolean;
        tasks?: number;
        ingestedFiles?: number;
        watchedPath?: string;
        defaultSpaceId?: string | null;
        mirroredObjects?: number;
      }>;
    }>("/api/sources"),
  syncCapacities: (opts?: { pruneMissing?: boolean; searchTerms?: string[] }) =>
    postJson<{
      result: {
        spacesScanned: number;
        structuresIndexed: number;
        objectsDiscovered: number;
        upserted: number;
        embedded: number;
        removed: number;
        factsRouted: number;
        projectsRouted: number;
        searchTermsUsed: number;
      };
    }>("/api/sources/capacities/sync", opts ?? {}),
  capacitiesSpaces: () =>
    get<{ spaces: Array<{ id: string; title: string; icon?: unknown }> }>(
      "/api/sources/capacities/spaces",
    ),
  syncTodoist: () =>
    postJson<{
      result: {
        fetched: number;
        upserted: number;
        newlyCompleted: number;
        embedded: number;
      };
    }>("/api/sources/todoist/sync", {}),

  // ─── Artifacts ──────────────────────────────────────────────────────────
  artifacts: (params: { type?: string; q?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.q) qs.set("q", params.q);
    qs.set("limit", String(params.limit ?? 20));
    qs.set("offset", String(params.offset ?? 0));
    return get<{ items: ArtifactRow[]; total: number; limit: number; offset: number }>(
      `/api/artifacts?${qs.toString()}`,
    );
  },
  saveArtifactFromMessage: (body: { content: string; sessionId?: string; type?: string }) =>
    postJson<{ artifact: ArtifactRow }>("/api/artifacts/extract", body),
  generateArtifacts: () =>
    postJson<{ created: ArtifactRow[]; candidateSessions: number }>(
      "/api/artifacts/generate",
      {},
    ),
  updateArtifact: (
    id: string,
    patch: Partial<{ title: string; body: string; tags: string[]; category: string | null }>,
  ) => patchJson<{ artifact: ArtifactRow }>(`/api/artifacts/${encodeURIComponent(id)}`, patch),
  deleteArtifact: (id: string) =>
    del<{ ok: true }>(`/api/artifacts/${encodeURIComponent(id)}`),
  artifactToCapacities: (id: string) =>
    postJson<{ ok: true }>(`/api/artifacts/${encodeURIComponent(id)}/capacities`, {}),
  artifactSettings: () =>
    get<{ settings: ArtifactSettingsRow }>("/api/artifacts/settings"),
  setArtifactAutoExtract: (autoExtractEnabled: boolean) =>
    patchJson<{ settings: ArtifactSettingsRow }>("/api/artifacts/settings", {
      autoExtractEnabled,
    }),
};
