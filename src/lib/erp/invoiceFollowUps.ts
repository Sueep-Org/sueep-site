/**
 * Follow-ups on unpaid invoices: who chased it, how, what the client said
 * and when they promised to pay (INVOICE_TRACKING_PLAN.md Phase 4).
 */
import { prisma } from "@/lib/prisma";
import { todayEasternKey, utcDateKey } from "./dates";
import { namesByEmail } from "./janitorialQualityChecks";
import { FOLLOW_UP_METHOD_LABELS, followUpNumber, isFollowUpMethod, type FollowUpSummary } from "./invoiceFollowUpShared";

export type FollowUpEntry = {
  id: string;
  at: Date;
  method: string;
  contactName: string | null;
  note: string;
  promisedDay: string | null;
  by: string;
  byEmail: string;
};

/** Every follow-up, oldest first, by invoice number. */
export async function loadFollowUps(numbers?: string[]): Promise<Map<string, FollowUpEntry[]>> {
  const rows = await prisma.invoiceFollowUp.findMany({
    where: numbers ? { invoiceNumber: { in: numbers } } : undefined,
    orderBy: { createdAt: "asc" },
  });
  const names = await namesByEmail([...new Set(rows.map((r) => r.byEmail))]);
  const out = new Map<string, FollowUpEntry[]>();
  for (const r of rows) {
    const list = out.get(r.invoiceNumber) ?? [];
    list.push({
      id: r.id,
      at: r.createdAt,
      method: isFollowUpMethod(r.method) ? FOLLOW_UP_METHOD_LABELS[r.method] : r.method,
      contactName: r.contactName,
      note: r.note,
      promisedDay: r.promisedDate ? utcDateKey(r.promisedDate) : null,
      by: names.get(r.byEmail.toLowerCase()) ?? r.byEmail.split("@")[0]!,
      byEmail: r.byEmail,
    });
    out.set(r.invoiceNumber, list);
  }
  return out;
}

/** The latest follow-up and the latest promise. Paid invoices never count as a missed promise. */
export function summarizeFollowUps(list: FollowUpEntry[] | undefined, unpaid: boolean, todayKey: string): FollowUpSummary | null {
  if (!list?.length) return null;
  const last = list[list.length - 1]!;
  const promisedDay = [...list].reverse().find((f) => f.promisedDay)?.promisedDay ?? null;
  return {
    lastDay: todayEasternKey(last.at),
    lastMethod: last.method,
    lastBy: last.by,
    promisedDay,
    promiseMissed: unpaid && !!promisedDay && promisedDay < todayKey,
  };
}

export async function addFollowUp(
  input: { invoiceNumber: unknown; method: unknown; contactName: unknown; note: unknown; promisedDate: unknown },
  email: string,
): Promise<{ ok: true } | { error: string }> {
  const invoiceNumber = followUpNumber(typeof input.invoiceNumber === "string" ? input.invoiceNumber : null);
  if (!invoiceNumber) return { error: "Only invoices with a number can have follow-ups." };
  if (!isFollowUpMethod(input.method)) return { error: "Pick how you followed up." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  if (!note) return { error: "Say what they said." };
  const contactName = typeof input.contactName === "string" ? input.contactName.trim().slice(0, 200) || null : null;
  let promisedDate: Date | null = null;
  if (typeof input.promisedDate === "string" && input.promisedDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.promisedDate)) return { error: "Promised date isn't a date." };
    promisedDate = new Date(`${input.promisedDate}T00:00:00Z`);
  }
  await prisma.invoiceFollowUp.create({ data: { invoiceNumber, method: input.method, contactName, note, promisedDate, byEmail: email } });
  return { ok: true };
}

/** Removes a follow-up logged by mistake: the person who logged it, or an Admin. */
export async function deleteFollowUp(id: string, email: string, isAdmin: boolean): Promise<{ ok: true } | { error: string }> {
  const f = await prisma.invoiceFollowUp.findUnique({ where: { id }, select: { byEmail: true } });
  if (!f) return { error: "Already removed." };
  if (!isAdmin && f.byEmail.toLowerCase() !== email.toLowerCase()) return { error: "Only the person who logged it or an Admin can remove it." };
  await prisma.invoiceFollowUp.delete({ where: { id } });
  return { ok: true };
}
