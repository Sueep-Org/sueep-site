/**
 * Next day surcharge on a calendar day an outside project manager asked for
 * today or tomorrow (ProjectDayAssignment.nextDayUpcharge). Their request no
 * longer names SOV lines, so nothing is priced when it comes in; the
 * surcharge is added when the office assigns work to the day:
 *
 * - Each SOV line on the day gets its own "Next day surcharge" change order
 *   at the upcharge percent (Settings, Pricing) of the line's full value,
 *   completed on that day so it shows on the Billing page. Made once per day
 *   and line (surchargeKey). If the line is taken off the day before it's
 *   billed, that change order is voided.
 * - Each change order on the day gets its next day upcharge: the box is
 *   ticked and the percent is added to its price, once.
 *
 * Runs after every save of the day's SOV lines and change orders.
 */
import { prisma } from "@/lib/prisma";
import { loadPricingSettings } from "@/lib/pricingSettingsServer";
import { nextDayUpchargeCents } from "@/lib/nextDayUpcharge";

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Changes made, for the API response and logs. */
export type SurchargeResult = { created: string[]; voided: string[]; upcharged: string[] };

/** `opts.pct` overrides the Settings percent (scripts and tests, which run outside Next.js). */
export async function applyNextDaySurcharge(dayAssignmentId: string, opts: { pct?: number } = {}): Promise<SurchargeResult> {
  const result: SurchargeResult = { created: [], voided: [], upcharged: [] };
  const day = await prisma.projectDayAssignment.findUnique({
    where: { id: dayAssignmentId },
    select: {
      id: true,
      projectId: true,
      date: true,
      nextDayUpcharge: true,
      sovItems: { select: { id: true, description: true, scheduledValueCents: true } },
      changeOrders: { select: { id: true, title: true, status: true, billingStatus: true, nextDayUpcharge: true, contractValueCents: true, surchargeKey: true } },
    },
  });
  if (!day?.nextDayUpcharge) return result;
  const nextDayPct = opts.pct ?? (await loadPricingSettings()).nextDayPct;
  if (nextDayPct <= 0) return result;
  const when = dayLabel(day.date);

  // SOV lines: one surcharge change order each.
  const keyPrefix = `${day.id}:`;
  const existing = await prisma.projectChangeOrder.findMany({
    where: { surchargeKey: { startsWith: keyPrefix } },
    select: { id: true, title: true, status: true, billingStatus: true, surchargeKey: true },
  });
  for (const sov of day.sovItems) {
    const key = `${keyPrefix}${sov.id}`;
    const cents = nextDayUpchargeCents(sov.scheduledValueCents, nextDayPct);
    if (cents <= 0) continue;
    const prior = existing.find((c) => c.surchargeKey === key);
    if (prior && prior.status !== "VOID") continue;
    const data = {
      title: `Next day surcharge: ${sov.description} (${when})`,
      description: `${nextDayPct}% next day upcharge on the SOV line "${sov.description}" (${money(sov.scheduledValueCents)}). The project manager asked for this work on ${when}, today or tomorrow when they asked.`,
      requestedBy: "Sueep (automatic)",
      status: "COMPLETED",
      requestedDate: day.date,
      startDate: day.date,
      endDate: day.date,
      completedAt: day.date,
      contractValueCents: cents,
      noCrewRequired: true,
      statusNote: null,
      statusNoteBy: null,
      statusNoteAt: null,
    };
    if (prior) {
      // Line put back on the day after it was taken off: bring it back.
      await prisma.projectChangeOrder.update({ where: { id: prior.id }, data });
    } else {
      await prisma.projectChangeOrder.create({ data: { ...data, projectId: day.projectId, surchargeKey: key } });
    }
    result.created.push(data.title);
  }

  // A line taken off the day: void its surcharge, unless it's already billed.
  const onDay = new Set(day.sovItems.map((s) => `${keyPrefix}${s.id}`));
  for (const c of existing) {
    if (onDay.has(c.surchargeKey!) || c.status === "VOID" || (c.billingStatus && c.billingStatus !== "NOT_BILLED")) continue;
    await prisma.projectChangeOrder.update({
      where: { id: c.id },
      data: { status: "VOID", statusNote: "Its SOV line was taken off the calendar day.", statusNoteBy: "Sueep", statusNoteAt: new Date() },
    });
    result.voided.push(c.title);
  }

  // Change orders: tick the upcharge and add it to the price, once.
  for (const co of day.changeOrders) {
    if (co.surchargeKey || co.nextDayUpcharge) continue;
    if (co.status === "VOID" || co.status === "REJECTED") continue;
    if (co.billingStatus && co.billingStatus !== "NOT_BILLED") continue;
    const price = co.contractValueCents ?? 0;
    await prisma.projectChangeOrder.update({
      where: { id: co.id },
      data: { nextDayUpcharge: true, ...(price > 0 ? { contractValueCents: price + nextDayUpchargeCents(price, nextDayPct) } : {}) },
    });
    result.upcharged.push(co.title);
  }
  return result;
}
