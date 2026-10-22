// One-time conversion of job brief "Main Point of Contacts" text into rows
// (ProjectWorkOrderRecord.contactList), using the same reader as the form.
//
//   npx tsx --env-file=.env.local scripts/convert-work-order-contacts.ts          (dry run, writes nothing)
//   npx tsx --env-file=.env.local scripts/convert-work-order-contacts.ts --apply  (writes the rows)
//
// Run after the deploy, so a brief edited on the old site in between isn't
// left with stale rows. The old `contacts` text is never changed or cleared.
// Lines that aren't contacts are added to the brief's notes as
// "Contact note: ...". Only briefs with no rows yet are touched, so it's
// safe to run twice.

import { Prisma, PrismaClient } from "@prisma/client";
import { parseContactsText } from "../src/lib/erp/workOrderContacts";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const records = await prisma.projectWorkOrderRecord.findMany({
    where: { contactList: { equals: Prisma.AnyNull }, contacts: { not: null } },
    select: { id: true, projectName: true, contacts: true, notes: true },
  });
  let converted = 0;
  let contacts = 0;
  let notes = 0;
  for (const r of records) {
    if (!r.contacts?.trim()) continue;
    const parsed = parseContactsText(r.contacts);
    console.log(`\n${r.projectName}`);
    for (const c of parsed.contacts) console.log(`  ${[c.name || "(no name)", c.role, c.email, c.phone].filter(Boolean).join(" | ")}`);
    for (const o of parsed.other) console.log(`  to notes: ${o}`);
    converted++;
    contacts += parsed.contacts.length;
    notes += parsed.other.length;
    if (APPLY) {
      const extra = parsed.other.map((l) => `Contact note: ${l}`);
      await prisma.projectWorkOrderRecord.update({
        where: { id: r.id },
        data: {
          contactList: parsed.contacts,
          ...(extra.length ? { notes: [r.notes?.trim() ?? "", ...extra].filter(Boolean).join("\n") } : {}),
        },
      });
    }
  }
  console.log(`\n${APPLY ? "Converted" : "Would convert"} ${converted} briefs: ${contacts} contacts, ${notes} lines to notes.${APPLY ? "" : " Dry run, nothing written. Add --apply to write."}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
