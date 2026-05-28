import { describe, expect, it } from "vitest";
import {
  parseEnumQuery,
  parseLimit,
  parseOffsetPagination,
  parseOptionalFiniteNumber,
  parsePagination,
} from "./query.js";

const reader = (values: Record<string, string | undefined>) => (key: string) => values[key];

describe("query helpers", () => {
  it("defaults and clamps pagination", () => {
    expect(
      parsePagination(reader({ limit: "500", page: "3" }), {
        defaultLimit: 25,
        maxLimit: 100,
      }),
    ).toEqual({ limit: 100, page: 3, offset: 200 });
  });

  it("falls back for invalid pagination input", () => {
    expect(
      parsePagination(reader({ limit: "nope", page: "-1" }), {
        defaultLimit: 25,
        maxLimit: 100,
      }),
    ).toEqual({ limit: 25, page: 1, offset: 0 });
  });

  it("parses offset pagination safely", () => {
    expect(
      parseOffsetPagination(reader({ limit: "2", offset: "-8" }), {
        defaultLimit: 20,
        maxLimit: 100,
      }),
    ).toEqual({ limit: 2, offset: 0 });
  });

  it("parses limits, enums, and optional finite numbers", () => {
    expect(parseLimit(reader({ limit: "12" }), { defaultLimit: 5, maxLimit: 10 })).toBe(10);
    expect(parseEnumQuery("paused", ["active", "paused"], "active")).toBe("paused");
    expect(parseEnumQuery("bogus", ["active", "paused"], "active")).toBe("active");
    expect(parseOptionalFiniteNumber("42")).toBe(42);
    expect(parseOptionalFiniteNumber("not-a-number")).toBeUndefined();
  });
});
