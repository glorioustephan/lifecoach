import type { Reflection } from "@lifecoach/schemas";
import type { CapacitiesClient } from "./client.js";

/**
 * Phase 5.3 — write daily/weekly reflections back into Capacities as a Daily
 * Note entry. This lets the user's Capacities knowledge graph automatically
 * pick up periodic summaries without manual copy-paste.
 *
 * Why a Daily Note (and not a custom object type):
 *   - Capacities' API exposes /save-to-daily-note as a turnkey endpoint —
 *     no need to manage structure IDs or property mappings.
 *   - Daily Notes participate in Capacities' graph automatically (back-linked
 *     mentions, periodic views).
 *   - The user's normal "today" workflow surfaces the entry without any
 *     UI changes.
 *
 * Set `enabled=false` to no-op (useful in tests + when the integration is
 * configured but the user has disabled write-back).
 */
/**
 * Minimal slice of the reflection repository the write-back needs to stay
 * idempotent — kept narrow so this module doesn't depend on the whole Storage.
 */
export interface ReflectionPushTracker {
  wasPushedToCapacities(id: string): boolean;
  markPushedToCapacities(id: string): void;
}

export interface ReflectionWritebackOptions {
  enabled: boolean;
  spaceId: string | undefined;
  client: CapacitiesClient | null;
  /**
   * When provided, guarantees a given reflection is appended to the daily note
   * at most once. Without it the call still pushes (back-compat), but callers
   * should pass it to prevent duplicate entries on repeated/retried runs.
   */
  tracker?: ReflectionPushTracker;
}

const HEADER_BY_KIND: Record<string, string> = {
  daily: "Lifecoach daily reflection",
  weekly: "Lifecoach weekly reflection",
  monthly: "Lifecoach monthly reflection",
};

/**
 * Compose the markdown payload. The header lets the user spot lifecoach-authored
 * entries at a glance in their daily note; the period range disambiguates
 * back-to-back daily reflections that fire over multiple days.
 */
const composeMarkdown = (reflection: Reflection): string => {
  const header = HEADER_BY_KIND[reflection.kind] ?? "Lifecoach reflection";
  const periodLabel = `${new Date(reflection.periodStart).toISOString().slice(0, 10)} → ${new Date(reflection.periodEnd).toISOString().slice(0, 10)}`;
  return `## ${header}\n_${periodLabel}_\n\n${reflection.body.trim()}\n`;
};

export const pushReflectionToCapacities = async (
  reflection: Reflection,
  options: ReflectionWritebackOptions,
): Promise<{ pushed: boolean; reason?: string }> => {
  if (!options.enabled) return { pushed: false, reason: "writeback_disabled" };
  if (!options.client) return { pushed: false, reason: "capacities_not_configured" };
  if (!options.spaceId) return { pushed: false, reason: "no_default_space" };

  // Idempotency: never append the same reflection to the daily note twice.
  if (options.tracker?.wasPushedToCapacities(reflection.id)) {
    return { pushed: false, reason: "already_pushed" };
  }

  await options.client.saveToDailyNote({
    spaceId: options.spaceId,
    mdText: composeMarkdown(reflection),
    origin: "mcp",
  });

  // Mark only after a successful append, so a failed push can be retried.
  options.tracker?.markPushedToCapacities(reflection.id);
  return { pushed: true };
};
