import crypto from "node:crypto";
import { LifecoachError } from "./errors.js";

/**
 * Field-level encryption for secrets stored in SQLite (e.g. Monarch Money
 * credentials). AES-256-GCM with a key derived from the LIFECOACH_SECRET_KEY
 * env var. The env var is read at call time (not boot) so it works regardless
 * of the frozen runtime config.
 *
 * Output format: "enc:v1:" + base64(iv[12] | authTag[16] | ciphertext).
 */
const ALGO = "aes-256-gcm";
const KEY_SALT = "lifecoach-secret-v1";
const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

/** Whether encryption is available (LIFECOACH_SECRET_KEY is set). */
export const isEncryptionAvailable = (): boolean => {
  const k = process.env.LIFECOACH_SECRET_KEY;
  return typeof k === "string" && k.length > 0;
};

const deriveKey = (): Buffer => {
  const secret = process.env.LIFECOACH_SECRET_KEY;
  if (!secret || secret.length === 0) {
    throw new LifecoachError(
      "LIFECOACH_SECRET_KEY is not set — it's required to encrypt/decrypt stored credentials.",
      "MISSING_SECRET_KEY",
    );
  }
  return crypto.scryptSync(secret, KEY_SALT, 32);
};

/** Encrypt a UTF-8 string. Throws if LIFECOACH_SECRET_KEY is unset. */
export const encryptSecret = (plaintext: string): string => {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
};

/** Decrypt a value produced by encryptSecret. Throws on tamper / wrong key. */
export const decryptSecret = (blob: string): string => {
  if (!blob.startsWith(PREFIX)) {
    throw new LifecoachError("Value is not in the expected encrypted format.", "BAD_CIPHERTEXT");
  }
  const buf = Buffer.from(blob.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
};
