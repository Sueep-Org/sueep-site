import { prisma } from "@/lib/prisma";
import type { ArParse, PnlParse } from "./qboCsv";

/**
 * Saves a QuickBooks report into the ERP's tables, from a CSV upload or the
 * nightly sync (same shape either way). A P&L replaces the months it covers;
 * an A/R aging replaces its "as of" date and keeps other dates.
 */

type Meta = { source: "UPLOAD" | "SYNC"; fileName: string | null; importedBy: string | null };

export async function savePnlImport(parsed: PnlParse, meta: Meta) {
  return prisma.$transaction(async (tx) => {
    const imp = await tx.qboImport.create({
      data: {
        kind: "PNL",
        ...meta,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        basis: parsed.basis,
        rowCount: parsed.lines.length,
      },
    });
    // A newer report for the same month replaces it (an unfinished month gets filled in later).
    await tx.qboPnlLine.deleteMany({ where: { month: { in: parsed.months } } });
    // The same account name can show up twice under one group; one row each, added together.
    const merged = new Map<string, (typeof parsed.lines)[number]>();
    for (const l of parsed.lines) {
      const key = [l.month, l.section, l.parent, l.account].join("|");
      const prev = merged.get(key);
      merged.set(key, prev ? { ...prev, amountCents: prev.amountCents + l.amountCents } : { ...l });
    }
    await tx.qboPnlLine.createMany({ data: [...merged.values()].map((l) => ({ ...l, importId: imp.id })) });
    return imp;
  });
}

export async function saveArImport(parsed: ArParse, meta: Meta) {
  return prisma.$transaction(async (tx) => {
    const imp = await tx.qboImport.create({ data: { kind: "AR_AGING", ...meta, asOf: parsed.asOf, rowCount: parsed.rows.length } });
    await tx.qboArRow.deleteMany({ where: { asOf: parsed.asOf } });
    const merged = new Map<string, (typeof parsed.rows)[number]>();
    for (const r of parsed.rows) {
      const key = `${r.parent}|${r.customer}`;
      const prev = merged.get(key);
      merged.set(
        key,
        prev
          ? {
              ...prev,
              currentCents: prev.currentCents + r.currentCents,
              days1to30Cents: prev.days1to30Cents + r.days1to30Cents,
              days31to60Cents: prev.days31to60Cents + r.days31to60Cents,
              days61to90Cents: prev.days61to90Cents + r.days61to90Cents,
              over90Cents: prev.over90Cents + r.over90Cents,
              totalCents: prev.totalCents + r.totalCents,
            }
          : { ...r },
      );
    }
    await tx.qboArRow.createMany({ data: [...merged.values()].map((r) => ({ ...r, asOf: parsed.asOf, importId: imp.id })) });
    return imp;
  });
}
