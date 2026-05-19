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

export const api = {
  status: () => get<StatusResponse>("/api/status"),
  profile: () => get<{ profile: { key: string; value: unknown; updatedAt: number }[] }>("/api/profile"),
  documents: () => get<{ documents: DocumentRow[] }>("/api/memory/documents"),
  forgetDocument: (id: string) =>
    del<{ result: ForgetDocumentResult }>(`/api/memory/documents/${encodeURIComponent(id)}`),
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
