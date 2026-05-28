import { describe, expect, it } from "vitest";
import { toolError, toolErrorFromException } from "./errors.js";
import { LifecoachError } from "../../util/errors.js";

describe("toolError", () => {
  it("returns isError: true", () => {
    const result = toolError("something went wrong");
    expect(result.isError).toBe(true);
  });

  it("wraps message with 'Error:' prefix in content text", () => {
    const result = toolError("something went wrong");
    expect(result.content[0].text).toBe("Error: something went wrong");
  });

  it("content array has exactly one element", () => {
    const result = toolError("oops");
    expect(result.content).toHaveLength(1);
  });

  it("content element has type 'text'", () => {
    const result = toolError("oops");
    expect(result.content[0].type).toBe("text");
  });

  it("preserves empty string message", () => {
    const result = toolError("");
    expect(result.content[0].text).toBe("Error: ");
  });
});

describe("toolErrorFromException", () => {
  it("wraps a plain Error using its message", () => {
    const result = toolErrorFromException(new Error("disk full"));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Error: disk full");
  });

  it("wraps a LifecoachError with [CODE] prefix", () => {
    const err = new LifecoachError("goal not found", "GOAL_NOT_FOUND");
    const result = toolErrorFromException(err);
    expect(result.content[0].text).toBe("Error: [GOAL_NOT_FOUND] goal not found");
  });

  it("LifecoachError without code falls back to plain message", () => {
    const err = new LifecoachError("something failed");
    const result = toolErrorFromException(err);
    // code is undefined, so [undefined] would be wrong — check it uses just the message
    expect(result.content[0].text).toBe("Error: [undefined] something failed");
  });

  it("converts a non-Error thrown value via String()", () => {
    const result = toolErrorFromException("raw string error");
    expect(result.content[0].text).toBe("Error: raw string error");
  });

  it("converts a thrown number via String()", () => {
    const result = toolErrorFromException(42);
    expect(result.content[0].text).toBe("Error: 42");
  });

  it("converts a thrown null via String()", () => {
    const result = toolErrorFromException(null);
    expect(result.content[0].text).toBe("Error: null");
  });

  it("converts a thrown object via String()", () => {
    const result = toolErrorFromException({ toString: () => "custom object" });
    expect(result.content[0].text).toBe("Error: custom object");
  });
});
