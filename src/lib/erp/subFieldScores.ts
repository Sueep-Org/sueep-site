/**
 * Field records for sub scores (subScores.ts): what happened on their days
 * in the sub portal over the last FIELD_DAYS. Server only.
 */
import { prisma } from "@/lib/prisma";
import { FIELD_DAYS, fieldPart, type FieldRecord } from "./subScores";

type Tally = { onTime: number; timed: number; offersYes: number; offers: number; firstPass: number; passed: number; came: number; planned: number; crewDays: number };

const blank = (): Tally => ({ onTime: 0, timed: 0, offersYes: 0, offers: 0, firstPass: 0, passed: 0, came: 0, planned: 0, crewDays: 0 });

/** Field records for these contractors (all with any portal history when no ids are given). */
export async function loadFieldRecords(contractorIds?: string[]): Promise<Map<string, FieldRecord>> {
  const since = new Date(Date.now() - FIELD_DAYS * 86_400_000);
  const who = contractorIds ? { contractorId: { in: contractorIds } } : {};
  const [checkIns, offers, reviews] = await Promise.all([
    prisma.subCheckIn.findMany({
      where: { ...who, role: "lead", date: { gte: since } },
      select: { contractorId: true, checkInAt: true, missedAlertAt: true, startTime: true, lateMinutes: true, crewCount: true, plannedCrew: true },
    }),
    prisma.subJobOffer.findMany({
      where: { ...who, status: { in: ["ACCEPTED", "DECLINED", "EXPIRED"] }, answeredAt: { gte: since } },
      select: { contractorId: true, status: true },
    }),
    prisma.subReview.findMany({
      where: { ...who, status: "PASSED", passedAt: { gte: since } },
      select: { contractorId: true, events: { where: { action: "NEEDS_FIX" }, select: { id: true }, take: 1 } },
    }),
  ]);

  const tallies = new Map<string, Tally>();
  const t = (id: string) => tallies.get(id) ?? (tallies.set(id, blank()), tallies.get(id)!);

  for (const c of checkIns) {
    const x = t(c.contractorId);
    // Only days with a start time can be late; a missed alert is late too
    if (c.startTime && (c.checkInAt || c.missedAlertAt)) {
      x.timed++;
      if (c.checkInAt && c.lateMinutes == null) x.onTime++;
    }
    if (c.checkInAt && c.crewCount != null && c.plannedCrew) {
      x.crewDays++;
      x.planned += c.plannedCrew;
      x.came += Math.min(c.crewCount, c.plannedCrew);
    }
  }
  for (const o of offers) {
    const x = t(o.contractorId);
    x.offers++;
    if (o.status === "ACCEPTED") x.offersYes++;
  }
  for (const r of reviews) {
    const x = t(r.contractorId);
    x.passed++;
    if (r.events.length === 0) x.firstPass++;
  }

  const out = new Map<string, FieldRecord>();
  for (const [id, x] of tallies) {
    out.set(id, {
      onTime: fieldPart("onTime", x.onTime, x.timed),
      offers: fieldPart("offers", x.offersYes, x.offers),
      firstPass: fieldPart("firstPass", x.firstPass, x.passed),
      crew: fieldPart("crew", x.came, x.planned, x.crewDays),
    });
  }
  return out;
}

