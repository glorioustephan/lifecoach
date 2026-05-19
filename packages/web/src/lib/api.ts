// Same-origin fetch helpers. In dev, Vite proxies /api → http://localhost:3717.

export interface StatusResponse {
  model: string;
  embedder: { enabled: boolean; dim: number };
  todoist: boolean;
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
  };
  lastSession: { id: string; startedAt: number } | null;
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
};
