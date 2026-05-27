import type { LifecoachConfig } from "../../config/index.js";
import type { Storage } from "../../storage/index.js";
import { MonarchClient } from "./client.js";
import { getMonarchCredentials } from "./credentials.js";

/**
 * Build an authenticated MonarchClient from credentials stored in the profile
 * table. Shared by the server sync endpoint and the CLI so credential entry
 * doesn't depend on the boot-frozen config. Returns null when no credentials
 * are configured. Tries the persisted session first, then falls back to
 * email/password (+ optional MFA) auth.
 */
export const buildMonarchClientFromProfile = async (deps: {
  storage: Storage;
  config: Pick<LifecoachConfig, "monarchSessionFile">;
}): Promise<MonarchClient | null> => {
  const creds = getMonarchCredentials(deps.storage);
  if (!creds) return null;
  const client = new MonarchClient(deps.config.monarchSessionFile);
  const restored = await client.loadSession();
  if (!restored) {
    await client.authenticate(creds.email, creds.password, creds.mfaSecret);
  }
  return client;
};
