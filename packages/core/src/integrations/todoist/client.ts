import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

/**
 * Todoist's REST v2 surface (api.todoist.com/rest/v2) was deprecated and removed
 * in 2025/2026 in favor of the unified `/api/v1` namespace. Two changes matter
 * to callers:
 *   - Base path is now `/api/v1`
 *   - List endpoints (tasks, projects) return cursor-paginated envelopes
 *     `{ results: [...], next_cursor: null | string }` instead of bare arrays.
 *
 * Single-resource endpoints (POST /tasks, GET /tasks/{id}, /close, /reopen)
 * still return the bare object — so we only paginate where needed.
 */
const BASE_URL = "https://api.todoist.com/api/v1";

// Raw Todoist v1 shapes — we only model the fields we use.
export interface TodoistDue {
  date: string;
  string: string;
  datetime?: string | null;
  timezone?: string | null;
  is_recurring?: boolean;
}

export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  project_id?: string;
  parent_id?: string | null;
  section_id?: string | null;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  due?: TodoistDue | null;
  url?: string;
  is_completed?: boolean;
  created_at?: string;
}

export interface TodoistProject {
  id: string;
  name: string;
  color?: string;
  is_favorite?: boolean;
  is_inbox_project?: boolean;
}

export interface CreateTodoistTaskInput {
  content: string;
  description?: string;
  projectId?: string;
  labels?: string[];
  priority?: 1 | 2 | 3 | 4;
  dueString?: string;
}

interface PaginatedResponse<T> {
  results: T[];
  next_cursor?: string | null;
}

const PAGE_LIMIT = 200; // upper bound per page; Todoist caps individual page sizes anyway

export class TodoistClient {
  constructor(private readonly apiToken: string) {
    if (!apiToken) throw new LifecoachError("TodoistClient requires an API token", "TODOIST_NO_TOKEN");
  }

  async listActiveTasks(): Promise<TodoistTask[]> {
    return this.paginate<TodoistTask>("/tasks", { limit: String(PAGE_LIMIT) });
  }

  async listProjects(): Promise<TodoistProject[]> {
    return this.paginate<TodoistProject>("/projects", { limit: String(PAGE_LIMIT) });
  }

  async getTask(id: string): Promise<TodoistTask | null> {
    try {
      return await this.request<TodoistTask>("GET", `/tasks/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof TodoistApiError && err.status === 404) return null;
      throw err;
    }
  }

  async createTask(input: CreateTodoistTaskInput): Promise<TodoistTask> {
    const body: Record<string, unknown> = { content: input.content };
    if (input.description) body["description"] = input.description;
    if (input.projectId) body["project_id"] = input.projectId;
    if (input.labels && input.labels.length > 0) body["labels"] = input.labels;
    if (input.priority) body["priority"] = input.priority;
    if (input.dueString) body["due_string"] = input.dueString;
    return this.request<TodoistTask>("POST", "/tasks", body);
  }

  async updateTask(
    id: string,
    patch: Partial<{
      content: string;
      description: string;
      labels: string[];
      priority: 1 | 2 | 3 | 4;
      dueString: string;
    }>,
  ): Promise<TodoistTask> {
    const body: Record<string, unknown> = {};
    if (patch.content !== undefined) body["content"] = patch.content;
    if (patch.description !== undefined) body["description"] = patch.description;
    if (patch.labels !== undefined) body["labels"] = patch.labels;
    if (patch.priority !== undefined) body["priority"] = patch.priority;
    if (patch.dueString !== undefined) body["due_string"] = patch.dueString;
    return this.request<TodoistTask>("POST", `/tasks/${encodeURIComponent(id)}`, body);
  }

  async completeTask(id: string): Promise<void> {
    await this.request<unknown>("POST", `/tasks/${encodeURIComponent(id)}/close`);
  }

  async reopenTask(id: string): Promise<void> {
    await this.request<unknown>("POST", `/tasks/${encodeURIComponent(id)}/reopen`);
  }

  /**
   * Walk all pages of a paginated GET endpoint. Stops when next_cursor is
   * null/missing. Includes a safety cap so a server-side bug can't cause an
   * unbounded fetch loop (~5000 items via 25 pages of 200).
   */
  private async paginate<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | null | undefined = null;
    for (let page = 0; page < 25; page += 1) {
      const params = new URLSearchParams(query);
      if (cursor) params.set("cursor", cursor);
      const url = `${path}?${params.toString()}`;
      const resp = await this.request<PaginatedResponse<T>>("GET", url);
      if (Array.isArray(resp)) {
        // Defensive: if Todoist ever returns a bare array on this endpoint,
        // accept it gracefully.
        out.push(...(resp as unknown as T[]));
        return out;
      }
      out.push(...(resp.results ?? []));
      cursor = resp.next_cursor ?? null;
      if (!cursor) break;
    }
    return out;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    return withRetry(
      async () => {
        const resp = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
            "X-Request-Id": cryptoRandomId(),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          const err = new TodoistApiError(
            `Todoist ${method} ${path} failed: ${resp.status} ${resp.statusText}${
              text ? ` — ${text.slice(0, 200)}` : ""
            }`,
            resp.status,
          );
          throw err;
        }
        if (resp.status === 204) return undefined as T;
        const ct = resp.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return undefined as T;
        return (await resp.json()) as T;
      },
      { maxAttempts: 4 },
    );
  }
}

export class TodoistApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TodoistApiError";
    this.status = status;
  }
}

// X-Request-Id is recommended by Todoist for idempotency / debugging.
const cryptoRandomId = (): string => {
  // Avoid pulling node:crypto here — fetch ships in modern Node with global crypto.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};
