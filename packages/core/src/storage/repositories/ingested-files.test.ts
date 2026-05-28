import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ───────────────────────────────────────────────────────────────────

let fileCounter = 0;

function seedFile(
  storage: ReturnType<typeof createTestStorage>["storage"],
  overrides: Partial<{ hash: string; path: string; sizeBytes: number }> = {},
) {
  fileCounter += 1;
  // ingested_files.document_id FK references documents(id) — must create the
  // document first to satisfy the constraint.
  const doc = storage.documents.create({
    source: "test",
    body: `doc body ${fileCounter}`,
  });
  return storage.ingestedFiles.record({
    hash: overrides.hash ?? `hash-${fileCounter}`,
    path: overrides.path ?? `/docs/file-${fileCounter}.md`,
    documentId: doc.id,
    sizeBytes: overrides.sizeBytes ?? 1024,
  });
}

// ── IngestedFileRepository.recent ────────────────────────────────────────────

describe("IngestedFileRepository.recent", () => {
  it("returns empty array when no files have been ingested", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.ingestedFiles.recent(10)).toEqual([]);
  });

  it("returns both ingested files when limit is sufficient", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const f1 = seedFile(storage);
    const f2 = seedFile(storage);

    const result = storage.ingestedFiles.recent(10);
    const hashes = result.map((f) => f.hash);
    expect(hashes).toContain(f1.hash);
    expect(hashes).toContain(f2.hash);
  });

  it("respects the limit parameter", () => {
    handle = createTestStorage();
    const { storage } = handle;

    for (let i = 0; i < 5; i++) seedFile(storage);

    const result = storage.ingestedFiles.recent(3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("returns all fields on each entry", () => {
    handle = createTestStorage();
    const { storage } = handle;

    seedFile(storage, { hash: "sha-abc", path: "/notes/foo.md", sizeBytes: 2048 });
    const result = storage.ingestedFiles.recent(1);
    expect(result[0]?.hash).toBe("sha-abc");
    expect(result[0]?.path).toBe("/notes/foo.md");
    expect(result[0]?.sizeBytes).toBe(2048);
    expect(result[0]?.documentId).toBeDefined();
    expect(typeof result[0]?.ingestedAt).toBe("number");
  });

  it("default limit is 50 when none is provided", () => {
    handle = createTestStorage();
    const { storage } = handle;

    for (let i = 0; i < 60; i++) seedFile(storage);

    const result = storage.ingestedFiles.recent();
    expect(result.length).toBeLessThanOrEqual(50);
  });
});
