/**
 * The invoice cleanup page's Old unpaid work tab: mark finished work Paid on
 * a date someone gives (so Finance counts it in the month it was really
 * paid, not today), or Voided with a reason. Same follow-ups as the
 * automatic invoice sync (applyPaidLinks.ts) and the Billing page.
 * Only touches work that's still Not billed or Billed.
 */
import { prisma } from "@/lib/prisma";
import { markSovItemPaid, syncProjectBillingFromRequest, syncProjectBillingFromSOV, syncSovPercentDone } from "@/lib/sovSync";

/** Still owed: not Paid (either spelling) and not Voided */
const OWED = { notIn: ["PAID", "INVOICE_PAID", "VOIDED"] };
const OWED_NULLABLE = { OR: [{ billingStatus: null }, { billingStatus: OWED }] };

export type ResolveAction = { kind: "PAID"; paidOn: Date } | { kind: "VOID"; reason: string };

type Keys = { sov: string[]; co: string[]; turn: string[]; month: string[]; project: string[] };

export function parseResolveKeys(raw: unknown): Keys | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) return null;
  const keys: Keys = { sov: [], co: [], turn: [], month: [], project: [] };
  for (const k of raw) {
    if (typeof k !== "string") return null;
    const [kind, id] = k.split(":");
    if (!id || !(kind in keys)) return null;
    keys[kind as keyof Keys].push(id);
  }
  return keys;
}

/** Returns how many lines changed. */
export async function resolveOldUnpaid(keys: Keys, action: ResolveAction): Promise<number> {
  let changed = 0;
  const paid = action.kind === "PAID";
  const voidData = paid ? null : { billingStatus: "VOIDED", voidReason: action.reason };

  // SOV lines, then the same project follow-ups as the Billing page
  if (keys.sov.length) {
    const items = await prisma.projectSOVItem.findMany({ where: { id: { in: keys.sov }, billingStatus: OWED }, select: { id: true, sov: { select: { projectId: true } } } });
    for (const i of items) {
      if (paid) await markSovItemPaid(i.id, action.paidOn);
      else await prisma.projectSOVItem.updateMany({ where: { id: i.id, billingStatus: OWED }, data: voidData! });
    }
    for (const projectId of new Set(items.map((i) => i.sov.projectId))) {
      await syncSovPercentDone(projectId);
      await syncProjectBillingFromSOV(projectId);
    }
    changed += items.length;
  }

  if (keys.co.length) {
    const res = await prisma.projectChangeOrder.updateMany({
      where: { id: { in: keys.co }, ...OWED_NULLABLE },
      data: paid ? { billingStatus: "PAID", paidAt: action.paidOn } : voidData!,
    });
    changed += res.count;
  }

  if (keys.turn.length) {
    const turns = await prisma.turnoverRequest.findMany({ where: { id: { in: keys.turn }, billingStatus: OWED }, select: { id: true } });
    for (const t of turns) {
      await prisma.turnoverRequest.update({ where: { id: t.id }, data: paid ? { billingStatus: "PAID", voidReason: null } : voidData! });
      await syncProjectBillingFromRequest(t.id, paid ? "PAID" : "VOIDED", paid ? action.paidOn : null, paid ? null : action.reason);
    }
    changed += turns.length;
  }

  if (keys.month.length) {
    const res = await prisma.recurringContractPeriod.updateMany({
      where: { id: { in: keys.month }, billingStatus: OWED },
      data: paid ? { billingStatus: "PAID", paidAt: action.paidOn, voidReason: null } : voidData!,
    });
    changed += res.count;
  }

  if (keys.project.length) {
    const res = await prisma.project.updateMany({
      where: { id: { in: keys.project }, ...OWED_NULLABLE },
      data: paid ? { billingStatus: "PAID", billingCompletedAt: action.paidOn, percentInvoiced: 100, voidReason: null } : voidData!,
    });
    changed += res.count;
  }

  return changed;
}
