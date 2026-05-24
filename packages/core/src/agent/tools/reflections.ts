import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";
import type { Storage } from "../../storage/index.js";
import type { Reflector } from "../../memory/reflector.js";
import { kindWindow } from "../../memory/reflector.js";
import { NotImplementedError } from "../../util/errors.js";

export interface ReflectionToolDeps {
  memory: Memory;
  storage: Storage;
  reflector: Reflector | null;
}

const parseTs = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) return n;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

export const buildReflectionTools = (deps: ReflectionToolDeps) => [
  tool(
    "summarize_period",
    "Generate and persist a structured reflection (synthesis with themes, wins, open threads, concerns) over a time range. Use when the user asks 'how was last week?', 'what happened today?', or for periodic check-ins. Defaults are inferred from `kind` if `from`/`to` are omitted: daily=yesterday, weekly=7d, monthly=30d. Returns the new reflection's id and body.",
    {
      kind: z.enum(["daily", "weekly", "monthly"]),
      from: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Unix ms or ISO 8601. If omitted, inferred from kind."),
      to: z
        .union([z.number(), z.string()])
        .optional()
        .describe("Unix ms or ISO 8601. If omitted, inferred from kind."),
    },
    async ({ kind, from, to }) => {
      if (!deps.reflector) {
        return {
          content: [
            {
              type: "text",
              text: "Reflector unavailable — ANTHROPIC_API_KEY isn't configured.",
            },
          ],
          isError: true,
        };
      }
      const window = kindWindow(kind);
      const fromTs = typeof from === "number" ? from : parseTs(from) ?? window.from;
      const toTs = typeof to === "number" ? to : parseTs(to) ?? window.to;

      const reflection = await deps.reflector.generate(
        deps.storage,
        deps.memory.identity,
        kind,
        fromTs,
        toTs,
      );
      await deps.memory.semantic.indexReflection(reflection);
      return {
        content: [
          {
            type: "text",
            text:
              `Generated ${kind} reflection ${reflection.id} ` +
              `(${new Date(fromTs).toISOString().slice(0, 10)} → ${new Date(toTs).toISOString().slice(0, 10)})\n\n` +
              reflection.body,
          },
        ],
      };
    },
  ),

  tool(
    "list_reflections",
    "List recent reflections so the user can see what the coach has been thinking about. Sorted newest first.",
    {
      kind: z.enum(["daily", "weekly", "monthly", "all"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ kind, limit }) => {
      const db = deps.storage.handle.db;
      const where = kind && kind !== "all" ? "WHERE kind = ?" : "";
      const params: unknown[] = [];
      if (kind && kind !== "all") params.push(kind);
      params.push(limit ?? 10);
      const rows = db
        .prepare(
          `SELECT id, kind, period_start, period_end, body, created_at
           FROM reflections ${where}
           ORDER BY period_end DESC LIMIT ?`,
        )
        .all(...params) as Array<{
        id: string;
        kind: string;
        period_start: number;
        period_end: number;
        body: string;
        created_at: number;
      }>;
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "No reflections yet." }] };
      }
      const formatted = rows
        .map((r) => {
          const start = new Date(r.period_start).toISOString().slice(0, 10);
          const end = new Date(r.period_end).toISOString().slice(0, 10);
          const firstLine = (r.body.split("\n").find((l) => l.trim().length > 0) ?? "").slice(0, 100);
          return `[${r.id}] ${r.kind} ${start}→${end}: ${firstLine}`;
        })
        .join("\n");
      return { content: [{ type: "text", text: formatted }] };
    },
  ),

  tool(
    "record_insight",
    "Save a generated recommendation/insight tied to the facts that support it.",
    {
      topic: z.string().min(1),
      body: z.string().min(1),
      rationale: z.string().optional(),
      sourceFactIds: z.array(z.string()).default([]),
    },
    async ({ topic, body, rationale, sourceFactIds }) => {
      // Stays stubbed for now — landed in Phase 4.2 (insights loop).
      void topic;
      void body;
      void rationale;
      void sourceFactIds;
      throw new NotImplementedError(
        "record_insight",
        "wire to storage.insights.create — coming in Phase 4.2 (insight loop)",
      );
    },
  ),
];
