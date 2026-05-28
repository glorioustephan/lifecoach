import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── ProjectRepository.findByBodyContains ──────────────────────────────────────

describe("ProjectRepository.findByBodyContains", () => {
  it("returns undefined when no project has the needle in its body", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.projects.create({ title: "Empty Project", status: "active" });

    expect(storage.projects.findByBodyContains("[capacities:abc123]")).toBeUndefined();
  });

  it("returns undefined when no projects exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.projects.findByBodyContains("anything")).toBeUndefined();
  });

  it("returns a project whose body contains the needle", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({
      title: "Research Project",
      body: "Overview. [capacities:obj-456] Notes here.",
      status: "active",
    });

    const result = storage.projects.findByBodyContains("[capacities:obj-456]");
    expect(result?.id).toBe(p.id);
  });

  it("does not return a project whose body does not contain the needle", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.projects.create({
      title: "Other Project",
      body: "No sentinel here",
      status: "active",
    });

    const result = storage.projects.findByBodyContains("[capacities:obj-999]");
    expect(result).toBeUndefined();
  });

  it("needle match works regardless of surrounding text", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.projects.create({
      title: "Rich Body Project",
      body: "Introduction text. [capacities:obj-100] More content follows.",
      status: "active",
    });

    const result = storage.projects.findByBodyContains("[capacities:obj-100]");
    expect(result).toBeDefined();
    expect(result?.title).toBe("Rich Body Project");
  });

  it("returns only the first match when multiple projects contain the needle", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.projects.create({ title: "P1", body: "[marker:x]", status: "active" });
    storage.projects.create({ title: "P2", body: "[marker:x]", status: "active" });

    const result = storage.projects.findByBodyContains("[marker:x]");
    expect(result).toBeDefined(); // one of them
  });
});

// ── ProjectRepository.updateContent ──────────────────────────────────────────

describe("ProjectRepository.updateContent", () => {
  it("updates the title field", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({ title: "Old Title", body: "Body content", status: "active" });
    storage.projects.updateContent(p.id, { title: "New Title" });

    const updated = storage.projects.get(p.id);
    expect(updated?.title).toBe("New Title");
  });

  it("updates the body field", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({ title: "Project", body: "Old body", status: "active" });
    storage.projects.updateContent(p.id, { body: "New body content" });

    const updated = storage.projects.get(p.id);
    expect(updated?.body).toBe("New body content");
  });

  it("updates both title and body in the same call", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({ title: "Stale Title", body: "Stale body", status: "active" });
    storage.projects.updateContent(p.id, { title: "Fresh Title", body: "Fresh body" });

    const updated = storage.projects.get(p.id);
    expect(updated?.title).toBe("Fresh Title");
    expect(updated?.body).toBe("Fresh body");
  });

  it("is a no-op when an empty patch is provided", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({ title: "Stable", body: "Stable body", status: "active" });
    const before = storage.projects.get(p.id)!;
    storage.projects.updateContent(p.id, {});
    const after = storage.projects.get(p.id)!;

    expect(after.title).toBe(before.title);
    expect(after.body).toBe(before.body);
  });

  it("updates updated_at timestamp after a content change", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const p = storage.projects.create({ title: "Timestamped", body: "original", status: "active" });
    const before = storage.projects.get(p.id)!;

    storage.projects.updateContent(p.id, { body: "modified" });
    const after = storage.projects.get(p.id)!;

    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });
});
