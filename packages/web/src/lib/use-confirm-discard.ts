import { useCallback } from "react";

/**
 * Returns a function that prompts the user to confirm discarding unsaved
 * changes when `dirty` is true. Wraps the native `window.confirm` so callers
 * stay consistent across edit sheets and so the wording can be swapped to a
 * Radix dialog in the future without touching call sites.
 *
 * Usage:
 *   const confirmDiscard = useConfirmDiscard(dirty);
 *   const handleClose = () => { if (confirmDiscard()) onClose(); };
 *
 * Returns `true` when the caller should proceed (not dirty, or user agreed
 * to discard); `false` when the close should be cancelled.
 */
export const useConfirmDiscard = (
  dirty: boolean,
  message = "Discard unsaved changes?",
): (() => boolean) =>
  useCallback(() => {
    if (!dirty) return true;
    return window.confirm(message);
  }, [dirty, message]);
