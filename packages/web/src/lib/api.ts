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

export const api = {
  status: () => get<StatusResponse>("/api/status"),
  profile: () => get<{ profile: { key: string; value: unknown; updatedAt: number }[] }>("/api/profile"),
  recentSessions: () => get<{ sessions: { id: string; startedAt: number; summary: string | null }[] }>("/api/chat/sessions"),
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
