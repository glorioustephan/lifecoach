import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type {
  Goal,
  GoalCadence,
  GoalHorizon,
  GoalKind,
  GoalReviewCadence,
  GoalStatus,
} from "@lifecoach/schemas";
import { indexGoal } from "../../memory/goal-indexer.js";
import { LifecoachError } from "../../util/errors.js";

const horizon = z.enum(["this-week", "this-month", "this-quarter", "this-year", "open"]);
const status = z.enum(["active", "paused", "done", "abandoned"]);
const kind = z.enum(["outcome", "process", "identity"]);
const cadence = z.enum(["daily", "weekly", "monthly"]);
const reviewCadence = z.enum(["weekly", "monthly", "quarterly", "as-needed"]);

const parseDueAt = (raw?: string): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (!raw || raw.toLowerCase() === "none") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
};

const renderGoal = (g: Goal): string => {
  const meta: string[] = [g.kind, g.status];
  if (g.horizon !== "open") meta.push(g.horizon);
  if (g.dueAt) meta.push(`due ${new Date(g.dueAt).toISOString().slice(0, 10)}`);
  if (g.targetMetric && g.targetValue !== null && g.targetValue !== undefined) {
    const progress =
      g.currentProgress !== null && g.currentProgress !== undefined
        ? `${g.currentProgress}/${g.targetValue}`
        : `target ${g.targetValue}`;
    meta.push(`${g.targetMetric}: ${progress}`);
  }
  const head = `[${g.id.slice(0, 8)}] ${g.title} (${meta.join(" · ")})`;
  const facets: string[] = [];
  if (g.outcome) facets.push(`  outcome: ${g.outcome}`);
  if (g.obstacle) facets.push(`  obstacle: ${g.obstacle}`);
  if (g.implementationIntention) facets.push(`  plan: ${g.implementationIntention}`);
  if (g.identityStatement) facets.push(`  identity: ${g.identityStatement}`);
  return facets.length > 0 ? `${head}\n${facets.join("\n")}` : head;
};

export interface GoalToolDeps {
  storage: Storage;
  embedder: Embedder;
}

export const buildGoalTools = (deps: GoalToolDeps) => [
  tool(
    "create_goal",
    "Create a new goal. Goals are durable aspirational anchors with a `kind` " +
      "(outcome = a finite achievement, process = a recurring practice, " +
      "identity = who the user is becoming). For ADHD-friendly traction, " +
      "include the WOOP fields (`outcome`, `obstacle`, `implementationIntention`) " +
      "when the user reveals them. Identity goals don't need a `dueAt`; process " +
      "goals should carry a `cadence`. Use `successCriteria` only for legacy " +
      "callers — prefer `outcome` for new goals.",
    {
      title: z.string().min(1).describe("Short title — what the user wants"),
      body: z
        .string()
        .optional()
        .describe("Legacy 'why it matters' free-text. Prefer outcome/identityStatement."),
      kind: kind.optional().describe("outcome | process | identity (default: outcome)"),
      cadence: cadence
        .optional()
        .describe("daily | weekly | monthly. Only set when kind='process'."),
      outcome: z
        .string()
        .optional()
        .describe("WOOP Outcome — the felt picture of success."),
      obstacle: z
        .string()
        .optional()
        .describe("WOOP Obstacle — the most-likely friction point."),
      implementationIntention: z
        .string()
        .optional()
        .describe(
          "If-then plan, 'After <anchor>, I will <behavior> in <context>'. " +
            "Use propose_implementation_intention for retro-attaching to an existing goal.",
        ),
      identityStatement: z
        .string()
        .optional()
        .describe("'I am someone who…' — anchors identity-kind goals."),
      reviewCadence: reviewCadence
        .optional()
        .describe(
          "How often to surface this goal for review. Default 'weekly'. " +
            "Identity goals often want 'monthly' or 'quarterly'.",
        ),
      horizon: horizon.optional().describe("Optional time-horizon hint."),
      successCriteria: z
        .string()
        .optional()
        .describe("DEPRECATED legacy success-criteria string. Prefer `outcome`."),
      dueAt: z.string().optional().describe("ISO date when due (optional)"),
      targetMetric: z
        .string()
        .optional()
        .describe("Snake-case metric name if numeric (e.g. 'weight_kg')"),
      targetValue: z.number().optional().describe("Numeric target"),
      projectId: z.string().optional().describe("Parent project id"),
      parentGoalId: z.string().optional().describe("Parent goal id, for nested ambitions"),
    },
    async (args) => {
      const goal = deps.storage.goals.create({
        title: args.title,
        body: args.body ?? null,
        horizon: (args.horizon ?? "open") as GoalHorizon,
        status: "active",
        kind: (args.kind ?? "outcome") as GoalKind,
        cadence: (args.cadence ?? null) as GoalCadence | null,
        outcome: args.outcome ?? null,
        obstacle: args.obstacle ?? null,
        implementationIntention: args.implementationIntention ?? null,
        identityStatement: args.identityStatement ?? null,
        successCriteria: args.successCriteria ?? null,
        parentGoalId: args.parentGoalId ?? null,
        projectId: args.projectId ?? null,
        targetMetric: args.targetMetric ?? null,
        targetValue: args.targetValue ?? null,
        currentProgress: null,
        reviewCadence: (args.reviewCadence ?? "weekly") as GoalReviewCadence,
        dueAt: parseDueAt(args.dueAt) ?? null,
      });
      await indexGoal(deps.storage, deps.embedder, goal);
      return { content: [{ type: "text", text: `Created goal ${goal.id}\n${renderGoal(goal)}` }] };
    },
  ),

  tool(
    "list_goals",
    "List goals filtered by status, kind, horizon, or project. Default: active across all kinds.",
    {
      status: z.enum(["active", "paused", "done", "abandoned", "all"]).optional(),
      kind: z.enum(["outcome", "process", "identity", "all"]).optional(),
      horizon: z
        .enum(["this-week", "this-month", "this-quarter", "this-year", "open", "all"])
        .optional(),
      projectId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async (args) => {
      const goals = deps.storage.goals.list({
        status: (args.status ?? "active") as GoalStatus | "all",
        ...(args.kind ? { kind: args.kind as GoalKind | "all" } : {}),
        ...(args.horizon ? { horizon: args.horizon as GoalHorizon | "all" } : {}),
        ...(args.projectId ? { projectId: args.projectId } : {}),
        limit: args.limit ?? 50,
      });
      if (goals.length === 0) {
        return { content: [{ type: "text", text: "No goals match." }] };
      }
      return { content: [{ type: "text", text: goals.map(renderGoal).join("\n\n") }] };
    },
  ),

  tool(
    "update_goal",
    "Update an existing goal. Pass any subset of fields; omitted fields stay " +
      "untouched. Use null to explicitly clear a field. Use this to refine the " +
      "WOOP framing as more shows up in conversation.",
    {
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      status: status.optional(),
      currentProgress: z.number().optional(),
      body: z.string().optional(),
      kind: kind.optional(),
      cadence: cadence.optional(),
      outcome: z.string().optional(),
      obstacle: z.string().optional(),
      implementationIntention: z.string().optional(),
      identityStatement: z.string().optional(),
      successCriteria: z.string().optional(),
      reviewCadence: reviewCadence.optional(),
      targetValue: z.number().optional(),
      targetMetric: z.string().optional(),
      dueAt: z.string().optional().describe("ISO date or 'none' to clear"),
    },
    async (args) => {
      const patch: Parameters<typeof deps.storage.goals.update>[1] = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.status !== undefined) patch.status = args.status as GoalStatus;
      if (args.currentProgress !== undefined) patch.currentProgress = args.currentProgress;
      if (args.body !== undefined) patch.body = args.body;
      if (args.kind !== undefined) patch.kind = args.kind as GoalKind;
      if (args.cadence !== undefined) patch.cadence = args.cadence as GoalCadence;
      if (args.outcome !== undefined) patch.outcome = args.outcome;
      if (args.obstacle !== undefined) patch.obstacle = args.obstacle;
      if (args.implementationIntention !== undefined)
        patch.implementationIntention = args.implementationIntention;
      if (args.identityStatement !== undefined) patch.identityStatement = args.identityStatement;
      if (args.successCriteria !== undefined) patch.successCriteria = args.successCriteria;
      if (args.reviewCadence !== undefined)
        patch.reviewCadence = args.reviewCadence as GoalReviewCadence;
      if (args.targetValue !== undefined) patch.targetValue = args.targetValue;
      if (args.targetMetric !== undefined) patch.targetMetric = args.targetMetric;
      const due = parseDueAt(args.dueAt);
      if (due !== undefined) patch.dueAt = due;

      const updated = deps.storage.goals.update(args.id, patch);
      if (!updated) {
        throw new LifecoachError(`No goal with id ${args.id}`, "GOAL_NOT_FOUND");
      }
      await indexGoal(deps.storage, deps.embedder, updated);
      return { content: [{ type: "text", text: `Updated\n${renderGoal(updated)}` }] };
    },
  ),

  tool(
    "propose_implementation_intention",
    "Retro-attach an if-then plan to an existing goal. Use when the user " +
      "reveals a natural anchor in conversation (e.g. 'after I make coffee') " +
      "and you want to lock that in as the goal's behavior trigger. " +
      "Format: 'After <anchor>, I will <behavior> in <context>.'",
    {
      goalId: z.string().min(1),
      intention: z.string().min(8).describe("The full if-then sentence."),
    },
    async ({ goalId, intention }) => {
      const updated = deps.storage.goals.update(goalId, {
        implementationIntention: intention,
      });
      if (!updated) {
        throw new LifecoachError(`No goal with id ${goalId}`, "GOAL_NOT_FOUND");
      }
      await indexGoal(deps.storage, deps.embedder, updated);
      return {
        content: [
          { type: "text", text: `Attached implementation intention to ${updated.title}` },
        ],
      };
    },
  ),

  tool(
    "link_task_to_goal",
    "Associate an existing task with a goal (and optionally a milestone). " +
      "Use when a Todoist-synced task is clearly an action toward an active " +
      "goal — surfacing that link makes the briefing show 'Next: <task>' " +
      "under the goal title.",
    {
      taskId: z.string().min(1),
      goalId: z.string().nullable().describe("Set to null to un-link."),
      milestoneId: z
        .string()
        .nullable()
        .optional()
        .describe("Optional milestone within the goal."),
    },
    async ({ taskId, goalId, milestoneId }) => {
      const task = deps.storage.tasks.linkToGoal(taskId, goalId, milestoneId ?? null);
      if (!task) {
        throw new LifecoachError(`No task with id ${taskId}`, "TASK_NOT_FOUND");
      }
      const target = goalId
        ? `goal ${goalId.slice(0, 8)}${milestoneId ? ` (milestone ${milestoneId.slice(0, 8)})` : ""}`
        : "no goal";
      return { content: [{ type: "text", text: `Linked task ${task.id.slice(0, 8)} → ${target}` }] };
    },
  ),

  tool(
    "mark_goal_reviewed",
    "Stamp `last_reviewed_at = now` on a goal. Use after a meaningful " +
      "discussion about the goal so the surfacing heuristics don't keep " +
      "flagging it as stalled.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const updated = deps.storage.goals.markReviewed(id);
      if (!updated) {
        throw new LifecoachError(`No goal with id ${id}`, "GOAL_NOT_FOUND");
      }
      return { content: [{ type: "text", text: `Reviewed: ${updated.title}` }] };
    },
  ),

  tool(
    "archive_goal",
    "Soft-archive a goal. Keeps the row + embeddings + linked tasks intact " +
      "so we never lose context; just hides from active surfaces.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const updated = deps.storage.goals.archive(id);
      if (!updated) {
        throw new LifecoachError(`No goal with id ${id}`, "GOAL_NOT_FOUND");
      }
      return { content: [{ type: "text", text: `Archived: ${updated.title}` }] };
    },
  ),

  tool(
    "complete_goal",
    "Mark a goal as done. Convenience wrapper around update_goal status='done'.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const updated = deps.storage.goals.update(id, { status: "done" });
      if (!updated) throw new LifecoachError(`No goal with id ${id}`, "GOAL_NOT_FOUND");
      await indexGoal(deps.storage, deps.embedder, updated);
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
