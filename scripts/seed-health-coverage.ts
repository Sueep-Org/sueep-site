// Adds the four people on the Independence Blue Cross bill (invoice for
// November 2026, same total as October) as health coverage, counted from
// January 1, 2026. Links each to their employee profile when exactly one
// name matches.
//
//   npx tsx --env-file=.env scripts/seed-health-coverage.ts          (dry run, writes nothing)
//   npx tsx --env-file=.env scripts/seed-health-coverage.ts --apply  (adds the rows)
//
// Needs the 20261026220000_health_coverage migration first. Does nothing if
// any coverage already exists, so it's safe to run twice.

import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");
const START = new Date("2026-01-01T00:00:00.000Z");

/** Name on the plan, ERP first/last name to link (null for no profile), full monthly premium in cents. */
const PEOPLE: [string, string | null, string | null, number][] = [
  ["Edwin Giraldo", "Edwin", "Giraldo", 35534],
  ["Oscar Giraldo", "Oscar", "Giraldo", 82249],
  ["Martha Rios", "Martha", "Rios", 65272],
  ["Nicholas Wehr", "Nick", "Wehr", 35065],
];

async function main() {
  if (await prisma.healthCoverage.count()) {
    console.log("Health coverage already has rows, nothing to do.");
    return;
  }
  for (const [personName, first, last, cents] of PEOPLE) {
    const matches = first && last
      ? await prisma.employee.findMany({
          where: { firstName: { equals: first, mode: "insensitive" }, lastName: { equals: last, mode: "insensitive" } },
          select: { id: true },
        })
      : [];
    const employeeId = matches.length === 1 ? matches[0].id : null;
    console.log(`${personName.padEnd(16)} $${(cents / 100).toFixed(2)}/mo  ${employeeId ? "linked to employee" : "no employee link"}`);
    if (APPLY) await prisma.healthCoverage.create({ data: { personName, employeeId, monthlyPremiumCents: cents, startDate: START } });
  }
  console.log(APPLY ? "\nAdded." : "\nDry run. Run with --apply to add these.");
}

main().finally(() => prisma.$disconnect());
