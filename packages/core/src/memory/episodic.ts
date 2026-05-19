import type { Message, NewMessage, Session } from "@lifecoach/schemas";
import type { Storage } from "../storage/index.js";

export class EpisodicMemory {
  constructor(private readonly storage: Storage) {}

  startSession(): Session {
    return this.storage.sessions.create();
  }

  endSession(id: string, summary?: string): void {
    this.storage.sessions.end(id, summary);
  }

  appendMessage(message: NewMessage): Message {
    return this.storage.messages.append(message);
  }

  forSession(sessionId: string): Message[] {
    return this.storage.messages.forSession(sessionId);
  }

  recent(opts: { days?: number; limit?: number } = {}): Message[] {
    const sinceMs = opts.days !== undefined
      ? Date.now() - opts.days * 24 * 60 * 60 * 1000
      : 0;
    return this.storage.messages.recent({ sinceMs, limit: opts.limit });
  }

  recentSessions(limit = 10): Session[] {
    return this.storage.sessions.recent(limit);
  }
}
