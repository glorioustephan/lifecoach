import type { NewTask, TaskPriority } from "@lifecoach/schemas";
import type { Storage } from "../../storage/index.js";
import { TodoistClient, type TodoistProject, type TodoistTask } from "./client.js";

const SOURCE = "todoist";

export interface TodoistSyncResult {
  fetched: number;
  upserted: number;
  newlyCompleted: number;
}

const parseDueAt = (task: TodoistTask): number | null => {
  if (!task.due) return null;
  // Prefer datetime when present, else fall back to date (treat as local midnight).
  const candidate = task.due.datetime ?? task.due.date;
  const ts = Date.parse(candidate);
  return Number.isNaN(ts) ? null : ts;
};

const mapTask = (task: TodoistTask, projects: Map<string, TodoistProject>): NewTask => ({
  externalId: task.id,
  externalSource: SOURCE,
  content: task.content,
  description: task.description ?? null,
  projectId: task.project_id ?? null,
  projectName: task.project_id ? projects.get(task.project_id)?.name ?? null : null,
  labels: task.labels ?? [],
  priority: (task.priority ?? null) as TaskPriority | null,
  dueAt: parseDueAt(task),
  dueString: task.due?.string ?? null,
  completedAt: task.is_completed ? Date.now() : null,
  url: task.url ?? null,
});

/**
 * Full sync of active tasks. Pulls projects + tasks, upserts everything,
 * and reconciles any locally-active task that wasn't returned upstream
 * (= completed or deleted on Todoist's side since the last sync).
 */
export const syncTodoist = async (
  client: TodoistClient,
  storage: Storage,
): Promise<TodoistSyncResult> => {
  const [projects, tasks] = await Promise.all([
    client.listProjects(),
    client.listActiveTasks(),
  ]);
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  let upserted = 0;
  for (const task of tasks) {
    storage.tasks.upsertByExternal(mapTask(task, projectMap));
    upserted += 1;
  }

  const activeIds = new Set(tasks.map((t) => t.id));
  const newlyCompleted = storage.tasks.reconcileActiveSet(SOURCE, activeIds);

  return {
    fetched: tasks.length,
    upserted,
    newlyCompleted,
  };
};
