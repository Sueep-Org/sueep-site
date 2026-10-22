// One-time encryption of SSNs and bank numbers saved before they were
// encrypted (src/lib/erp/piiFields.ts). Needs ERP_ENCRYPTION_KEY, which lives
// in .env, so load both files:
//
//   npx tsx --env-file=.env --env-file=.env.local scripts/encrypt-pii.ts          (dry run, writes nothing)
//   npx tsx --env-file=.env --env-file=.env.local scripts/encrypt-pii.ts --apply  (encrypts)
//
// Run only after the deploy that turns encryption on. Before it, the live
// site would show the encrypted text in place of the real values. Only
// values that aren't encrypted yet are touched, so it's safe to run twice.
// Every value is checked to decrypt back to the original before moving on.

import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { PII_FIELDS } from "../src/lib/erp/piiFields";
import { decryptSecret, encryptSecret } from "../src/lib/erp/secretBox";

const APPLY = process.argv.includes("--apply");
const TABLES = { employee: "Employee", contractor: "Contractor", candidateApplication: "CandidateApplication" } as const;

async function main() {
  // Fails here, before anything is read, if the key is missing or wrong.
  if (decryptSecret(encryptSecret("check")) !== "check") throw new Error("ERP_ENCRYPTION_KEY doesn't round-trip.");
  let total = 0;
  for (const [model, table] of Object.entries(TABLES) as [keyof typeof TABLES, string][]) {
    const fields = PII_FIELDS[model];
    const anyPlain = Prisma.join(fields.map((f) => Prisma.sql`(${Prisma.raw(`"${f}"`)} IS NOT NULL AND ${Prisma.raw(`"${f}"`)} <> '' AND ${Prisma.raw(`"${f}"`)} NOT LIKE 'v1:%')`), " OR ");
    const rows = await prisma.$queryRaw<Record<string, string | null>[]>`SELECT id, ${Prisma.join(fields.map((f) => Prisma.raw(`"${f}"`)))} FROM ${Prisma.raw(`"${table}"`)} WHERE ${anyPlain}`;
    let values = 0;
    for (const row of rows) {
      const set: Prisma.Sql[] = [];
      for (const f of fields) {
        const v = row[f];
        if (!v || v.startsWith("v1:")) continue;
        const sealed = encryptSecret(v);
        if (decryptSecret(sealed) !== v) throw new Error(`${table} ${row.id} ${f}: encrypted value didn't decrypt back. Stopped, nothing more written.`);
        set.push(Prisma.sql`${Prisma.raw(`"${f}"`)} = ${sealed}`);
        values++;
      }
      if (APPLY && set.length) await prisma.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.join(set)} WHERE id = ${row.id}`;
    }
    console.log(`${table}: ${rows.length} rows, ${values} values ${APPLY ? "encrypted" : "to encrypt"}`);
    total += values;
  }
  console.log(`\n${APPLY ? "Encrypted" : "Would encrypt"} ${total} values.${APPLY ? "" : " Dry run, nothing written. Add --apply to encrypt."}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
