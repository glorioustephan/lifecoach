/**
 * Shared epoch-timestamp normalisation for agent tool inputs.
 *
 * LLMs frequently pass Unix seconds instead of the expected Unix milliseconds.
 * Any value below 1e12 is implausibly early when interpreted as milliseconds
 * (it corresponds to a date before 2001-09-09), so we treat it as seconds and
 * multiply by 1000.  The conversion is logged at `warn` level so the mistake
 * is observable in structured logs without exposing PII.
 *
 * Special cases:
 *   - `undefined` → `undefined` (pass-through, meaning "no bound").
 *   - `0`         → `undefined` (zero is a sentinel for "no lower bound";
 *                  promoting it to `0 * 1000 = 0` would silently anchor the
 *                  query to the Unix epoch and is almost never the intent).
 *
 * Boundary: `value >= 1e12` is treated as milliseconds.
 *           `0 < value < 1e12` is treated as seconds and multiplied by 1000.
 */

/** Structured log entry emitted when a seconds→ms conversion fires. */
interface EpochNormLog {
  tool: string;
  field: string;
  receivedSeconds: number;
  normalizedMs: number;
  warning: string;
}

/** Injectable logger — defaults to console.warn for portability. */
type WarnFn = (entry: EpochNormLog) => void;

const defaultWarn: WarnFn = (entry) =>
  console.warn("[epoch-input]", JSON.stringify(entry));

/**
 * Normalise a raw epoch input to Unix milliseconds.
 *
 * @param value   - Raw value from the tool input schema.
 * @param field   - Field name for the structured log entry (no PII).
 * @param toolName - Tool name for the structured log entry.
 * @param warn    - Optional override for the warn function (useful in tests).
 * @returns       Normalised Unix milliseconds, or `undefined` when no bound.
 */
export function parseEpochInput(
  value: number | undefined,
  field: string,
  toolName: string,
  warn: WarnFn = defaultWarn,
): number | undefined {
  if (value === undefined || value === 0) {
    // 0 is treated as "no bound" — do not promote it.
    return undefined;
  }

  if (value < 1e12) {
    // Value looks like Unix seconds — auto-convert and warn.
    const normalized = value * 1000;
    warn({
      tool: toolName,
      field,
      receivedSeconds: value,
      normalizedMs: normalized,
      warning:
        "Epoch value < 1e12 received; auto-converted from seconds to milliseconds. " +
        "Pass Unix milliseconds to avoid this conversion.",
    });
    return normalized;
  }

  // Already in milliseconds.
  return value;
}

/**
 * Assert (warn-only) that `value` is plausibly Unix milliseconds rather than
 * seconds. Use at call sites where the value is already typed `number` but
 * arrived via a code path that doesn't run `parseEpochInput` — e.g.
 * snapshot-metrics' direct date filter on `queryTransactions`. Same threshold
 * (1e12) as `parseEpochInput` so the two stay in lockstep.
 *
 * Distinct from `parseEpochInput` because callers here have a `number` (not a
 * `number | undefined`) and never want auto-conversion — they need an
 * observable signal that the upstream value is suspect, not silent rewriting.
 */
export function assertEpochMs(
  label: string,
  value: number,
  warn: WarnFn = defaultWarn,
): void {
  if (value > 0 && value < 1e12) {
    warn({
      tool: label,
      field: "epoch-ms",
      receivedSeconds: value,
      normalizedMs: value * 1000,
      warning:
        `${label} value ${value} looks like seconds rather than milliseconds ` +
        "(expected >= 1e12 for any date after 2001). Convert to ms before passing.",
    });
  }
}
