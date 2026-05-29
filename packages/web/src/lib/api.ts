// Same-origin fetch helpers. In dev, Vite proxies /api → http://localhost:3717.
//
// Domain shapes are derived from `@lifecoach/schemas` so any rename or field
// addition in the canonical schema surfaces here as a TypeScript error rather
// than silently drifting between layers. Where the HTTP response is an
// intentional projection of the full schema entity, we use `Pick<...>` rather
// than redeclaring fields.
import type {
  Account,
  Transaction,
  Holding,
  Budget,
  GoalKind,
  GoalCadence,
  GoalReviewCadence,
  InsightState as SchemaInsightState,
  Habit,
  HabitCompletion,
} from "@lifecoach/schemas";

export type { GoalKind, GoalCadence, GoalReviewCadence } from "@lifecoach/schemas";

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

// ─── Financial (Monarch Money) ───────────────────────────────────────────────
// HTTP projections of the canonical `@lifecoach/schemas` entities. Using
// `Pick<>` rather than redeclaring keeps these locked to the schema — a
// rename of `displayName` → `name` upstream breaks the build here.

export type FinancialAccount = Pick<
  Account,
  "id" | "displayName" | "type" | "balance" | "status" | "institution" | "syncedAt"
>;

export type FinancialTransaction = Pick<
  Transaction,
  "id" | "date" | "merchant" | "amount" | "category" | "isPending"
>;

export type FinancialHolding = Pick<
  Holding,
  "id" | "symbol" | "quantity" | "currentPrice" | "marketValue" | "costBasis"
>;

export type FinancialBudget = Pick<Budget, "id" | "category" | "month" | "limit" | "spent">;

/**
 * Financial insights are now the finance-tagged subset of unified inbox
 * insights (same shape as InsightRow), so the Finances page can render them
 * with the same Discuss / Acted / Dismiss / Snooze lifecycle as the Inbox.
 */
export type FinancialInsightRow = InsightRow;

export interface MonarchSettings {
  hasCredentials: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

export interface MonarchSyncResult {
  accountsFetched: number;
  accountsUpserted: number;
  transactionsFetched: number;
  transactionsUpserted: number;
  transactionsUnlinked: number;
  holdingsSnapshotted: number;
  startedAt: number;
  completedAt: number;
  success: boolean;
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

export interface FactRow {
  id: string;
  category: string;
  subject: string;
  body: string;
  confidence: number;
  validFrom: number | null;
  validTo: number | null;
  createdAt: number;
}

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

// `"all"` is a query-filter sentinel, not a row state, so we widen the
// canonical schema type rather than redeclare it.
export type InsightState = SchemaInsightState | "all";

export interface GoalRow {
  id: string;
  title: string;
  body: string | null;
  horizon: "this-week" | "this-month" | "this-quarter" | "this-year" | "open";
  status: "active" | "paused" | "done" | "abandoned";
  kind: GoalKind;
  cadence: GoalCadence | null;
  outcome: string | null;
  obstacle: string | null;
  implementationIntention: string | null;
  identityStatement: string | null;
  successCriteria: string | null;
  parentGoalId: string | null;
  projectId: string | null;
  targetMetric: string | null;
  targetValue: number | null;
  currentProgress: number | null;
  reviewCadence: GoalReviewCadence;
  lastReviewedAt: number | null;
  archivedAt: number | null;
  dueAt: number | null;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type GoalSignalKind = "quantitative" | "qualitative";

export interface GoalSignalRow {
  id: string;
  goalId: string;
  label: string;
  kind: GoalSignalKind;
  metric: string | null;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  createdAt: number;
  updatedAt: number;
}

export type GoalEvidenceOrigin = "manual" | "conversation" | "cron";

export interface GoalEvidenceRow {
  id: string;
  goalId: string;
  milestoneId: string | null;
  signalId: string | null;
  body: string;
  sourceRefType:
    | "message"
    | "task"
    | "milestone"
    | "measurement"
    | "reflection"
    | "manual"
    | null;
  sourceRefId: string | null;
  delta: number | null;
  recordedAt: number;
  origin: GoalEvidenceOrigin;
  confidence: number | null;
  createdAt: number;
}

export interface TaskRow {
  id: string;
  content: string;
  description: string | null;
  projectName: string | null;
  labels: string[];
  priority: number | null;
  dueAt: number | null;
  dueString: string | null;
  completedAt: number | null;
  goalId: string | null;
  milestoneId: string | null;
}

export type MilestoneStatus = "pending" | "active" | "done" | "abandoned";

export interface MilestoneRow {
  id: string;
  goalId: string;
  title: string;
  body: string | null;
  status: MilestoneStatus;
  orderIndex: number;
  dueAt: number | null;
  completedAt: number | null;
  origin: "manual" | "conversation" | "cron";
  confidence: number | null;
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
  updateFact: (
    id: string,
    patch: Partial<{
      subject: string;
      body: string;
      category: string;
      confidence: number;
    }>,
  ) => patchJson<{ fact: FactRow }>(`/api/memory/facts/${encodeURIComponent(id)}`, patch),
  forgetFact: (id: string) =>
    del<{ ok: true }>(`/api/memory/facts/${encodeURIComponent(id)}`),
  reflections: () => get<{ reflections: ReflectionRow[] }>("/api/memory/reflections"),
  generateReflection: (kind: "daily" | "weekly" | "monthly") =>
    postJson<{ reflection: ReflectionRow | null }>("/api/memory/reflections/generate", { kind }),
  inbox: (
    opts: { state?: InsightState; page?: number; limit?: number } = {},
  ) => {
    const params = new URLSearchParams();
    params.set("state", opts.state ?? "active");
    params.set("limit", String(opts.limit ?? 50));
    if (opts.page !== undefined) params.set("page", String(opts.page));
    return get<{ insights: InsightRow[]; total: number }>(
      `/api/inbox?${params.toString()}`,
    );
  },
  generateInsights: () => postJson<{ insights: InsightRow[] }>("/api/inbox/generate", {}),
  actInsight: (id: string) =>
    postJson<{ ok: true }>(`/api/inbox/${encodeURIComponent(id)}/act`, {}),
  dismissInsight: (id: string) =>
    postJson<{ ok: true }>(`/api/inbox/${encodeURIComponent(id)}/dismiss`, {}),
  snoozeInsight: (id: string, until: string | number) =>
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
    kind?: GoalKind;
    cadence?: GoalCadence;
    outcome?: string;
    obstacle?: string;
    implementationIntention?: string;
    identityStatement?: string;
    reviewCadence?: GoalReviewCadence;
    horizon?: GoalRow["horizon"];
    successCriteria?: string;
    targetMetric?: string;
    targetValue?: number;
    dueAt?: number;
    projectId?: string;
  }) => postJson<{ goal: GoalRow }>("/api/goals", body),
  updateGoal: (
    id: string,
    patch: Partial<{
      title: string;
      status: GoalRow["status"];
      currentProgress: number | null;
      body: string | null;
      horizon: GoalRow["horizon"];
      kind: GoalKind;
      cadence: GoalCadence | null;
      outcome: string | null;
      obstacle: string | null;
      implementationIntention: string | null;
      identityStatement: string | null;
      successCriteria: string | null;
      reviewCadence: GoalReviewCadence;
      targetMetric: string | null;
      targetValue: number | null;
      dueAt: number | null;
    }>,
  ) => patchJson<{ goal: GoalRow }>(`/api/goals/${encodeURIComponent(id)}`, patch),
  archiveGoal: (id: string) =>
    postJson<{ goal: GoalRow }>(`/api/goals/${encodeURIComponent(id)}/archive`, {}),
  unarchiveGoal: (id: string) =>
    postJson<{ goal: GoalRow }>(`/api/goals/${encodeURIComponent(id)}/unarchive`, {}),
  // Milestones nested under goals
  goalMilestones: (goalId: string) =>
    get<{ milestones: MilestoneRow[] }>(
      `/api/goals/${encodeURIComponent(goalId)}/milestones`,
    ),
  /**
   * Batch milestone lookup for the goals page — one round-trip instead of
   * N. Returns an object keyed by goal id; goals with no milestones are
   * omitted, so callers should default with `?? []`.
   */
  goalMilestonesBatch: (goalIds: string[]) =>
    get<{ milestonesByGoal: Record<string, MilestoneRow[]> }>(
      `/api/goals/milestones/batch?goalIds=${goalIds.map(encodeURIComponent).join(",")}`,
    ),
  createMilestone: (
    goalId: string,
    body: { title: string; body?: string; dueAt?: number; orderIndex?: number },
  ) =>
    postJson<{ milestone: MilestoneRow }>(
      `/api/goals/${encodeURIComponent(goalId)}/milestones`,
      body,
    ),
  updateMilestone: (
    goalId: string,
    id: string,
    patch: Partial<{
      title: string;
      body: string | null;
      status: MilestoneStatus;
      orderIndex: number;
      dueAt: number | null;
    }>,
  ) =>
    patchJson<{ milestone: MilestoneRow }>(
      `/api/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(id)}`,
      patch,
    ),
  deleteMilestone: (goalId: string, id: string) =>
    del<{ ok: true }>(
      `/api/goals/${encodeURIComponent(goalId)}/milestones/${encodeURIComponent(id)}`,
    ),
  reorderMilestones: (goalId: string, ids: string[]) =>
    postJson<{ milestones: MilestoneRow[] }>(
      `/api/goals/${encodeURIComponent(goalId)}/milestones/reorder`,
      { ids },
    ),
  // Signals
  goalSignals: (goalId: string) =>
    get<{ signals: GoalSignalRow[] }>(
      `/api/goals/${encodeURIComponent(goalId)}/signals`,
    ),
  createGoalSignal: (
    goalId: string,
    body: {
      label: string;
      kind?: GoalSignalKind;
      metric?: string;
      targetValue?: number;
      unit?: string;
    },
  ) =>
    postJson<{ signal: GoalSignalRow }>(
      `/api/goals/${encodeURIComponent(goalId)}/signals`,
      body,
    ),
  updateGoalSignal: (
    goalId: string,
    id: string,
    patch: Partial<{
      label: string;
      kind: GoalSignalKind;
      metric: string | null;
      targetValue: number | null;
      currentValue: number | null;
      unit: string | null;
    }>,
  ) =>
    patchJson<{ signal: GoalSignalRow }>(
      `/api/goals/${encodeURIComponent(goalId)}/signals/${encodeURIComponent(id)}`,
      patch,
    ),
  deleteGoalSignal: (goalId: string, id: string) =>
    del<{ ok: true }>(
      `/api/goals/${encodeURIComponent(goalId)}/signals/${encodeURIComponent(id)}`,
    ),
  // Evidence
  goalEvidence: (goalId: string, limit = 100) =>
    get<{ evidence: GoalEvidenceRow[] }>(
      `/api/goals/${encodeURIComponent(goalId)}/evidence?limit=${limit}`,
    ),
  createGoalEvidence: (
    goalId: string,
    body: {
      body: string;
      milestoneId?: string;
      signalId?: string;
      delta?: number;
      recordedAt?: number;
    },
  ) =>
    postJson<{ evidence: GoalEvidenceRow }>(
      `/api/goals/${encodeURIComponent(goalId)}/evidence`,
      body,
    ),
  deleteGoalEvidence: (goalId: string, id: string) =>
    del<{ ok: true }>(
      `/api/goals/${encodeURIComponent(goalId)}/evidence/${encodeURIComponent(id)}`,
    ),
  linkTaskToGoal: (
    taskId: string,
    body: { goalId: string | null; milestoneId?: string | null },
  ) =>
    postJson<{ task: { id: string; goalId: string | null; milestoneId: string | null } }>(
      `/api/tasks/${encodeURIComponent(taskId)}/link`,
      body,
    ),
  createProject: (body: { title: string; body?: string; targetDate?: number }) =>
    postJson<{ project: ProjectRow }>("/api/goals/projects", body),
  tasks: (
    opts: {
      status?: "active" | "completed" | "overdue" | "all";
      limit?: number;
      page?: number;
      projectId?: string;
    } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.page) params.set("page", String(opts.page));
    if (opts.projectId) params.set("projectId", opts.projectId);
    const qs = params.toString();
    return get<{ tasks: TaskRow[]; total: number }>(
      `/api/tasks${qs ? `?${qs}` : ""}`,
    );
  },
  completeTask: (id: string) =>
    postJson<{ ok: true }>(`/api/tasks/${encodeURIComponent(id)}/complete`, {}),
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
      goals: {
        active: Array<{
          goal: GoalRow;
          nextTask: TaskRow | null;
          nextMilestone: MilestoneRow | null;
          lastEvidenceAt: number | null;
          stalled: boolean;
        }>;
        totalActive: number;
      };
      insights: InsightRow[];
      reflection: {
        id: string;
        kind: string;
        period_start: number;
        period_end: number;
        body: string;
        created_at: number;
      } | null;
      finance: BriefingFinanceTile | null;
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
        toolUse?: {
          name: string;
          input?: Record<string, unknown>;
          output?: unknown;
          error?: string;
        };
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
        accounts?: number;
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

  // ─── Import / Export ──────────────────────────────────────────────────────
  /**
   * Upload markdown files and/or .zip archives of markdown to ingest. The server
   * streams newline-delimited JSON progress; `onProgress` fires per file with
   * {done,total}. Resolves with the final totals.
   */
  importMarkdown: async (
    files: File[],
    onProgress?: (p: { done: number; total: number }) => void,
    extract = false,
  ): Promise<{ imported: number; skipped: number; failed: number; errors: string[] }> => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    form.append("extract", String(extract));
    const resp = await fetch("/api/ingest/import", { method: "POST", body: form });
    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Import failed: ${resp.status} ${text}`.trim());
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let final = { imported: 0, skipped: 0, failed: 0, errors: [] as string[] };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: {
          type?: string;
          done?: number;
          total?: number;
          imported?: number;
          skipped?: number;
          failed?: number;
          errors?: string[];
        };
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === "start") onProgress?.({ done: 0, total: evt.total ?? 0 });
        else if (evt.type === "progress") onProgress?.({ done: evt.done ?? 0, total: evt.total ?? 0 });
        else if (evt.type === "done") {
          final = {
            imported: evt.imported ?? 0,
            skipped: evt.skipped ?? 0,
            failed: evt.failed ?? 0,
            errors: evt.errors ?? [],
          };
        }
      }
    }
    return final;
  },
  /** URL for the markdown backup download (let the browser handle it via <a download>). */
  exportUrl: "/api/export",

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
    postJson<{
      created: ArtifactRow[];
      candidateSessions: number;
      candidateDocuments: number;
      documentsScanned: number;
    }>("/api/artifacts/generate", {}),
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

  // ─── Financial (Monarch Money) ────────────────────────────────────────────
  monarchSettings: () => get<MonarchSettings>("/api/sources/monarch/settings"),
  saveMonarchCredentials: (body: { email: string; password: string; mfaSecret?: string }) =>
    postJson<{ ok: true; settings: MonarchSettings }>("/api/sources/monarch/credentials", body),
  syncMonarch: () =>
    postJson<{ result?: MonarchSyncResult; skipped?: boolean }>("/api/sources/monarch/sync", {}),
  financialAccounts: () =>
    get<{
      accounts: FinancialAccount[];
      totalAssets: number;
      totalLiabilities: number;
      netWorth: number;
    }>("/api/financial/accounts"),
  financialNetWorth: () =>
    get<{ totalAssets: number; totalLiabilities: number; netWorth: number }>(
      "/api/financial/net-worth",
    ),
  financialTransactions: (limit = 50) =>
    get<{ transactions: FinancialTransaction[] }>(`/api/financial/transactions?limit=${limit}`),
  financialBudgets: (month?: string) =>
    get<{ budgets: FinancialBudget[] }>(
      `/api/financial/budgets${month ? `?month=${encodeURIComponent(month)}` : ""}`,
    ),
  financialHoldings: () =>
    get<{
      holdings: FinancialHolding[];
      marketValue: number;
      costBasis: number;
      gain: number;
    }>("/api/financial/holdings"),
  financialInsights: () =>
    get<{ insights: FinancialInsightRow[] }>("/api/financial/insights"),
  financialSavingsRateMtd: () =>
    get<{ income: number; expenses: number; savingsRate: number | null; daysInWindow: number }>(
      "/api/financial/savings-rate-mtd",
    ),

  /**
   * One-time historical backfill from a Monarch CSV export. Only rows older
   * than the live 90-day sync window are upserted (synthetic external IDs make
   * re-uploads idempotent). Returns counts so the UI can show what happened.
   */
  /**
   * Bulk-create a goal (optional) + habits + tasks from the ProposalReviewModal.
   * Single server-side transaction — all rows succeed or none do.
   */
  proposeBulk: (body: {
    goalToCreate?: { title: string; kind: "outcome" | "process" | "identity"; outcome?: string };
    parentGoalId?: string;
    items: Array<
      | { type: "habit"; title: string; cadence: "daily" | "weekly" | "monthly"; notes?: string }
      | { type: "task"; title: string; dueAt?: number; notes?: string }
    >;
  }) => postJson<ProposeBulkResult>("/api/propose/bulk", body),

  // ─── Habits API ─────────────────────────────────────────────────────────────

  habits: (opts: { status?: HabitRow["status"]; parentGoalId?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.parentGoalId) params.set("parentGoalId", opts.parentGoalId);
    const qs = params.toString();
    return get<{ habits: HabitRow[] }>(`/api/habits${qs ? `?${qs}` : ""}`);
  },

  habit: (id: string) =>
    get<{ habit: HabitRow; recentCompletions: HabitCompletionRow[] }>(
      `/api/habits/${encodeURIComponent(id)}`,
    ),

  createHabit: (input: {
    title: string;
    cadence: HabitRow["cadence"];
    parentGoalId?: string;
    parentMilestoneId?: string;
    notes?: string;
    status?: HabitRow["status"];
  }) => postJson<{ habit: HabitRow }>("/api/habits", input),

  updateHabit: (
    id: string,
    patch: Partial<{
      title: string;
      cadence: HabitRow["cadence"];
      status: HabitRow["status"];
      parentGoalId: string | null;
      parentMilestoneId: string | null;
      notes: string | null;
    }>,
  ) => patchJson<{ habit: HabitRow }>(`/api/habits/${encodeURIComponent(id)}`, patch),

  archiveHabit: (id: string) =>
    del<{ ok: true }>(`/api/habits/${encodeURIComponent(id)}`),

  completeHabit: (id: string, opts: { date?: string; notes?: string } = {}) =>
    postJson<{ completion: HabitCompletionRow }>(
      `/api/habits/${encodeURIComponent(id)}/complete`,
      opts,
    ),

  uncompleteHabit: (id: string, completionId: string) =>
    del<{ ok: true }>(
      `/api/habits/${encodeURIComponent(id)}/completions/${encodeURIComponent(completionId)}`,
    ),

  habitMonth: (id: string, year: number, month: number) => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    return get<{ completions: Record<string, number> }>(
      `/api/habits/${encodeURIComponent(id)}/month?${params.toString()}`,
    );
  },

  habitMonthBatch: (habitIds: string[], year: number, month: number) => {
    const params = new URLSearchParams({
      habitIds: habitIds.map(encodeURIComponent).join(","),
      year: String(year),
      month: String(month),
    });
    return get<{ byHabit: Record<string, Record<string, number>> }>(
      `/api/habits/month-batch?${params.toString()}`,
    );
  },

  backfillMonarchCsv: async (file: File): Promise<MonarchBackfillResponse> => {
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch("/api/financial/backfill", { method: "POST", body: form });
    const data = (await resp.json().catch(() => ({}))) as
      | { error?: string; hint?: string }
      | MonarchBackfillResponse;
    if (!resp.ok) {
      const err = data as { error?: string; hint?: string };
      throw new Error(err.error ? `${err.error}${err.hint ? ` — ${err.hint}` : ""}` : `${resp.status} ${resp.statusText}`);
    }
    return data as MonarchBackfillResponse;
  },
};

// ─── Habits ───────────────────────────────────────────────────────────────────
// Pick<> projections of canonical @lifecoach/schemas types.
// Adding a field upstream will surface here as a TS error rather than silent drift.

export type HabitRow = Pick<
  Habit,
  | "id"
  | "title"
  | "cadence"
  | "status"
  | "parentGoalId"
  | "parentMilestoneId"
  | "notes"
  | "lastCompletedAt"
  | "createdAt"
  | "updatedAt"
>;

export type HabitCompletionRow = Pick<
  HabitCompletion,
  "id" | "habitId" | "completedAt" | "notes" | "origin" | "createdAt"
>;

// ─── Propose bulk-create ──────────────────────────────────────────────────────

export interface ProposeBulkResult {
  goal?: GoalRow;
  habits: HabitRow[];
  tasks: TaskRow[];
}

export type BriefingFinanceTile =
  | {
      kind: "net_worth_delta";
      currentValue: number;
      deltaAmount: number;
      deltaPercent: number;
      windowDays: number;
    }
  | {
      kind: "insight";
      insightId: string;
      topic: string;
      priority: 1 | 2 | 3;
    };

export interface MonarchBackfillResponse {
  result: {
    totalRows: number;
    transactionsUpserted: number;
    inLiveWindowSkipped: number;
    accountsCreated: number;
    measurementsSeeded: number;
    measurementsAlreadyPresent: number;
    skippedRows: number;
  };
}
