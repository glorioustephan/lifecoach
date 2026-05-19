import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Memory } from "@lifecoach/core";

/**
 * Register the same memory tool surface that the Agent SDK uses, but as MCP tools
 * so external clients (Claude Code, MCP Inspector, etc.) can drive the same memory.
 *
 * Note: we intentionally re-declare the tools here rather than reusing the
 * @anthropic-ai/claude-agent-sdk `tool()` helpers, because the two SDKs have
 * different shapes for tool registration. The handler bodies stay tiny and
 * delegate to the same memory layer.
 */
export const registerMemoryTools = (server: McpServer, memory: Memory): void => {
  server.tool(
    "get_profile",
    "Read the user's identity profile (name, dosha, allergies, goals, etc.).",
    {},
    async () => {
      const profile = memory.identity.get();
      const text =
        Object.keys(profile).length === 0
          ? "(empty)"
          : JSON.stringify(profile, null, 2);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "set_profile",
    "Set a single stable identity fact about the user.",
    {
      key: z.string().min(1),
      value: z.unknown(),
    },
    async ({ key, value }) => {
      memory.identity.set(key, value);
      return {
        content: [{ type: "text", text: `Profile updated: ${key} = ${JSON.stringify(value)}` }],
      };
    },
  );

  server.tool(
    "recall",
    "Semantic search across the user's memory.",
    {
      query: z.string().min(1),
      scope: z.enum(["facts", "documents", "messages", "reflections", "all"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, scope, limit }) => {
      const hits = await memory.semantic.recall(query, { scope, limit });
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No matches for "${query}".` }] };
      }
      const text = hits
        .map((h, i) => `${i + 1}. (${h.refType} ${h.refId} score=${h.score.toFixed(3)})\n   ${h.text}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "remember",
    "Persist a new fact about the user.",
    {
      category: z.enum([
        "health",
        "preference",
        "recipe",
        "task",
        "routine",
        "goal",
        "relationship",
        "other",
      ]),
      subject: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.string(), z.unknown()).optional(),
      confidence: z.number().min(0).max(1).optional(),
      validUntil: z.number().int().optional(),
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
            text: `Remembered ${created.id} [${created.category}/${created.subject}]`,
          },
        ],
      };
    },
  );

  server.tool(
    "list_recent_interactions",
    "List recent messages exchanged with the user.",
    {
      days: z.number().int().min(1).max(365).optional(),
      limit: z.number().int().min(1).max(200).optional(),
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
  );
};
