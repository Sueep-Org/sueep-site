/**
 * SSNs and bank numbers are encrypted in the database (secretBox.ts,
 * ERP_ENCRYPTION_KEY), the same way Company Info's logins are. This runs on
 * the shared Prisma client (src/lib/prisma.ts), so every save of these models
 * encrypts and every read decrypts, and app code keeps working with plain
 * values. A copy of the database alone shows nothing.
 *
 * - Values saved before this (plain text) still read as they are, so nothing
 *   breaks between the deploy and scripts/encrypt-pii.ts converting them.
 * - Only top-level reads are decrypted. A nested read from another model
 *   (`include: { employee: true }`) gets the encrypted text, never the plain
 *   value, which is the safe side.
 * - Filtering on these fields (`where: { ssn }`) can't work on encrypted
 *   values; nothing does that today.
 */
import { decryptSecret, encryptSecret } from "./secretBox";

export const PII_FIELDS = {
  employee: ["ssn", "bankAccountNumber", "bankRoutingNumber"],
  contractor: ["ssn", "bankAccountNumber", "bankRoutingNumber"],
  candidateApplication: ["bankAccountNumber", "bankRoutingNumber"],
} as const;

const ENCRYPTED = /^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]*$/;

export function isEncryptedPii(v: unknown): v is string {
  return typeof v === "string" && ENCRYPTED.test(v);
}

/** Encrypts a value about to be saved. Blank and already-encrypted values pass through. */
export function sealPii<T>(v: T): T | string {
  if (typeof v !== "string" || v === "" || isEncryptedPii(v)) return v;
  return encryptSecret(v);
}

/** Decrypts a stored value. Plain text from before encryption passes through. */
export function openPii<T>(v: T): T | string | null {
  if (!isEncryptedPii(v)) return v;
  try {
    return decryptSecret(v);
  } catch (e) {
    console.error("Couldn't decrypt a stored SSN or bank number", e);
    return null;
  }
}

type Row = Record<string, unknown>;

function sealData(data: unknown, fields: readonly string[]): void {
  if (Array.isArray(data)) return data.forEach((d) => sealData(d, fields));
  if (!data || typeof data !== "object") return;
  const row = data as Row;
  for (const f of fields) {
    const v = row[f];
    if (v && typeof v === "object" && "set" in (v as Row)) (v as Row).set = sealPii((v as Row).set);
    else if (v !== undefined) row[f] = sealPii(v);
  }
}

/** Encrypts the fields in any write's arguments (data, create and update for upserts). */
export function sealArgs(args: unknown, fields: readonly string[]): void {
  if (!args || typeof args !== "object") return;
  const a = args as Row;
  sealData(a.data, fields);
  sealData(a.create, fields);
  sealData(a.update, fields);
}

/** Decrypts the fields on a read's result: one row, a list, or null. */
export function openResult<T>(result: T, fields: readonly string[]): T {
  if (Array.isArray(result)) {
    result.forEach((r) => openResult(r, fields));
    return result;
  }
  if (!result || typeof result !== "object") return result;
  const row = result as Row;
  for (const f of fields) if (f in row) row[f] = openPii(row[f]);
  return result;
}
