import { withRetry } from "../../util/retry.js";
import { LifecoachError } from "../../util/errors.js";

const BASE_URL = "https://api.todoist.com/rest/v2";

// Raw Todoist REST v2 shapes — we only model the fields we use.
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

export class TodoistClient {
  constructor(private readonly apiToken: string) {
    if (!apiToken) throw new LifecoachError("TodoistClient requires an API token", "TODOIST_NO_TOKEN");
  }

  async listActiveTasks(): Promise<TodoistTask[]> {
    return this.request<TodoistTask[]>("GET", "/tasks");
  }

  async listProjects(): Promise<TodoistProject[]> {
    return this.request<TodoistProject[]>("GET", "/projects");
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
          body: body !== undefined ? JSON.stringify(body) : undefined,
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
