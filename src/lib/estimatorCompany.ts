import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Crockford-ish alphabet, no 0/O/1/I/L, so a code read aloud or typed by
// hand doesn't have ambiguous characters. 8 chars from a 32-symbol alphabet
// is ~40 bits, plenty for a handful of companies without meaningful
// collision risk, the retry loop below is just a safety net.
const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 8;
const MAX_CREATE_ATTEMPTS = 5;

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Creates a Company with a freshly generated, guaranteed-unique invite code. */
export async function createCompanyWithInviteCode(name: string) {
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    try {
      return await prisma.company.create({
        data: { name, inviteCode: generateInviteCode() },
      });
    } catch (error) {
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation || attempt === MAX_CREATE_ATTEMPTS - 1) throw error;
    }
  }
  // Unreachable, satisfies TypeScript's control-flow analysis.
  throw new Error("Could not generate a unique invite code");
}

export async function findCompanyByInviteCode(raw: string) {
  return prisma.company.findUnique({ where: { inviteCode: normalizeInviteCode(raw) } });
}
