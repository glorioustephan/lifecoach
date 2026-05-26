/**
 * Tests for SemanticMemory.keywordFallback when no embedder is configured.
 * Previously, recall with scopes other than "facts"/"all" would silently
 * return [] even when matching rows existed in the DB.
 */
import { afterEach, describe, expect, it } from "vitest";
import { NullEmbedder } from "../embeddings/index.js";
import { SemanticMemory } from "./semantic.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("SemanticMemory keyword fallback (NullEmbedder)", () => {
  it("returns message matches when scope=messages", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    const session = storage.sessions.create();
    storage.messages.append({
      sessionId: session.id,
      role: "user",
      content: "My fasting glucose is 92 mg/dL this morning.",
    });
    storage.messages.append({
      sessionId: session.id,
      role: "assistant",
      content: "That sounds healthy — well within range.",
    });

    const memory = new SemanticMemory({ storage, embedder: new NullEmbedder(2) });
    const hits = await memory.recall("glucose", { scope: "messages", limit: 10 });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.refType).toBe("message");
    expect(hits[0]?.text).toMatch(/glucose/i);
  });

  it("returns document matches when scope=documents", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    storage.documents.create({
      source: "file-drop",
      title: "Blood panel April 2025",
      body: "Hemoglobin A1c: 5.1%. LDL: 98 mg/dL. HDL: 62 mg/dL.",
    });

    const memory = new SemanticMemory({ storage, embedder: new NullEmbedder(2) });
    const hits = await memory.recall("hemoglobin", { scope: "documents", limit: 5 });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.refType).toBe("document");
    expect(hits[0]?.text).toMatch(/Blood panel/i);
  });

  it("returns task matches when scope=tasks", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    storage.tasks.upsertByExternal({
      externalId: "t-1",
      externalSource: "todoist",
      content: "Schedule annual physical",
      labels: [],
    });
    // Completed task should not appear.
    const completed = storage.tasks.upsertByExternal({
      externalId: "t-2",
      externalSource: "todoist",
      content: "Schedule dental checkup",
      labels: [],
    });
    storage.tasks.completeTask(completed.id);

    const memory = new SemanticMemory({ storage, embedder: new NullEmbedder(2) });
    const hits = await memory.recall("schedule", { scope: "tasks", limit: 10 });

    expect(hits.length).toBe(1);
    expect(hits[0]?.refType).toBe("task");
    expect(hits[0]?.text).toMatch(/physical/i);
  });

  it("returns fact matches for scope=all alongside other scopes", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    // A fact with the keyword
    storage.facts.create({
      category: "health",
      subject: "diet",
      body: "Avoids gluten due to sensitivity.",
      confidence: 1,
    });
    // A document with the keyword
    storage.documents.create({
      source: "file-drop",
      title: "Gluten notes",
      body: "Notes on gluten-free living.",
    });

    const memory = new SemanticMemory({ storage, embedder: new NullEmbedder(2) });
    const hits = await memory.recall("gluten", { scope: "all", limit: 10 });

    const types = new Set(hits.map((h) => h.refType));
    expect(types.has("fact")).toBe(true);
    expect(types.has("document")).toBe(true);
  });
});
