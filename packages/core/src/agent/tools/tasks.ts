import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type { Task, TaskPriority } from "@lifecoach/schemas";
import type { TodoistClient } from "../../integrations/index.js";
import { indexTask } from "../../memory/task-indexer.js";
import { LifecoachError } from "../../util/errors.js";

const PRIORITY_LABELS: Record<number, string> = {
  1: "p4",
  2: "p3",
  3: "p2",
  4: "p1",
};

const formatDue = (task: Task): string => {
  if (!task.dueAt) return "no due date";
  const date = new Date(task.dueAt);
  return task.dueString ? `${task.dueString} (${date.toISOString().slice(0, 10)})` : date.toISOString();
};

const renderTask = (task: Task): string => {
  const parts: string[] = [];
  parts.push(`[${task.id.slice(0, 8)}] ${task.content}`);
  const meta: string[] = [];
  if (task.priority) meta.push(PRIORITY_LABELS[task.priority] ?? `p${task.priority}`);
  meta.push(formatDue(task));
  if (task.projectName) meta.push(task.projectName);
  if (task.labels.length > 0) meta.push(task.labels.map((l) => `#${l}`).join(" "));
  parts.push(`    ${meta.join(" · ")}`);
  if (task.description) parts.push(`    ${task.description.split("\n")[0]?.slice(0, 120) ?? ""}`);
  return parts.join("\n");
};

export interface TaskToolDeps {
  storage: Storage;
  embedder: Embedder;
  todoist: TodoistClient | null;
}

/**
 * Resolve a task by either our local id or the upstream external id (Todoist).
 * The agent works with our local ids in normal output, but tolerating the
 * external one is cheap and helps when the user paste-quotes a Todoist URL.
 */
const findTask = (storage: Storage, id: string): Task | undefined => {
  const direct = storage.tasks.get(id);
  if (direct) return direct;
  return storage.tasks.getByExternal("todoist", id);
};

const requireTodoistTask = (storage: Storage, id: string): Task => {
  const task = findTask(storage, id);
  if (!task) {
    throw new LifecoachError(`No task found with id ${id}`, "TASK_NOT_FOUND");
  }
  if (task.externalSource !== "todoist" || !task.externalId) {
    throw new LifecoachError(
      `Task ${id} is not a Todoist-backed task; write-back is only wired for Todoist for now.`,
      "TASK_NOT_TODOIST_BACKED",
    );
  }
  return task;
};

const requireTodoist = (todoist: TodoistClient | null): TodoistClient => {
  if (!todoist) {
    throw new LifecoachError(
      "Todoist is not configured. Add TODOIST_API_TOKEN to .env to enable write-back.",
      "TODOIST_NOT_CONFIGURED",
    );
  }
  return todoist;
};

const parseDueAt = (datetime?: string | null, date?: string | null): number | null => {
  const candidate = datetime ?? date;
  if (!candidate) return null;
  const t = Date.parse(candidate);
  return Number.isNaN(t) ? null : t;
};

export const buildTaskTools = (deps: TaskToolDeps) => [
  tool(
    "list_tasks",
    "List tasks from the user's task system (Todoist, mirrored locally). Use when the user asks about what's on their plate, what's due, what's overdue, or you need task context to make a recommendation.",
    {
      status: z
        .enum(["active", "overdue", "completed", "all"])
        .optional()
        .describe("Default: active"),
      dueBefore: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp — only return tasks due before this"),
      dueAfter: z
        .string()
        .optional()
        .describe("ISO 8601 timestamp — only return tasks due after this"),
      projectId: z.string().optional().describe("Filter to a single project"),
      limit: z.number().int().min(1).max(200).optional().describe("Default: 50"),
    },
    async ({ status, dueBefore, dueAfter, projectId, limit }) => {
      const parseTs = (s?: string): number | undefined => {
        if (!s) return undefined;
        const t = Date.parse(s);
        return Number.isNaN(t) ? undefined : t;
      };
      const tasks = deps.storage.tasks.list({
        status: status ?? "active",
        ...(parseTs(dueBefore) !== undefined ? { dueBefore: parseTs(dueBefore)! } : {}),
        ...(parseTs(dueAfter) !== undefined ? { dueAfter: parseTs(dueAfter)! } : {}),
        ...(projectId ? { projectId } : {}),
        limit: limit ?? 50,
      });
      if (tasks.length === 0) {
        return { content: [{ type: "text", text: "No tasks match." }] };
      }
      const header = `${tasks.length} task${tasks.length === 1 ? "" : "s"} (${status ?? "active"})`;
      const body = tasks.map(renderTask).join("\n");
      return { content: [{ type: "text", text: `${header}\n\n${body}` }] };
    },
  ),

  tool(
    "create_task",
    "Create a new task. Writes to Todoist and mirrors locally so list_tasks reflects it immediately. Use natural-language due strings — Todoist parses them: 'tomorrow', 'every monday', 'in 2 weeks at 3pm'.",
    {
      content: z.string().min(1).describe("Task title"),
      description: z.string().optional(),
      dueString: z.string().optional().describe("Natural-language due, parsed by Todoist"),
      priority: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .optional()
        .describe("Todoist scale: 1=normal, 2=p3, 3=p2, 4=p1/urgent"),
      projectId: z.string().optional(),
      labels: z.array(z.string()).optional(),
    },
    async ({ content, description, dueString, priority, projectId, labels }) => {
      const client = requireTodoist(deps.todoist);
      const created = await client.createTask({
        content,
        ...(description !== undefined ? { description } : {}),
        ...(dueString !== undefined ? { dueString } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(labels !== undefined ? { labels } : {}),
      });
      // Mirror locally so list_tasks sees it.
      const task = deps.storage.tasks.upsertByExternal({
        externalId: created.id,
        externalSource: "todoist",
        content: created.content,
        description: created.description ?? null,
        projectId: created.project_id ?? null,
        projectName: null,
        labels: created.labels ?? [],
        priority: (created.priority ?? null) as TaskPriority | null,
        dueAt: parseDueAt(created.due?.datetime, created.due?.date),
        dueString: created.due?.string ?? null,
        completedAt: null,
        url: created.url ?? null,
      });
      await indexTask(deps.storage, deps.embedder, task);
      return {
        content: [
          { type: "text", text: `Created task ${task.id} → ${task.content}` },
        ],
      };
    },
  ),

  tool(
    "complete_task",
    "Mark a task as completed. Writes to Todoist and updates the local mirror.",
    {
      id: z.string().min(1).describe("Local task id (preferred) or Todoist external id"),
    },
    async ({ id }) => {
      const task = requireTodoistTask(deps.storage, id);
      const client = requireTodoist(deps.todoist);
      await client.completeTask(task.externalId!);
      // Mirror locally — mark completed.
      deps.storage.tasks.upsertByExternal({
        externalId: task.externalId!,
        externalSource: "todoist",
        content: task.content,
        description: task.description ?? null,
        projectId: task.projectId ?? null,
        projectName: task.projectName ?? null,
        labels: task.labels,
        priority: task.priority ?? null,
        dueAt: task.dueAt ?? null,
        dueString: task.dueString ?? null,
        completedAt: Date.now(),
        url: task.url ?? null,
      });
      return {
        content: [{ type: "text", text: `Completed: ${task.content}` }],
      };
    },
  ),

  tool(
    "reschedule_task",
    "Change a task's due date. Pass a natural-language due string that Todoist will parse ('tomorrow at 10am', 'next monday', 'no date' to clear).",
    {
      id: z.string().min(1),
      dueString: z.string().min(1),
    },
    async ({ id, dueString }) => {
      const task = requireTodoistTask(deps.storage, id);
      const client = requireTodoist(deps.todoist);
      const updated = await client.updateTask(task.externalId!, { dueString });
      const persisted = deps.storage.tasks.upsertByExternal({
        externalId: updated.id,
        externalSource: "todoist",
        content: updated.content,
        description: updated.description ?? null,
        projectId: updated.project_id ?? null,
        projectName: task.projectName ?? null,
        labels: updated.labels ?? [],
        priority: (updated.priority ?? null) as TaskPriority | null,
        dueAt: parseDueAt(updated.due?.datetime, updated.due?.date),
        dueString: updated.due?.string ?? null,
        completedAt: null,
        url: updated.url ?? null,
      });
      await indexTask(deps.storage, deps.embedder, persisted);
      return {
        content: [
          {
            type: "text",
            text: `Rescheduled "${updated.content}" → ${updated.due?.string ?? dueString}`,
          },
        ],
      };
    },
  ),

  tool(
    "update_task",
    "Update a task's content, description, priority, or labels. For due date changes, prefer reschedule_task.",
    {
      id: z.string().min(1),
      content: z.string().optional(),
      description: z.string().optional(),
      priority: z
        .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
        .optional(),
      labels: z.array(z.string()).optional(),
    },
    async ({ id, content, description, priority, labels }) => {
      const task = requireTodoistTask(deps.storage, id);
      const client = requireTodoist(deps.todoist);
      const patch: Parameters<TodoistClient["updateTask"]>[1] = {};
      if (content !== undefined) patch.content = content;
      if (description !== undefined) patch.description = description;
      if (priority !== undefined) patch.priority = priority;
      if (labels !== undefined) patch.labels = labels;
      if (Object.keys(patch).length === 0) {
        return { content: [{ type: "text", text: "No-op: no fields specified." }] };
      }
      const updated = await client.updateTask(task.externalId!, patch);
      const persisted = deps.storage.tasks.upsertByExternal({
        externalId: updated.id,
        externalSource: "todoist",
        content: updated.content,
        description: updated.description ?? null,
        projectId: updated.project_id ?? null,
        projectName: task.projectName ?? null,
        labels: updated.labels ?? [],
        priority: (updated.priority ?? null) as TaskPriority | null,
        dueAt: parseDueAt(updated.due?.datetime, updated.due?.date),
        dueString: updated.due?.string ?? null,
        completedAt: null,
        url: updated.url ?? null,
      });
      await indexTask(deps.storage, deps.embedder, persisted);
      return {
        content: [
          { type: "text", text: `Updated ${updated.id}: ${Object.keys(patch).join(", ")}` },
        ],
      };
    },
  ),
];
