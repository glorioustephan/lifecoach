import { describe, expect, it } from "vitest";
import { parseStringArray } from "./json.js";

describe("parseStringArray", () => {
  it("parses a valid JSON array of strings", () => {
    expect(parseStringArray('["a","b","c"]')).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for null input", () => {
    expect(parseStringArray(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(parseStringArray(undefined)).toEqual([]);
  });

  it("returns empty array for empty string input", () => {
    expect(parseStringArray("")).toEqual([]);
  });

  it("filters out non-string elements from a mixed array", () => {
    expect(parseStringArray('["valid", 42, null, true, "also-valid"]')).toEqual([
      "valid",
      "also-valid",
    ]);
  });

  it("returns empty array when JSON is a non-array value (object)", () => {
    expect(parseStringArray('{"key":"value"}')).toEqual([]);
  });

  it("returns empty array when JSON is a non-array value (string scalar)", () => {
    expect(parseStringArray('"just a string"')).toEqual([]);
  });

  it("returns empty array when JSON is a non-array value (number scalar)", () => {
    expect(parseStringArray("42")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(parseStringArray("[unclosed")).toEqual([]);
  });

  it("returns empty array for malformed JSON with trailing garbage", () => {
    expect(parseStringArray('["a"]garbage')).toEqual([]);
  });

  it("parses an empty JSON array", () => {
    expect(parseStringArray("[]")).toEqual([]);
  });

  it("parses a single-element array", () => {
    expect(parseStringArray('["only"]')).toEqual(["only"]);
  });

  it("filters every element when all are non-strings", () => {
    expect(parseStringArray("[1, 2, 3]")).toEqual([]);
  });
});
