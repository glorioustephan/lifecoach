/**
 * propose_artifact and propose_actionable_items — declarative intent tools.
 *
 * These tools do NOT persist anything to the DB. Their sole purpose is to land
 * in `message.toolUse` (via the stream-bridge capture) so the web UI can read
 * them and render the appropriate action button on the assistant message.
 *
 * This replaces the fragile heuristic (artifact.ts detectArtifactTypes) as the
 * primary signal for "what button should appear under this message". The
 * heuristic remains as a low-confidence fallback for legacy messages.
 *
 * Agent guidance is added in system-prompt.ts.
 */
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { ARTIFACT_DESCRIPTORS } from "@lifecoach/schemas";
import type { Storage } from "../../storage/index.js";

// ── Artifact type enum ────────────────────────────────────────────────────────

/**
 * Derive the enum values at module load time from ARTIFACT_DESCRIPTORS.
 * This is the single source of truth for valid artifact type strings — adding
 * a new descriptor automatically expands what the agent can declare.
 */
const ARTIFACT_TYPE_ENUM = ARTIFACT_DESCRIPTORS.map((d) => d.id) as [string, ...string[]];

// ── Deps interface ────────────────────────────────────────────────────────────

export interface ProposeToolDeps {
  storage: Storage;
}

// ── Tool builders ─────────────────────────────────────────────────────────────

export const buildProposeTools = (_deps: ProposeToolDeps) => [
  tool(
    "propose_artifact",
    "Declare that the current assistant message contains a complete, savable " +
      "artifact (recipe, workout, protocol, etc.). Call this BEFORE finishing the " +
      "turn whenever the message presents a structured artifact the user might " +
      "want to save. The UI shows a save button only when this tool is called — " +
      "without it no button appears. Do NOT call for tangential mentions ('I had " +
      "pasta last night'); only for actual artifacts (a recipe with ingredients " +
      "+ steps, a workout plan, etc.).",
    {
      type: z
        .enum(ARTIFACT_TYPE_ENUM)
        .describe(
          "The artifact type id from the ARTIFACT_DESCRIPTORS registry. " +
            "Examples: 'recipe', 'spending-alert', 'portfolio-snapshot'.",
        ),
      title: z.string().optional().describe("Optional title to pre-fill the save dialog."),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .default(0.9)
        .describe("Agent's confidence that this message actually contains this artifact (0–1)."),
    },
    async (input) => ({
      content: [
        {
          type: "text" as const,
          text: `Declared artifact intent: ${input.type}${input.title ? ` — "${input.title}"` : ""}`,
        },
      ],
    }),
  ),

  tool(
    "propose_actionable_items",
    "Declare a structured list of recommended actions from this message. Use when " +
      "you've surfaced an explicit list of recommendations the user could turn into " +
      "habits, tasks, or both. Decompose smart: a recommendation that's both a " +
      "one-time setup AND a recurring practice (e.g., 'switch to TG-form fish oil " +
      "AND take 3-4g/day with food') should split into a `task` (the switch) and " +
      "a `habit` (the daily dose). If multiple items naturally cluster under a " +
      "goal (e.g., 'Improve lipid panel'), propose that goal via `parentGoalSuggestion`. " +
      "Max 12 items per call to keep the review modal scannable.",
    {
      items: z
        .array(
          z.discriminatedUnion("type", [
            z.object({
              type: z.literal("habit"),
              title: z.string().min(1).describe("Short, action-shaped habit title."),
              cadence: z
                .enum(["daily", "weekly", "monthly"])
                .describe("How often the habit should be performed."),
              rationale: z
                .string()
                .optional()
                .describe("Why this habit is recommended. Shown in the review modal."),
              notes: z.string().optional().describe("Optional context or instructions."),
            }),
            z.object({
              type: z.literal("task"),
              title: z.string().min(1).describe("Short, action-shaped task title."),
              dueAt: z
                .string()
                .optional()
                .describe(
                  "ISO date (YYYY-MM-DD) for when the task should be done. Optional.",
                ),
              rationale: z
                .string()
                .optional()
                .describe("Why this task is recommended. Shown in the review modal."),
              notes: z.string().optional().describe("Optional context or instructions."),
            }),
          ]),
        )
        .min(1)
        .max(12)
        .describe("List of proposed habits and tasks. Maximum 12 to keep the modal scannable."),
      parentGoalSuggestion: z
        .object({
          title: z.string().min(1).describe("Title for the new goal."),
          kind: z
            .enum(["outcome", "process", "identity"])
            .describe("Goal kind — outcome (bounded), process (metric), or identity (votes)."),
          rationale: z
            .string()
            .optional()
            .describe("Why these items cluster under this goal."),
        })
        .optional()
        .describe(
          "Optional: propose creating a new goal to group all the items under. " +
            "Use when the items share a clear common objective.",
        ),
    },
    async (input) => ({
      content: [
        {
          type: "text" as const,
          text:
            `Proposed ${input.items.length} actionable item${input.items.length !== 1 ? "s" : ""}` +
            (input.parentGoalSuggestion
              ? ` under suggested goal "${input.parentGoalSuggestion.title}"`
              : ""),
        },
      ],
    }),
  ),
];
