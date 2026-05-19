import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Task } from "@lifecoach/schemas";

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

export const buildTaskTools = (deps: { storage: Storage }) => [
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
];
