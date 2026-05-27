import type { Storage } from "../../storage/index.js";
import { encryptSecret, decryptSecret, isEncryptionAvailable } from "../../util/crypto.js";
import { LifecoachError } from "../../util/errors.js";

/**
 * Monarch Money credentials + connection state, stored in the `profile` KV table
 * (mirrors artifacts/settings.ts). Credential fields are encrypted at rest;
 * operational fields (connected / last sync / last error) are plaintext.
 */
export const MONARCH_PROFILE_KEYS = {
  email: "monarch.email", // encrypted
  password: "monarch.password", // encrypted
  mfaSecret: "monarch.mfa_secret", // encrypted
  connected: "monarch.connected",
  lastSyncAt: "monarch.last_sync_at",
  lastError: "monarch.last_error",
} as const;

export interface MonarchCredentials {
  email: string;
  password: string;
  mfaSecret?: string;
}

export interface MonarchSettings {
  hasCredentials: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
}

const asStr = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Persist Monarch credentials (encrypted). Requires LIFECOACH_SECRET_KEY. */
export const setMonarchCredentials = (storage: Storage, creds: MonarchCredentials): void => {
  if (!isEncryptionAvailable()) {
    throw new LifecoachError(
      "Cannot store Monarch credentials: set LIFECOACH_SECRET_KEY first (credentials are encrypted at rest).",
      "MISSING_SECRET_KEY",
    );
  }
  storage.profile.set(MONARCH_PROFILE_KEYS.email, encryptSecret(creds.email));
  storage.profile.set(MONARCH_PROFILE_KEYS.password, encryptSecret(creds.password));
  if (creds.mfaSecret && creds.mfaSecret.length > 0) {
    storage.profile.set(MONARCH_PROFILE_KEYS.mfaSecret, encryptSecret(creds.mfaSecret));
  } else {
    storage.profile.delete(MONARCH_PROFILE_KEYS.mfaSecret);
  }
};

/** Read + decrypt stored credentials, or null if none are configured. */
export const getMonarchCredentials = (storage: Storage): MonarchCredentials | null => {
  const email = asStr(storage.profile.get(MONARCH_PROFILE_KEYS.email));
  const password = asStr(storage.profile.get(MONARCH_PROFILE_KEYS.password));
  if (!email || !password) return null;
  const mfa = asStr(storage.profile.get(MONARCH_PROFILE_KEYS.mfaSecret));
  return {
    email: decryptSecret(email),
    password: decryptSecret(password),
    ...(mfa ? { mfaSecret: decryptSecret(mfa) } : {}),
  };
};

export const hasMonarchCredentials = (storage: Storage): boolean =>
  asStr(storage.profile.get(MONARCH_PROFILE_KEYS.email)) !== null &&
  asStr(storage.profile.get(MONARCH_PROFILE_KEYS.password)) !== null;

/** UI-facing status. Never returns secrets. */
export const getMonarchSettings = (storage: Storage): MonarchSettings => {
  const lastSync = storage.profile.get(MONARCH_PROFILE_KEYS.lastSyncAt);
  return {
    hasCredentials: hasMonarchCredentials(storage),
    connected: storage.profile.get(MONARCH_PROFILE_KEYS.connected) === true,
    lastSyncAt: typeof lastSync === "number" ? lastSync : null,
    lastError: asStr(storage.profile.get(MONARCH_PROFILE_KEYS.lastError)),
  };
};

/** Mark a successful connect/sync — clears any prior error. */
export const recordMonarchSync = (storage: Storage): void => {
  storage.profile.set(MONARCH_PROFILE_KEYS.lastSyncAt, Date.now());
  storage.profile.set(MONARCH_PROFILE_KEYS.connected, true);
  storage.profile.set(MONARCH_PROFILE_KEYS.lastError, null);
};

/** Mark a successful credential validation (connected) without bumping last-sync. */
export const recordMonarchConnected = (storage: Storage): void => {
  storage.profile.set(MONARCH_PROFILE_KEYS.connected, true);
  storage.profile.set(MONARCH_PROFILE_KEYS.lastError, null);
};

export const recordMonarchError = (storage: Storage, message: string): void => {
  storage.profile.set(MONARCH_PROFILE_KEYS.connected, false);
  storage.profile.set(MONARCH_PROFILE_KEYS.lastError, message);
};
