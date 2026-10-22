import { PrismaClient } from "@prisma/client";
import { PII_FIELDS, openResult, sealArgs } from "@/lib/erp/piiFields";

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // SSNs and bank numbers: encrypted on every save, decrypted on every read (piiFields.ts).
  const pii = (fields: readonly string[]) => ({
    async $allOperations({ args, query }: { args: unknown; query: (args: unknown) => Promise<unknown> }) {
      sealArgs(args, fields);
      return openResult(await query(args), fields);
    },
  });
  return base.$extends({
    query: {
      employee: pii(PII_FIELDS.employee),
      contractor: pii(PII_FIELDS.contractor),
      candidateApplication: pii(PII_FIELDS.candidateApplication),
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createClient> | undefined };

export const prisma = globalForPrisma.prisma ?? createClient();

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

/** The client inside `prisma.$transaction(async (tx) => ...)`, for helpers that take one. */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
