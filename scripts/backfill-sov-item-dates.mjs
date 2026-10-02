// One-time fill of ProjectSOVItem.completedAt / paidAt for lines that were
// already done or paid before those dates were saved.
//
//   node --env-file=.env scripts/backfill-sov-item-dates.mjs          (dry run, writes nothing)
//   node --env-file=.env scripts/backfill-sov-item-dates.mjs --apply  (writes the dates)
//
// Done date: the latest work day of labor or contractor work logged on the
// line, else the project's last work not tied to any other SOV line on or
// before the line was last edited (lines are often ticked off in bulk
// later, and work tied to another line belongs to that line), else that
// edit day.
// Paid date: the day a HubSpot payment was matched to the line, else the day
// the line was last edited.
// Only lines with no date yet are touched, so it's safe to run twice.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const day = (d) => (d ? d.toISOString().slice(0, 10) : "");
const usd = (cents) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const latest = (dates) => dates.filter(Boolean).reduce((max, d) => (!max || d > max ? d : max), null);

async function main() {
  const items = await prisma.projectSOVItem.findMany({
    where: {
      OR: [
        { completed: true, completedAt: null },
        { billingStatus: "PAID", paidAt: null },
      ],
    },
    select: {
      id: true, description: true, scheduledValueCents: true, completed: true, completedAt: true,
      billingStatus: true, paidAt: true, updatedAt: true,
      sov: { select: { project: { select: { jobTitle: true, status: true, laborEntries: { select: { workDate: true, sovItemId: true, sovItems: { select: { id: true } } } }, contractorAssignments: { select: { endDate: true, startDate: true, sovItems: { select: { id: true } } } } } } } },
      laborEntriesMulti: { select: { workDate: true } },
      laborEntries: { select: { workDate: true } },
      contractorAssignments: { select: { endDate: true, startDate: true } },
      hubspotInvoiceMatches: {
        where: { status: { in: ["AUTO_APPLIED", "ALIAS_APPLIED", "RESOLVED"] } },
        select: { resolvedAt: true, createdAt: true },
      },
    },
    orderBy: [{ sovId: "asc" }, { order: "asc" }],
  });

  let lastProject = null;
  let written = 0;
  for (const item of items) {
    const project = item.sov.project;
    const projectLabel = `${project.jobTitle} (${project.status})`;
    if (projectLabel !== lastProject) {
      console.log(`\n${projectLabel}`);
      lastProject = projectLabel;
    }

    const data = {};
    const notes = [];
    if (item.completed && !item.completedAt) {
      const worked = latest([
        ...item.laborEntriesMulti.map((e) => e.workDate),
        ...item.laborEntries.map((e) => e.workDate),
        ...item.contractorAssignments.map((a) => a.endDate ?? a.startDate),
      ]);
      const projectWorked = latest(
        [
          ...project.laborEntries.filter((e) => !e.sovItemId && e.sovItems.length === 0).map((e) => e.workDate),
          ...project.contractorAssignments.filter((a) => a.sovItems.length === 0).map((a) => a.endDate ?? a.startDate),
        ]
          .filter((d) => d && d <= item.updatedAt),
      );
      data.completedAt = worked ?? projectWorked ?? item.updatedAt;
      notes.push(`done ${day(data.completedAt)} (${worked ? "work on this line" : projectWorked ? "project's last unlinked work" : "last edited"})`);
    }
    if (item.billingStatus === "PAID" && !item.paidAt) {
      const matched = latest(item.hubspotInvoiceMatches.map((m) => m.resolvedAt ?? m.createdAt));
      data.paidAt = matched ?? item.updatedAt;
      notes.push(`paid ${day(data.paidAt)} (${matched ? "HubSpot payment" : "last edited"})`);
    }

    console.log(`  ${usd(item.scheduledValueCents).padStart(9)}  ${item.description.slice(0, 50).padEnd(50)}  ${notes.join(", ")}`);
    if (APPLY) {
      await prisma.projectSOVItem.update({ where: { id: item.id }, data });
      written++;
    }
  }

  console.log(`\n${items.length} lines need dates.`);
  console.log(APPLY ? `Wrote dates on ${written} lines.` : "Dry run, nothing written. Add --apply to save.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
