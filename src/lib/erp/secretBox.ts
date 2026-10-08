import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * AES-256-GCM for values that must never sit in the database as plain text
 * (Company Info's EIN, tax IDs, bank numbers, and later website logins).
 * A copy of the database alone shows nothing without ERP_ENCRYPTION_KEY.
 *
 * Stored as "v1:<iv>:<tag>:<ciphertext>", all base64, so the format can
 * change later without guessing what an old value is.
 *
 * Losing ERP_ENCRYPTION_KEY makes every encrypted value unrecoverable, so it
 * has to be saved somewhere outside Vercel too.
 */

const VERSION = "v1";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("ERP_ENCRYPTION_KEY is not set. Add it to .env and Vercel before saving sensitive values.");
  }
}

function key(): Buffer {
  const raw = process.env.ERP_ENCRYPTION_KEY;
  if (!raw) throw new MissingEncryptionKeyError();
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ERP_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || data == null) throw new Error("Unrecognized encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** "•••• 4821" for showing a sensitive value without revealing it. */
export function maskSecret(plain: string): string {
  const tail = plain.replace(/\s/g, "").slice(-4);
  return plain.length > 4 ? `•••• ${tail}` : "••••";
}
