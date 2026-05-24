import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";

export const buildRecallTool = (memory: Memory) =>
  tool(
    "recall",
    "Search the user's memory by meaning. Use this whenever you need context the user hasn't restated in this session — past mentions of a topic, related facts, prior conversations, tasks, reflections, ingested documents. Returns scored snippets.",
    {
      query: z.string().min(1).describe("Natural-language search query"),
      scope: z
        .enum(["facts", "documents", "messages", "reflections", "tasks", "all"])
        .optional()
        .describe("Where to search. Default: all."),
      limit: z.number().int().min(1).max(50).optional().describe("Max hits to return. Default: 8."),
    },
    async ({ query, scope, limit }) => {
      const hits = await memory.semantic.recall(query, { scope, limit });
      if (hits.length === 0) {
        return {
          content: [
            { type: "text", text: `No matches for "${query}".` },
          ],
        };
      }
      const text = hits
        .map(
          (h, i) =>
            `${i + 1}. (${h.refType} ${h.refId} score=${h.score.toFixed(3)})\n   ${h.text}`,
        )
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );
