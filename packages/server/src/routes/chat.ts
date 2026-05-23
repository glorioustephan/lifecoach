import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { Lifecoach } from "@lifecoach/core";
import { streamChatTurn } from "../lib/stream-bridge.js";

const sendSchema = z.object({
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1),
});

export const chatRoutes = (lc: Lifecoach) => {
  const app = new Hono();

  // List recent sessions for the past-conversations sheet. Each session is
  // enriched with a short preview (the first user message, truncated) and
  // a message count so the sheet can render meaningful row labels.
  app.get("/sessions", (c) => {
    const limit = Number(c.req.query("limit") ?? "30");
    const archived = c.req.query("archived") === "true";
    const sessions = archived
      ? lc.storage.sessions.archived(limit)
      : lc.memory.episodic.recentSessions(limit);
    const rows = sessions.map((session) => {
      const messages = lc.memory.episodic.forSession(session.id);
      const firstUser = messages.find((m) => m.role === "user");
      const preview = firstUser
        ? firstUser.content.replace(/\s+/g, " ").trim().slice(0, 140)
        : null;
      return {
        ...session,
        messageCount: messages.length,
        preview,
      };
    });
    return c.json({ sessions: rows });
  });

  // Fetch a specific session's full message list.
  app.get("/sessions/:id", (c) => {
    const id = c.req.param("id");
    const session = lc.storage.sessions.get(id);
    if (!session) return c.json({ error: "not_found" }, 404);
    const messages = lc.memory.episodic.forSession(id);
    return c.json({ session, messages });
  });

  // Start a fresh session. Returns the session row so the client can route to /c/$id.
  app.post("/sessions", (c) => {
    const session = lc.agent.startSession();
    return c.json({ session });
  });

  // End a session (called when the user explicitly closes one or navigates away).
  app.post("/sessions/:id/end", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const summary = typeof body?.summary === "string" ? body.summary : undefined;
    lc.agent.endSession(id, summary);
    return c.json({ ok: true });
  });

  // Archive a session (hide from main session list).
  app.post("/sessions/:id/archive", (c) => {
    const id = c.req.param("id");
    const session = lc.storage.sessions.get(id);
    if (!session) return c.json({ error: "not_found" }, 404);
    lc.storage.sessions.archive(id);
    return c.json({ ok: true });
  });

  // Unarchive a session (restore to main session list).
  app.post("/sessions/:id/unarchive", (c) => {
    const id = c.req.param("id");
    const session = lc.storage.sessions.get(id);
    if (!session) return c.json({ error: "not_found" }, 404);
    lc.storage.sessions.unarchive(id);
    return c.json({ ok: true });
  });

  // The streaming chat endpoint. SSE; events match the ChatEvent shape from
  // stream-bridge.ts, one event per line as `data: <json>`.
  app.post("/send", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = sendSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);
    }
    const { message } = parsed.data;
    const sessionId = parsed.data.sessionId ?? lc.agent.startSession().id;

    return streamSSE(c, async (stream) => {
      // Tell the client which session this turn is bound to so it can navigate
      // to /c/$id without a separate round-trip.
      await stream.writeSSE({
        event: "session",
        data: JSON.stringify({ sessionId }),
      });

      for await (const event of streamChatTurn(lc, { sessionId, userMessage: message })) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      }
    });
  });

  return app;
};
