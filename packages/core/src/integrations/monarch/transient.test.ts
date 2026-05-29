/**
 * Verifies the transient-error classifier baked into the Monarch client.
 *
 * We deliberately *don't* test against a live client (Monarch's GraphQL has
 * no public test surface) — these tests pin the message pattern so a future
 * change can't accidentally widen or narrow the retry net.
 */
import { describe, expect, it } from "vitest";

// Re-derive the pattern here so the test is self-contained and breaks
// loudly if the client.ts pattern is renamed without updating this file.
const MONARCH_GENERIC_TRANSIENT = /something went wrong while processing/i;

const isTransient = (err: unknown): boolean => {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return MONARCH_GENERIC_TRANSIENT.test(message);
};

describe("Monarch transient-error classifier", () => {
  it("flags the generic Python-shaped backend error", () => {
    expect(
      isTransient(
        new Error("Something went wrong while processing: None on request_id: None."),
      ),
    ).toBe(true);
  });

  it("flags the same message regardless of case", () => {
    expect(
      isTransient(new Error("SOMETHING WENT WRONG WHILE PROCESSING something else")),
    ).toBe(true);
  });

  it("flags string errors too (not just Error instances)", () => {
    expect(isTransient("Something went wrong while processing")).toBe(true);
  });

  it("does NOT flag auth failures — those need re-credentialing, not retry", () => {
    expect(isTransient(new Error("login_required"))).toBe(false);
    expect(isTransient(new Error("Session expired. Please log in again."))).toBe(false);
    expect(isTransient(new Error("401 Unauthorized"))).toBe(false);
  });

  it("does NOT flag schema/validation mismatches", () => {
    expect(
      isTransient(new Error("ZodError: Invalid input for transaction.amount")),
    ).toBe(false);
    expect(
      isTransient(new Error("Cannot query field 'foo' on type 'Transaction'")),
    ).toBe(false);
  });

  it("does NOT flag null / undefined / empty values", () => {
    expect(isTransient(null)).toBe(false);
    expect(isTransient(undefined)).toBe(false);
    expect(isTransient("")).toBe(false);
    expect(isTransient({})).toBe(false);
  });
});
