import { useEffect } from "react";

/**
 * Reset a transient flag back to a quiescent value after `delayMs`. Replaces
 * the duplicated copy/capacities/saved indicator `useEffect` blocks across
 * the artifact views.
 *
 * Usage:
 *   const [copied, setCopied] = useState(false);
 *   useTimedReset(copied, () => setCopied(false), 1400);
 *
 * @param active   When truthy, schedules the reset; the effect is a no-op
 *                 when falsy so a stable state doesn't keep firing timers.
 * @param reset    Called once the delay elapses.
 * @param delayMs  How long to wait before calling `reset`.
 */
export const useTimedReset = (
  active: unknown,
  reset: () => void,
  delayMs: number,
): void => {
  useEffect(() => {
    if (!active) return;
    const handle = setTimeout(reset, delayMs);
    return () => clearTimeout(handle);
    // reset is intentionally not in deps — callers typically pass an inline
    // arrow function, which would force a new timer on every render. The
    // `active` value is the meaningful trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, delayMs]);
};
