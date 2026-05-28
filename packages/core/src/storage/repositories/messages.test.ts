import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ──────────────────────────────────────────────────────────────────

function seedMessages(
  storage: ReturnType<typeof createTestStorage>["storage"],
  count: number,
  role: "user" | "assistant" = "user",
  baseTs = Date.UTC(2026, 0, 1),
) {
  const session = storage.sessions.create();
  const msgs = [];
  for (let i = 0; i < count; i++) {
    // We cannot set created_at directly via append (it uses now()), so we
    // insert the session and messages close enough in time for ordering tests.
    const m = storage.messages.append({
      sessionId: session.id,
      role,
      content: `message ${i}`,
    });
    msgs.push(m);
  }
  return { session, msgs };
}

// ── MessageRepository.queryRange ─────────────────────────────────────────────

describe("MessageRepository.queryRange", () => {
  it("returns empty array when no messages exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const from = Date.UTC(2026, 0, 1);
    const to = Date.UTC(2026, 1, 1);
    expect(storage.messages.queryRange(from, to)).toEqual([]);
  });

  it("returns messages appended after seeding", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    const msg = storage.messages.append({
      sessionId: session.id,
      role: "user",
      content: "hello world",
    });

    // Use a wide window guaranteed to include the freshly-created message.
    const from = msg.createdAt - 1000;
    const to = msg.createdAt + 1000;
    const result = storage.messages.queryRange(from, to);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const found = result.find((m) => m.id === msg.id);
    expect(found).toBeDefined();
    expect(found?.content).toBe("hello world");
  });

  it("excludes messages outside the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    const msg = storage.messages.append({
      sessionId: session.id,
      role: "user",
      content: "outside",
    });

    // Query a range entirely before the message was created.
    const to = msg.createdAt - 100;
    const from = to - 1000;
    const result = storage.messages.queryRange(from, to);
    expect(result.find((m) => m.id === msg.id)).toBeUndefined();
  });

  it("upper bound is exclusive (to is not included)", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    const msg = storage.messages.append({ sessionId: session.id, role: "user", content: "edge" });

    // Set to = msg.createdAt exactly — the boundary message must be excluded.
    const result = storage.messages.queryRange(msg.createdAt - 1000, msg.createdAt);
    expect(result.find((m) => m.id === msg.id)).toBeUndefined();
  });

  it("returns all messages within the time window for the session", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    const m1 = storage.messages.append({ sessionId: session.id, role: "user", content: "first" });
    const m2 = storage.messages.append({ sessionId: session.id, role: "assistant", content: "second" });

    const from = Math.min(m1.createdAt, m2.createdAt) - 1;
    const to = Math.max(m1.createdAt, m2.createdAt) + 1000;
    const result = storage.messages.queryRange(from, to);
    const ids = result.map((m) => m.id);
    expect(ids).toContain(m1.id);
    expect(ids).toContain(m2.id);
  });
});

// ── MessageRepository.recentAssistantSessions ─────────────────────────────────

describe("MessageRepository.recentAssistantSessions", () => {
  it("returns empty array when no assistant messages exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const since = Date.now() - 60_000;
    expect(storage.messages.recentAssistantSessions(since, 10)).toEqual([]);
  });

  it("returns sessions containing assistant messages since sinceMs", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    storage.messages.append({ sessionId: session.id, role: "user", content: "hi" });
    const assistantMsg = storage.messages.append({
      sessionId: session.id,
      role: "assistant",
      content: "hello back",
    });

    const result = storage.messages.recentAssistantSessions(assistantMsg.createdAt - 1, 10);
    expect(result.some((r) => r.sessionId === session.id)).toBe(true);
  });

  it("excludes sessions with only user messages", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    storage.messages.append({ sessionId: session.id, role: "user", content: "just user" });

    const result = storage.messages.recentAssistantSessions(0, 10);
    expect(result.some((r) => r.sessionId === session.id)).toBe(false);
  });

  it("respects the limit parameter", () => {
    handle = createTestStorage();
    const { storage } = handle;

    for (let i = 0; i < 5; i++) {
      const s = storage.sessions.create();
      storage.messages.append({ sessionId: s.id, role: "assistant", content: `msg ${i}` });
    }

    const result = storage.messages.recentAssistantSessions(0, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("each result has sessionId and lastAt fields", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const session = storage.sessions.create();
    const m = storage.messages.append({ sessionId: session.id, role: "assistant", content: "x" });

    const result = storage.messages.recentAssistantSessions(m.createdAt - 1, 10);
    const row = result.find((r) => r.sessionId === session.id);
    expect(row).toBeDefined();
    expect(typeof row!.lastAt).toBe("number");
  });
});
