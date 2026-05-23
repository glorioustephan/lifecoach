import type { Storage } from "../storage/index.js";

/** Profile keys backing the artifact-extraction cron. Stored in the `profile` table. */
export const ARTIFACT_PROFILE_KEYS = {
  enabled: "artifacts.auto_extract_enabled",
  emptyStreak: "artifacts.empty_run_streak",
  lastScanAt: "artifacts.last_scan_at",
  autoDisabled: "artifacts.auto_disabled",
} as const;

/** Consecutive empty cron runs before the job auto-disables itself. */
export const EMPTY_RUN_LIMIT = 5;
/** Cron-extracted artifacts must clear this confidence to be saved. */
export const MIN_CRON_CONFIDENCE = 0.7;

export interface ArtifactSettings {
  /** Whether the daily cron is allowed to run. Defaults to true. */
  enabled: boolean;
  /** True when the cron disabled itself after EMPTY_RUN_LIMIT empty runs. */
  autoDisabled: boolean;
  emptyStreak: number;
  lastScanAt: number | null;
}

const asBool = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;
const asNum = (v: unknown, fallback: number): number =>
  typeof v === "number" ? v : fallback;

export const getArtifactSettings = (storage: Storage): ArtifactSettings => {
  const lastScan = storage.profile.get(ARTIFACT_PROFILE_KEYS.lastScanAt);
  return {
    enabled: asBool(storage.profile.get(ARTIFACT_PROFILE_KEYS.enabled), true),
    autoDisabled: asBool(storage.profile.get(ARTIFACT_PROFILE_KEYS.autoDisabled), false),
    emptyStreak: asNum(storage.profile.get(ARTIFACT_PROFILE_KEYS.emptyStreak), 0),
    lastScanAt: typeof lastScan === "number" ? lastScan : null,
  };
};

export const isAutoExtractEnabled = (storage: Storage): boolean =>
  getArtifactSettings(storage).enabled;

/**
 * Toggle the cron. Enabling also clears the auto-disabled flag and resets the
 * empty-run streak, so a user re-enabling after a detection bug gets a clean run.
 */
export const setAutoExtractEnabled = (storage: Storage, enabled: boolean): void => {
  storage.profile.set(ARTIFACT_PROFILE_KEYS.enabled, enabled);
  if (enabled) {
    storage.profile.set(ARTIFACT_PROFILE_KEYS.autoDisabled, false);
    storage.profile.set(ARTIFACT_PROFILE_KEYS.emptyStreak, 0);
  }
};

/**
 * Record the outcome of a cron run: advance the scan cursor and update the
 * empty-run streak, auto-disabling once it reaches EMPTY_RUN_LIMIT.
 */
export const recordCronRun = (
  storage: Storage,
  opts: { scannedUntil: number; created: number },
): { autoDisabled: boolean; emptyStreak: number } => {
  storage.profile.set(ARTIFACT_PROFILE_KEYS.lastScanAt, opts.scannedUntil);
  if (opts.created > 0) {
    storage.profile.set(ARTIFACT_PROFILE_KEYS.emptyStreak, 0);
    return { autoDisabled: false, emptyStreak: 0 };
  }
  const streak = getArtifactSettings(storage).emptyStreak + 1;
  storage.profile.set(ARTIFACT_PROFILE_KEYS.emptyStreak, streak);
  if (streak >= EMPTY_RUN_LIMIT) {
    storage.profile.set(ARTIFACT_PROFILE_KEYS.enabled, false);
    storage.profile.set(ARTIFACT_PROFILE_KEYS.autoDisabled, true);
    return { autoDisabled: true, emptyStreak: streak };
  }
  return { autoDisabled: false, emptyStreak: streak };
};
