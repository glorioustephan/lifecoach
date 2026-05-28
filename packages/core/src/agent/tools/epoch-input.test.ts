import { describe, expect, it, vi } from "vitest";
import { assertEpochMs } from "./epoch-input.js";

describe("assertEpochMs", () => {
  it("does not invoke warn when value is zero", () => {
    const warn = vi.fn();
    assertEpochMs("test_tool", 0, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not invoke warn when value is a valid millisecond timestamp (>= 1e12)", () => {
    const warn = vi.fn();
    const validMs = 1_700_000_000_000; // 2023-11-14
    assertEpochMs("test_tool", validMs, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not invoke warn when value is exactly 1e12 (boundary)", () => {
    const warn = vi.fn();
    assertEpochMs("test_tool", 1e12, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("invokes warn when value looks like Unix seconds (< 1e12 and > 0)", () => {
    const warn = vi.fn();
    const secondsValue = 1_709_251_200; // 2024-03-01 in seconds
    assertEpochMs("snapshot_metrics", secondsValue, warn);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("warn entry includes the label as tool field", () => {
    const warn = vi.fn();
    assertEpochMs("my_tool", 1_709_251_200, warn);
    const entry = warn.mock.calls[0]?.[0];
    expect(entry.tool).toBe("my_tool");
  });

  it("warn entry receivedSeconds matches the passed value", () => {
    const warn = vi.fn();
    const secondsValue = 1_700_000_000;
    assertEpochMs("my_tool", secondsValue, warn);
    const entry = warn.mock.calls[0]?.[0];
    expect(entry.receivedSeconds).toBe(secondsValue);
  });

  it("warn entry normalizedMs is receivedSeconds × 1000", () => {
    const warn = vi.fn();
    const secondsValue = 1_700_000_000;
    assertEpochMs("my_tool", secondsValue, warn);
    const entry = warn.mock.calls[0]?.[0];
    expect(entry.normalizedMs).toBe(secondsValue * 1000);
  });

  it("does not invoke warn for negative values", () => {
    // Negative epoch is nonsensical but not in the seconds range (> 0 check).
    const warn = vi.fn();
    assertEpochMs("test_tool", -100, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});
