import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Goal, GoalHorizon, GoalStatus } from "@lifecoach/schemas";
import { LifecoachError } from "../../util/errors.js";

const horizon = z.enum(["this-week", "this-month", "this-quarter", "this-year", "open"]);
const status = z.enum(["active", "paused", "done", "abandoned"]);

const parseDueAt = (raw?: string): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (!raw || raw.toLowerCase() === "none") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
};

const renderGoal = (g: Goal): string => {
  const meta: string[] = [g.status, g.horizon];
  if (g.dueAt) meta.push(`due ${new Date(g.dueAt).toISOString().slice(0, 10)}`);
  if (g.targetMetric && g.targetValue !== null && g.targetValue !== undefined) {
    const progress =
      g.currentProgress !== null && g.currentProgress !== undefined
        ? `${g.currentProgress}/${g.targetValue}`
        : `target ${g.targetValue}`;
    meta.push(`${g.targetMetric}: ${progress}`);
  }
  return `[${g.id.slice(0, 8)}] ${g.title} (${meta.join(" · ")})`;
};

export const buildGoalTools = (deps: { storage: Storage }) => [
  tool(
    "create_goal",
    "Create a new goal. Goals are durable intentions with a horizon (this-week / this-month / this-quarter / this-year / open) and optional success criteria, due date, and numeric target. Use when the user states something they want to achieve over a defined period.",
    {
      title: z.string().min(1).describe("Short title — what the user wants"),
      body: z.string().optional().describe("Longer description of context, motivation, scope"),
      horizon: horizon.optional(),
      successCriteria: z.string().optional().describe("How will we know it's done?"),
      dueAt: z.string().optional().describe("ISO date when due (optional)"),
      targetMetric: z
        .string()
        .optional()
        .describe("Snake-case metric name if this is numeric (e.g. 'weight_kg', 'hrv_avg')"),
      targetValue: z.number().optional().describe("Numeric target"),
      projectId: z.string().optional().describe("Parent project id, if scoped to one"),
      parentGoalId: z.string().optional().describe("Parent goal id, for sub-goals"),
    },
    async (args) => {
      const goal = deps.storage.goals.create({
        title: args.title,
        body: args.body ?? null,
        horizon: (args.horizon ?? "open") as GoalHorizon,
        status: "active",
        successCriteria: args.successCriteria ?? null,
        parentGoalId: args.parentGoalId ?? null,
        projectId: args.projectId ?? null,
        targetMetric: args.targetMetric ?? null,
        targetValue: args.targetValue ?? null,
        currentProgress: null,
        dueAt: parseDueAt(args.dueAt) ?? null,
      });
      return { content: [{ type: "text", text: `Created goal ${goal.id}\n${renderGoal(goal)}` }] };
    },
  ),

  tool(
    "list_goals",
    "List goals filtered by status, horizon, or project. Default: active.",
    {
      status: z.enum(["active", "paused", "done", "abandoned", "all"]).optional(),
      horizon: z
        .enum(["this-week", "this-month", "this-quarter", "this-year", "open", "all"])
        .optional(),
      projectId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      const goals = deps.storage.goals.list({
        status: (args.status ?? "active") as GoalStatus | "all",
        ...(args.horizon ? { horizon: args.horizon as GoalHorizon | "all" } : {}),
        ...(args.projectId ? { projectId: args.projectId } : {}),
        limit: args.limit ?? 50,
      });
      if (goals.length === 0) {
        return { content: [{ type: "text", text: "No goals match." }] };
      }
      return { content: [{ type: "text", text: goals.map(renderGoal).join("\n") }] };
    },
  ),

  tool(
    "update_goal",
    "Update progress on an existing goal: change status, log progress against a numeric target, edit body/criteria.",
    {
      id: z.string().min(1),
      status: status.optional(),
      currentProgress: z.number().optional(),
      body: z.string().optional(),
      successCriteria: z.string().optional(),
      targetValue: z.number().optional(),
    },
    async ({ id, status: s, currentProgress, body, successCriteria, targetValue }) => {
      const patch: Parameters<typeof deps.storage.goals.updateProgress>[1] = {};
      if (s !== undefined) patch.status = s as GoalStatus;
      if (currentProgress !== undefined) patch.currentProgress = currentProgress;
      if (body !== undefined) patch.body = body;
      if (successCriteria !== undefined) patch.successCriteria = successCriteria;
      if (targetValue !== undefined) patch.targetValue = targetValue;
      const updated = deps.storage.goals.updateProgress(id, patch);
      if (!updated) {
        throw new LifecoachError(`No goal with id ${id}`, "GOAL_NOT_FOUND");
      }
      return { content: [{ type: "text", text: `Updated\n${renderGoal(updated)}` }] };
    },
  ),

  tool(
    "complete_goal",
    "Mark a goal as done. Convenience wrapper around update_goal status='done'.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const updated = deps.storage.goals.updateProgress(id, { status: "done" });
      if (!updated) throw new LifecoachError(`No goal with id ${id}`, "GOAL_NOT_FOUND");
      return { content: [{ type: "text", text: `Completed: ${updated.title}` }] };
    },
  ),

  tool(
    "create_project",
    "Create a project — a bundle of goals + work over a defined scope. Use for things like 'Q2 kitchen renovation', 'marathon training cycle', 'launch the new product'.",
    {
      title: z.string().min(1),
      body: z.string().optional(),
      targetDate: z.string().optional().describe("ISO date when the project should end"),
    },
    async ({ title, body, targetDate }) => {
      const project = deps.storage.projects.create({
        title,
        body: body ?? null,
        status: "active",
        targetDate: parseDueAt(targetDate) ?? null,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created project ${project.id} — ${project.title}`,
          },
        ],
      };
    },
  ),

  tool(
    "list_projects",
    "List projects (active by default).",
    {
      status: z.enum(["active", "paused", "done", "abandoned", "all"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ status: s, limit }) => {
      const projects = deps.storage.projects.list({
        status: (s ?? "active") as "active" | "paused" | "done" | "abandoned" | "all",
        limit: limit ?? 20,
      });
      if (projects.length === 0) {
        return { content: [{ type: "text", text: "No projects." }] };
      }
      const lines = projects.map((p) => {
        const goals = deps.storage.goals.list({ projectId: p.id, status: "active", limit: 50 });
        return `[${p.id.slice(0, 8)}] ${p.title} (${p.status}, ${goals.length} active goal${goals.length === 1 ? "" : "s"})`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  ),
];
