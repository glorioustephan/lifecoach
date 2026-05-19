import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Memory } from "../../memory/index.js";

export const buildEpisodicTools = (memory: Memory) => [
  tool(
    "list_recent_interactions",
    "List recent messages exchanged between the user and you (across sessions). Use when the user asks about prior conversations or you want to know what they last brought up.",
    {
      days: z.number().int().min(1).max(365).optional().describe("Look back this many days. Default: 14."),
      limit: z.number().int().min(1).max(200).optional().describe("Max messages. Default: 30."),
    },
    async ({ days, limit }) => {
      const messages = memory.episodic.recent({ days: days ?? 14, limit: limit ?? 30 });
      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No interactions in this window." }] };
      }
      const lines = messages
        .reverse()
        .map((m) => {
          const ts = new Date(m.createdAt).toISOString().slice(0, 16).replace("T", " ");
          return `[${ts}] ${m.role}: ${m.content}`;
        });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  ),
];
