import { describe, it, expect, afterEach } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import { pushReflectionToCapacities } from "./reflection-writeback.js";
import type { CapacitiesClient } from "./client.js";

let handle: TestStorageHandle | null = null;
afterEach(() => {
  handle?.cleanup();
  handle = null;
});

/** Fake client that just counts how many times the daily note was appended to. */
const fakeClient = () => {
  let calls = 0;
  const client = {
    saveToDailyNote: async () => {
      calls += 1;
    },
  } as unknown as CapacitiesClient;
  return { client, calls: () => calls };
};

const makeReflection = (storage: TestStorageHandle["storage"]) =>
  storage.reflections.create({
    periodStart: 0,
    periodEnd: 1,
    kind: "daily",
    body: "A short daily reflection.",
    themes: [],
    wins: [],
    concerns: [],
    openThreads: [],
  });

describe("pushReflectionToCapacities idempotency", () => {
  it("pushes once, then skips subsequent pushes of the same reflection", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    const reflection = makeReflection(storage);
    const fake = fakeClient();

    const first = await pushReflectionToCapacities(reflection, {
      enabled: true,
      spaceId: "space-1",
      client: fake.client,
      tracker: storage.reflections,
    });
    expect(first.pushed).toBe(true);
    expect(fake.calls()).toBe(1);
    expect(storage.reflections.wasPushedToCapacities(reflection.id)).toBe(true);

    const second = await pushReflectionToCapacities(reflection, {
      enabled: true,
      spaceId: "space-1",
      client: fake.client,
      tracker: storage.reflections,
    });
    expect(second.pushed).toBe(false);
    expect(second.reason).toBe("already_pushed");
    // No second append — this is the bug that spammed the daily note.
    expect(fake.calls()).toBe(1);
  });

  it("does not mark as pushed when the append fails (so a retry can succeed)", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    const reflection = makeReflection(storage);
    const throwingClient = {
      saveToDailyNote: async () => {
        throw new Error("network down");
      },
    } as unknown as CapacitiesClient;

    await expect(
      pushReflectionToCapacities(reflection, {
        enabled: true,
        spaceId: "space-1",
        client: throwingClient,
        tracker: storage.reflections,
      }),
    ).rejects.toThrow("network down");
    expect(storage.reflections.wasPushedToCapacities(reflection.id)).toBe(false);
  });
});

describe("ReflectionRepository.findByPeriod", () => {
  it("returns an existing reflection for the same (kind, period) window", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const created = makeReflection(storage);
    const found = storage.reflections.findByPeriod("daily", 0, 1);
    expect(found?.id).toBe(created.id);
    expect(storage.reflections.findByPeriod("daily", 100, 200)).toBeUndefined();
  });
});

describe("SessionRepository.setSdkSessionId", () => {
  it("round-trips the SDK session id used to resume conversations", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const session = storage.sessions.create();
    expect(storage.sessions.get(session.id)?.sdkSessionId ?? null).toBeNull();
    storage.sessions.setSdkSessionId(session.id, "sdk-abc-123");
    expect(storage.sessions.get(session.id)?.sdkSessionId).toBe("sdk-abc-123");
  });
});
