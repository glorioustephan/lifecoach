export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Inspect an error to decide whether it's worth retrying. */
  isRetryable?: (err: unknown) => boolean;
  /** Optional hook for logging/telemetry on each retry. */
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Heuristic for "transient" errors. Looks at common status-code properties
 * exposed by HTTP client libraries (status, statusCode, response.status) plus
 * a few message patterns.
 */
export const isTransientHttpError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const status =
    (typeof e["status"] === "number" ? e["status"] : undefined) ??
    (typeof e["statusCode"] === "number" ? e["statusCode"] : undefined) ??
    (typeof (e["response"] as Record<string, unknown> | undefined)?.["status"] === "number"
      ? ((e["response"] as Record<string, unknown>)["status"] as number)
      : undefined);

  if (typeof status === "number") {
    return status === 429 || (status >= 500 && status < 600);
  }
  const message = typeof e["message"] === "string" ? e["message"].toLowerCase() : "";
  return (
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket hang up")
  );
};

/**
 * Retry an async operation with exponential backoff + jitter.
 * Defaults: 5 attempts, 500ms base, 10s cap.
 */
export const withRetry = async <T>(
  op: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> => {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 10_000;
  const isRetryable = opts.isRetryable ?? isTransientHttpError;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts || !isRetryable(err)) {
        throw err;
      }
      // Exponential backoff with full jitter.
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = Math.floor(Math.random() * cap);
      opts.onRetry?.(attempt, delayMs, err);
      await sleep(delayMs);
    }
  }
  throw lastErr;
};
