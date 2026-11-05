/** Why a client paid less than the invoice, by invoice number (INVOICE_TRACKING_PLAN.md Phase 6). */
import { prisma } from "@/lib/prisma";
import { todayEasternKey } from "./dates";
import { namesByEmail } from "./janitorialQualityChecks";
import { followUpNumber } from "./invoiceFollowUpShared";
import { SHORT_PAY_LABELS, isShortPayReason, type ShortPayInfo } from "./invoiceShortPayShared";

export async function loadShortPays(): Promise<Map<string, ShortPayInfo>> {
  const rows = await prisma.invoiceShortPay.findMany();
  const names = await namesByEmail([...new Set(rows.map((r) => r.byEmail))]);
  const out = new Map<string, ShortPayInfo>();
  for (const r of rows) {
    if (!isShortPayReason(r.reason)) continue;
    out.set(r.invoiceNumber, {
      reason: r.reason,
      label: SHORT_PAY_LABELS[r.reason],
      amountCents: r.amountCents,
      note: r.note,
      by: names.get(r.byEmail.toLowerCase()) ?? r.byEmail.split("@")[0]!,
      day: todayEasternKey(r.updatedAt),
      at: r.updatedAt.toISOString(),
    });
  }
  return out;
}

export async function saveShortPay(
  input: { invoiceNumber: unknown; reason: unknown; amountCents: unknown; note: unknown },
  email: string,
): Promise<{ ok: true } | { error: string }> {
  const invoiceNumber = followUpNumber(typeof input.invoiceNumber === "string" ? input.invoiceNumber : null);
  if (!invoiceNumber) return { error: "Only invoices with a number can have a short pay reason." };
  if (!isShortPayReason(input.reason)) return { error: "Pick why it was paid short." };
  const amountCents = input.amountCents == null || input.amountCents === "" ? null : Number(input.amountCents);
  if (amountCents != null && (!Number.isInteger(amountCents) || amountCents <= 0)) return { error: "Amount must be more than $0." };
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) || null : null;
  if (input.reason === "OTHER" && !note) return { error: "Say what happened." };
  const data = { reason: input.reason, amountCents, note, byEmail: email };
  await prisma.invoiceShortPay.upsert({ where: { invoiceNumber }, create: { invoiceNumber, ...data }, update: data });
  return { ok: true };
}

export async function deleteShortPay(invoiceNumber: unknown): Promise<void> {
  const n = followUpNumber(typeof invoiceNumber === "string" ? invoiceNumber : null);
  if (n) await prisma.invoiceShortPay.deleteMany({ where: { invoiceNumber: n } });
}
