import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";
import { NotImplementedError } from "../../util/errors.js";

export const buildReflectionTools = (memory: Memory) => [
  tool(
    "summarize_period",
    "Produce a reflection (summary) over a time range and persist it. Use weekly check-ins. Requires the agent itself to write the summary — not yet wired.",
    {
      from: z.number().int(),
      to: z.number().int(),
      kind: z.enum(["daily", "weekly", "monthly"]),
    },
    async ({ from, to, kind }) => {
      throw new NotImplementedError(
        "summarize_period",
        "implement in packages/core/src/memory/reflections.ts — call agent for summary, then memory.reflections.record(...)",
      );
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
      throw new NotImplementedError(
        "record_insight",
        "wire to storage.insights.create — repo is implemented",
      );
    },
  ),
];
