import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Storage } from "../../storage/index.js";
import type { Memory } from "../../memory/index.js";
import type { Insighter } from "../../memory/insighter.js";
import { toolError } from "./errors.js";

export interface InsightToolDeps {
  storage: Storage;
  memory: Memory;
  insighter: Insighter | null;
}

const PRIORITY_TAG: Record<number, string> = {
  1: "p3",
  2: "p2",
  3: "p1",
};

const formatTs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const buildInsightTools = (deps: InsightToolDeps) => [
  tool(
    "generate_insights",
    "Run the insight loop NOW: agent reviews recent messages, completed tasks, active facts, measurements, and prior reflections, then surfaces 0–3 ranked observations into the Inbox. Use when the user asks 'what should I be paying attention to?', 'anything new I should know?', or for a morning check-in.",
    {},
    async () => {
      if (!deps.insighter) {
        return toolError(
          "[INSIGHTER_NOT_CONFIGURED] Insighter unavailable — ANTHROPIC_API_KEY isn't configured.",
        );
      }
      const insights = await deps.insighter.generate(deps.storage, deps.memory.identity);
      if (insights.length === 0) {
        return {
          content: [{ type: "text", text: "No new insights this pass." }],
        };
      }
      const lines = insights.map(
        (i) =>
          `[${i.id.slice(0, 8)} · ${PRIORITY_TAG[i.priority] ?? "p3"}] ${i.topic}\n   ${i.body.split("\n")[0]?.slice(0, 140) ?? ""}`,
      );
      return {
        content: [{ type: "text", text: `Generated ${insights.length} insight(s):\n\n${lines.join("\n\n")}` }],
      };
    },
  ),

  tool(
    "list_insights",
    "List insights from the inbox by state. Default is 'active' (not acted on, not dismissed, not snoozed).",
    {
      state: z.enum(["active", "acted", "dismissed", "snoozed", "all"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ state, limit }) => {
      const insights = deps.storage.insights.list({
        state: state ?? "active",
        limit: limit ?? 30,
      });
      if (insights.length === 0) {
        return { content: [{ type: "text", text: "Inbox is empty." }] };
      }
      const lines = insights.map((i) => {
        const meta: string[] = [PRIORITY_TAG[i.priority] ?? "p3", formatTs(i.createdAt)];
        if (i.actedOnAt) meta.push(`acted ${formatTs(i.actedOnAt)}`);
        if (i.dismissedAt) meta.push(`dismissed ${formatTs(i.dismissedAt)}`);
        if (i.snoozedUntil && i.snoozedUntil > Date.now()) {
          meta.push(`snoozed until ${formatTs(i.snoozedUntil)}`);
        }
        return `[${i.id.slice(0, 8)}] (${meta.join(" · ")}) ${i.topic}\n   ${i.body.split("\n")[0]?.slice(0, 140) ?? ""}`;
      });
      return { content: [{ type: "text", text: lines.join("\n\n") }] };
    },
  ),

  tool(
    "act_on_insight",
    "Mark an insight as acted on. Use when the user has done something about it (e.g. set up the routine, changed the schedule).",
    {
      id: z.string().min(1),
    },
    async ({ id }) => {
      const ins = deps.storage.insights.get(id);
      if (!ins) {
        return toolError(`[INSIGHT_NOT_FOUND] No insight with id ${id}`);
      }
      deps.storage.insights.markActed(id);
      return { content: [{ type: "text", text: `Marked acted: ${ins.topic}` }] };
    },
  ),

  tool(
    "dismiss_insight",
    "Dismiss an insight as not worth pursuing. Use when the user explicitly rejects it.",
    {
      id: z.string().min(1),
    },
    async ({ id }) => {
      const ins = deps.storage.insights.get(id);
      if (!ins) {
        return toolError(`[INSIGHT_NOT_FOUND] No insight with id ${id}`);
      }
      deps.storage.insights.markDismissed(id);
      return { content: [{ type: "text", text: `Dismissed: ${ins.topic}` }] };
    },
  ),

  tool(
    "snooze_insight",
    "Snooze an insight until a future timestamp. Useful when the user wants to revisit later.",
    {
      id: z.string().min(1),
      until: z
        .string()
        .describe("ISO 8601 timestamp, or 'tomorrow', 'next week', '+3d'"),
    },
    async ({ id, until }) => {
      const ins = deps.storage.insights.get(id);
      if (!ins) {
        return toolError(`[INSIGHT_NOT_FOUND] No insight with id ${id}`);
      }
      let untilMs = Date.parse(until);
      if (Number.isNaN(untilMs)) {
        const lower = until.toLowerCase().trim();
        if (lower === "tomorrow") untilMs = Date.now() + 24 * 60 * 60 * 1000;
        else if (lower === "next week") untilMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
        else if (/^\+(\d+)([dhwm])$/.test(lower)) {
          const m = /^\+(\d+)([dhwm])$/.exec(lower)!;
          const n = Number(m[1]);
          const unit = m[2];
          const factor =
            unit === "h" ? 3600 * 1000 :
            unit === "d" ? 86400 * 1000 :
            unit === "w" ? 7 * 86400 * 1000 :
            30 * 86400 * 1000;
          untilMs = Date.now() + n * factor;
        } else {
          return toolError(`[INVALID_SNOOZE] Unparseable snooze target: ${until}`);
        }
      }
      deps.storage.insights.snooze(id, untilMs);
      return {
        content: [
          { type: "text", text: `Snoozed "${ins.topic}" until ${new Date(untilMs).toISOString()}` },
        ],
      };
    },
  ),
];
