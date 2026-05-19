import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";

const categoryEnum = z.enum([
  "health",
  "preference",
  "recipe",
  "task",
  "routine",
  "goal",
  "relationship",
  "other",
]);

export const buildRememberTools = (memory: Memory) => [
  tool(
    "remember",
    "Persist a new fact about the user. Use whenever the user shares something durable (allergy, preference, routine, recent symptom, goal). The fact is auto-embedded so future `recall` calls can find it. Use a concise natural-language `body` — the user's own phrasing is great.",
    {
      category: categoryEnum.describe("High-level bucket for this fact"),
      subject: z.string().min(1).describe("Short tag, e.g. 'allergy', 'sleep', 'breakfast-routine'"),
      body: z.string().min(1).describe("The fact itself, in natural language"),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional structured payload (e.g. {items: ['peanuts', 'dairy']})"),
      confidence: z.number().min(0).max(1).optional().describe("Default 1.0"),
      validUntil: z
        .number()
        .int()
        .optional()
        .describe("Unix ms timestamp after which this fact should be considered stale"),
    },
    async ({ category, subject, body, data, confidence, validUntil }) => {
      const created = await memory.semantic.remember({
        category,
        subject,
        body,
        ...(data !== undefined ? { data } : {}),
        confidence: confidence ?? 1.0,
        validTo: validUntil ?? null,
      });
      return {
        content: [
          {
            type: "text",
            text: `Remembered fact ${created.id} [${created.category}/${created.subject}]: ${created.body}`,
          },
        ],
      };
    },
  ),

  tool(
    "forget",
    "Soft-delete a fact (sets validTo=now). Use when the user corrects or retracts something. The fact stays in the DB for audit but no longer surfaces in recall.",
    {
      id: z.string().min(1).describe("ID returned by `remember` or shown by `recall`"),
    },
    async ({ id }) => {
      const existing = memory.semantic.getFact(id);
      if (!existing) {
        return { content: [{ type: "text", text: `No fact found with id ${id}.` }] };
      }
      memory.semantic.forget(id);
      return {
        content: [
          {
            type: "text",
            text: `Forgot fact ${id} [${existing.category}/${existing.subject}].`,
          },
        ],
      };
    },
  ),
];
