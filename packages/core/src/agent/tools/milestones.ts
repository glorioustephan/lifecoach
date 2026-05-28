import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Embedder } from "../../embeddings/index.js";
import type { Milestone, MilestoneStatus } from "@lifecoach/schemas";
import { indexMilestone } from "../../memory/goal-indexer.js";
import { toolError } from "./errors.js";

const milestoneStatus = z.enum(["pending", "active", "done", "abandoned"]);

const parseDueAt = (raw?: string): number | null | undefined => {
  if (raw === undefined) return undefined;
  if (!raw || raw.toLowerCase() === "none") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
};

const renderMilestone = (m: Milestone): string => {
  const meta: string[] = [m.status];
  if (m.dueAt) meta.push(`due ${new Date(m.dueAt).toISOString().slice(0, 10)}`);
  return `  ${m.orderIndex + 1}. [${m.id.slice(0, 8)}] ${m.title} (${meta.join(" · ")})`;
};

export interface MilestoneToolDeps {
  storage: Storage;
  embedder: Embedder;
}

export const buildMilestoneTools = (deps: MilestoneToolDeps) => [
  tool(
    "create_milestone",
    "Add a concrete, ordered checkpoint to a goal. Milestones decompose " +
      "abstract goals into something the user can complete in days or weeks. " +
      "Use when the user has agreed on a tangible next checkpoint. Origin is " +
      "always 'conversation' when called via the agent.",
    {
      goalId: z.string().min(1),
      title: z.string().min(1).describe("Short, action-shaped title."),
      body: z.string().optional().describe("Optional detail."),
      dueAt: z.string().optional().describe("ISO date by which the milestone should land."),
      orderIndex: z
        .number()
        .int()
        .optional()
        .describe(
          "Optional explicit position. Omit to append to the end of the goal's milestone list.",
        ),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("0–1, how confident you are this milestone is right for the goal."),
    },
    async (args) => {
      if (!deps.storage.goals.get(args.goalId)) {
        return toolError(`[GOAL_NOT_FOUND] No goal with id ${args.goalId}`);
      }
      const milestone = deps.storage.milestones.create({
        goalId: args.goalId,
        title: args.title,
        body: args.body ?? null,
        status: "pending",
        orderIndex: args.orderIndex ?? 0,
        dueAt: parseDueAt(args.dueAt) ?? null,
        origin: "conversation",
        confidence: args.confidence ?? null,
      });
      await indexMilestone(deps.storage, deps.embedder, milestone);
      return {
        content: [
          {
            type: "text",
            text: `Added milestone to goal ${args.goalId.slice(0, 8)}\n${renderMilestone(milestone)}`,
          },
        ],
      };
    },
  ),

  tool(
    "list_milestones",
    "List milestones for a goal in their ordered sequence.",
    {
      goalId: z.string().min(1),
      status: z.enum(["pending", "active", "done", "abandoned", "all"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ goalId, status: s, limit }) => {
      const milestones = deps.storage.milestones.list({
        goalId,
        status: (s ?? "all") as MilestoneStatus | "all",
        limit: limit ?? 50,
      });
      if (milestones.length === 0) {
        return { content: [{ type: "text", text: "No milestones for this goal." }] };
      }
      return { content: [{ type: "text", text: milestones.map(renderMilestone).join("\n") }] };
    },
  ),

  tool(
    "update_milestone",
    "Edit a milestone's title/body/status/due date or move it in the order.",
    {
      id: z.string().min(1),
      title: z.string().min(1).optional(),
      body: z.string().optional(),
      status: milestoneStatus.optional(),
      orderIndex: z.number().int().optional(),
      dueAt: z.string().optional().describe("ISO date or 'none' to clear"),
    },
    async (args) => {
      const patch: Parameters<typeof deps.storage.milestones.update>[1] = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.body !== undefined) patch.body = args.body;
      if (args.status !== undefined) patch.status = args.status as MilestoneStatus;
      if (args.orderIndex !== undefined) patch.orderIndex = args.orderIndex;
      const due = parseDueAt(args.dueAt);
      if (due !== undefined) patch.dueAt = due;

      const updated = deps.storage.milestones.update(args.id, patch);
      if (!updated) {
        return toolError(`[MILESTONE_NOT_FOUND] No milestone with id ${args.id}`);
      }
      await indexMilestone(deps.storage, deps.embedder, updated);
      return { content: [{ type: "text", text: `Updated\n${renderMilestone(updated)}` }] };
    },
  ),

  tool(
    "complete_milestone",
    "Mark a milestone as done.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const updated = deps.storage.milestones.complete(id);
      if (!updated) {
        return toolError(`[MILESTONE_NOT_FOUND] No milestone with id ${id}`);
      }
      await indexMilestone(deps.storage, deps.embedder, updated);
      return { content: [{ type: "text", text: `Completed milestone: ${updated.title}` }] };
    },
  ),

  tool(
    "delete_milestone",
    "Permanently remove a milestone. Use sparingly — prefer status='abandoned' " +
      "if the user might want it back.",
    { id: z.string().min(1) },
    async ({ id }) => {
      const ex = deps.storage.milestones.get(id);
      if (!ex) {
        return toolError(`[MILESTONE_NOT_FOUND] No milestone with id ${id}`);
      }
      deps.storage.milestones.delete(id);
      deps.storage.embeddings.deleteForRef("milestone", id);
      return { content: [{ type: "text", text: `Deleted milestone: ${ex.title}` }] };
    },
  ),
];
