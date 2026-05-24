import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("JobRepository", () => {
  it("prevents overlapping runs and releases the lock on success", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const first = storage.jobs.start("sync.todoist");
    expect(first?.status).toBe("running");
    const second = storage.jobs.start("sync.todoist");
    expect(second).toBeNull();

    const finished = storage.jobs.finish(first!.id, [
      { refType: "task", refId: "task-1" },
    ]);
    expect(finished.status).toBe("success");
    expect(finished.generatedRefs).toEqual([{ refType: "task", refId: "task-1" }]);

    const third = storage.jobs.start("sync.todoist");
    expect(third?.status).toBe("running");
  });

  it("records failures and clears the lock", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    await expect(
      storage.jobs.run("insights.generate", async () => {
        throw new Error("provider unavailable");
      }),
    ).rejects.toThrow("provider unavailable");

    const [failed] = storage.jobs.recent("insights.generate", 1);
    expect(failed?.status).toBe("failed");
    expect(failed?.errorSummary).toContain("provider unavailable");

    const next = storage.jobs.start("insights.generate");
    expect(next?.status).toBe("running");
  });
});
