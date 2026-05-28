import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ───────────────────────────────────────────────────────────────────

let taskCounter = 0;

function seedTask(
  storage: ReturnType<typeof createTestStorage>["storage"],
  completedAt?: number,
) {
  taskCounter += 1;
  return storage.tasks.upsertByExternal({
    externalId: `ext-task-${taskCounter}`,
    externalSource: "todoist",
    content: `Task ${taskCounter}`,
    labels: [],
    completedAt: completedAt ?? null,
  });
}

// ── TaskRepository.completedRange ─────────────────────────────────────────────

describe("TaskRepository.completedRange", () => {
  it("returns empty array when no tasks are completed", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.tasks.completedRange(0, Date.now() + 1000)).toEqual([]);
  });

  it("returns tasks completed within the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const now = Date.now();
    const task = seedTask(storage, now);

    const result = storage.tasks.completedRange(task.completedAt! - 1, task.completedAt! + 1000);
    expect(result.some((t) => t.id === task.id)).toBe(true);
  });

  it("excludes tasks not completed (completedAt is null)", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const task = seedTask(storage); // no completedAt
    expect(task.completedAt).toBeNull();

    const result = storage.tasks.completedRange(0, Date.now() + 1000);
    expect(result.find((t) => t.id === task.id)).toBeUndefined();
  });

  it("excludes tasks completed outside the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const completedAt = Date.UTC(2026, 0, 15);
    const task = seedTask(storage, completedAt);

    // Query after the completion time.
    const from = completedAt + 1000;
    const to = completedAt + 100_000;
    const result = storage.tasks.completedRange(from, to);
    expect(result.find((t) => t.id === task.id)).toBeUndefined();
  });

  it("upper bound is exclusive", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const completedAt = Date.UTC(2026, 2, 1);
    const task = seedTask(storage, completedAt);

    // to = completedAt exactly → task must be excluded.
    const result = storage.tasks.completedRange(completedAt - 1000, completedAt);
    expect(result.find((t) => t.id === task.id)).toBeUndefined();
  });

  it("returns results ordered by completedAt ascending", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const t1 = seedTask(storage, Date.UTC(2026, 3, 1));
    const t2 = seedTask(storage, Date.UTC(2026, 3, 15));

    const from = Date.UTC(2026, 3, 1) - 1;
    const to = Date.UTC(2026, 3, 16);
    const result = storage.tasks.completedRange(from, to);
    const ids = result.map((t) => t.id);
    expect(ids.indexOf(t1.id)).toBeLessThan(ids.indexOf(t2.id));
  });
});
