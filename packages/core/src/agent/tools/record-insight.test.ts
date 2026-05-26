/**
 * Integration test for the record_insight agent tool.
 * Previously this tool threw NotImplementedError unconditionally.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NullEmbedder } from "../../embeddings/index.js";
import { buildReflectionTools } from "./reflections.js";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import { createMemory } from "../../memory/index.js";

// Cast to bypass SDK's intersection type on the handler — each tool only
// accepts its own specific schema but TypeScript sees the intersection of all tools'.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (args: Record<string, unknown>, extra: unknown) => Promise<any>;

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("record_insight tool", () => {
  it("persists an insight to storage and returns its id", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    const embedder = new NullEmbedder(2);
    const memory = createMemory(storage, embedder);

    const tools = buildReflectionTools({ memory, storage, reflector: null });
    const recordInsight = tools.find((t) => t.name === "record_insight");
    expect(recordInsight).toBeDefined();

    const result = await (recordInsight!.handler as unknown as AnyHandler)(
      {
        topic: "Sleep onset drifting later",
        body: "Your bedtime has shifted by ~90 minutes over the past week.",
        rationale: "This is the first time the pattern has crossed 11pm consistently.",
        sourceFactIds: [],
        priority: 2,
      },
      {},
    );

    // result.content is a union of content types; the first item is text here.
    const firstContent = result.content[0]!;
    const text = "text" in firstContent ? firstContent.text : "";
    expect(text).toMatch(/Saved insight/);

    // Verify it actually landed in the DB.
    const active = storage.insights.list({ state: "active" });
    expect(active.length).toBe(1);
    expect(active[0]?.topic).toBe("Sleep onset drifting later");
    expect(active[0]?.priority).toBe(2);
  });
});
