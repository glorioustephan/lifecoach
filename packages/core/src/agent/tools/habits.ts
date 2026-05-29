import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Habit, HabitCompletion, HabitStatus } from "@lifecoach/schemas";
import { toolError } from "./errors.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderHabit = (h: Habit): string => {
  const parts: string[] = [`[${h.id.slice(0, 8)}] ${h.title}`, h.cadence, h.status];
  if (h.parentGoalId) parts.push(`goal:${h.parentGoalId.slice(0, 8)}`);
  if (h.lastCompletedAt) {
    const d = new Date(h.lastCompletedAt).toISOString().slice(0, 10);
    parts.push(`last:${d}`);
  }
  return `  • ${parts.join(" · ")}`;
};

const renderCompletion = (c: HabitCompletion): string => {
  const d = new Date(c.completedAt).toISOString().slice(0, 10);
  return `  ✓ ${d} (${c.origin})`;
};

/**
 * Return local noon (ms) for a YYYY-MM-DD string, or local noon today when
 * the string is absent.  Matching the same bucketing logic used by the server
 * route so agent-logged completions align with the calendar grid.
 */
const resolveCompletedAt = (dateStr?: string): number => {
  const d = dateStr
    ? (() => {
        const [y, m, day] = dateStr.split("-").map(Number) as [number, number, number];
        return new Date(y, m - 1, day, 12, 0, 0, 0);
      })()
    : (() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
      })();
  return d.getTime();
};

// ── Deps interface ────────────────────────────────────────────────────────────

export interface HabitToolDeps {
  storage: Storage;
}

// ── Tool builders ─────────────────────────────────────────────────────────────

export const buildHabitTools = (deps: HabitToolDeps) => [
  tool(
    "create_habit",
    "Create a new recurring habit. Habits are distinct from goals — they are " +
      "repeating actions (daily / weekly / monthly) that may contribute to a " +
      "parent goal. Use when the user agrees on a specific recurring action " +
      "they want to track.",
    {
      title: z.string().min(1).describe("Short, action-shaped habit title."),
      cadence: z
        .enum(["daily", "weekly", "monthly"])
        .describe("How often the habit should be performed."),
      parentGoalId: z
        .string()
        .optional()
        .describe("Optional: id of the goal this habit contributes to."),
      parentMilestoneId: z
        .string()
        .optional()
        .describe(
          "Optional: id of a milestone this habit supports. " +
            "Requires parentGoalId to also be provided.",
        ),
      notes: z.string().optional().describe("Optional context or instructions."),
    },
    async (args) => {
      // Validate parent FK coherence before touching storage.
      if (args.parentMilestoneId && !args.parentGoalId) {
        return toolError(
          "[INVALID_INPUT] parentMilestoneId requires parentGoalId to also be provided.",
        );
      }
      if (args.parentGoalId && !deps.storage.goals.get(args.parentGoalId)) {
        return toolError(
          `[GOAL_NOT_FOUND] No goal with id ${args.parentGoalId}`,
        );
      }

      const habit = deps.storage.habits.create({
        title: args.title,
        cadence: args.cadence,
        parentGoalId: args.parentGoalId ?? null,
        parentMilestoneId: args.parentMilestoneId ?? null,
        notes: args.notes ?? null,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Created habit\n${renderHabit(habit)}`,
          },
        ],
      };
    },
  ),

  tool(
    "record_habit_completion",
    "Log a completion for an existing habit. Defaults to today when no date " +
      "is provided. Completions are stored at local noon on the given date so " +
      "they align with the calendar grid regardless of timezone.",
    {
      habitId: z.string().min(1).describe("Id of the habit to mark as done."),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "ISO date (YYYY-MM-DD) to log the completion on. Defaults to today.",
        ),
      notes: z.string().optional().describe("Optional note about this completion."),
    },
    async (args) => {
      const habit = deps.storage.habits.get(args.habitId);
      if (!habit) {
        return toolError(`[HABIT_NOT_FOUND] No habit with id ${args.habitId}`);
      }

      const completedAt = resolveCompletedAt(args.date);

      const { completion, habit: updated } = deps.storage.handle.db.transaction(() => {
        const completion = deps.storage.habitCompletions.create({
          habitId: args.habitId,
          completedAt,
          notes: args.notes ?? null,
          origin: "conversation",
        });
        deps.storage.habits.setLastCompleted(args.habitId, completedAt);
        const updatedHabit = deps.storage.habits.get(args.habitId)!;
        return { completion, habit: updatedHabit };
      })();

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Logged completion for "${updated.title}"\n` +
              renderCompletion(completion),
          },
        ],
      };
    },
  ),

  tool(
    "list_habits",
    "List habits, optionally filtered by status or parent goal.",
    {
      status: z
        .enum(["active", "paused", "archived", "all"])
        .optional()
        .describe("Filter by status. Defaults to showing all statuses."),
      parentGoalId: z
        .string()
        .optional()
        .describe("Return only habits linked to this goal id."),
    },
    async (args) => {
      const habits = deps.storage.habits.list({
        status:
          args.status && args.status !== "all"
            ? (args.status as HabitStatus)
            : undefined,
        parentGoalId: args.parentGoalId,
      });

      if (habits.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No habits found." }],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `${habits.length} habit(s):\n${habits.map(renderHabit).join("\n")}`,
          },
        ],
      };
    },
  ),
];
