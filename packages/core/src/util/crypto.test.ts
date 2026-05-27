import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, isEncryptionAvailable } from "./crypto.js";

const KEY = "test-secret-key-do-not-use-in-prod";

describe("crypto field encryption", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.LIFECOACH_SECRET_KEY;
    process.env.LIFECOACH_SECRET_KEY = KEY;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.LIFECOACH_SECRET_KEY;
    else process.env.LIFECOACH_SECRET_KEY = prev;
  });

  it("round-trips a value", () => {
    const plain = "hunter2 — café 🔐";
    const blob = encryptSecret(plain);
    expect(blob).not.toContain(plain);
    expect(blob.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(blob)).toBe(plain);
  });

  it("produces distinct ciphertext for the same plaintext (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails to decrypt when the key changes", () => {
    const blob = encryptSecret("secret");
    process.env.LIFECOACH_SECRET_KEY = "a-different-key";
    expect(() => decryptSecret(blob)).toThrow();
  });

  it("rejects non-encrypted input", () => {
    expect(() => decryptSecret("plaintext")).toThrow();
  });

  it("reports availability based on the env var", () => {
    expect(isEncryptionAvailable()).toBe(true);
    delete process.env.LIFECOACH_SECRET_KEY;
    expect(isEncryptionAvailable()).toBe(false);
    expect(() => encryptSecret("x")).toThrow();
  });
});
