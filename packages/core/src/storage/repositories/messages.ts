import type { Database } from "better-sqlite3";
import type { Message, MessageRole, NewMessage } from "@lifecoach/schemas";
import { newId, now } from "../../util/ids.js";
import { parseToolUse } from "../../util/json.js";

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_use: string | null;
  created_at: number;
}

const rowToMessage = (row: MessageRow): Message => ({
  id: row.id,
  sessionId: row.session_id,
  role: row.role as MessageRole,
  content: row.content,
  toolUse: parseToolUse(row.tool_use),
  createdAt: row.created_at,
});

export class MessageRepository {
  constructor(private readonly db: Database) {}

  append(message: NewMessage): Message {
    const id = newId();
    const createdAt = now();
    this.db
      .prepare(
        "INSERT INTO messages(id, session_id, role, content, tool_use, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        message.sessionId,
        message.role,
        message.content,
        message.toolUse ? JSON.stringify(message.toolUse) : null,
        createdAt,
      );
    return { id, createdAt, ...message };
  }

  forSession(sessionId: string): Message[] {
    const rows = this.db
      .prepare(
        "SELECT id, session_id, role, content, tool_use, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
      )
      .all(sessionId) as MessageRow[];
    return rows.map(rowToMessage);
  }

  recent(opts: { sinceMs?: number; limit?: number } = {}): Message[] {
    const limit = opts.limit ?? 50;
    const since = opts.sinceMs ?? 0;
    const rows = this.db
      .prepare(
        "SELECT id, session_id, role, content, tool_use, created_at FROM messages WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(since, limit) as MessageRow[];
    return rows.map(rowToMessage);
  }

  /** All messages within `[from, to)`, oldest first. Reflector context window. */
  queryRange(fromMs: number, toMs: number): Message[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, role, content, tool_use, created_at
         FROM messages
         WHERE created_at >= ? AND created_at < ?
         ORDER BY created_at ASC`,
      )
      .all(fromMs, toMs) as MessageRow[];
    return rows.map(rowToMessage);
  }

  /**
   * Session IDs with at least one assistant message since `sinceMs`, ordered
   * by most recent assistant message. Used by the artifact scanner to
   * enumerate sessions that may have produced a new artifact since the
   * previous cron run.
   */
  recentAssistantSessions(sinceMs: number, limit: number): Array<{ sessionId: string; lastAt: number }> {
    return this.db
      .prepare(
        `SELECT session_id AS sessionId, MAX(created_at) AS lastAt
         FROM messages
         WHERE created_at >= ? AND role = 'assistant'
         GROUP BY session_id
         ORDER BY lastAt DESC
         LIMIT ?`,
      )
      .all(sinceMs, limit) as Array<{ sessionId: string; lastAt: number }>;
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) as c FROM messages").get() as {
      c: number;
    };
    return row.c;
  }
}
