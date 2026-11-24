import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { isDismissReason } from "@/lib/erp/invoiceCleanupShared";
import { parseResolveKeys, resolveOldUnpaid } from "@/lib/erp/invoiceCleanupResolve";
import { todayEasternKey } from "@/lib/erp/dates";

export const dynamic = "force-dynamic";

type Body = {
  action?: "dismiss" | "undo" | "paid" | "void";
  /** paid / void: Old unpaid work keys ("sov:<id>", "co:<id>", "turn:<id>", "month:<id>", "project:<id>") */
  keys?: unknown;
  /** paid: YYYY-MM-DD the money came in */
  paidOn?: unknown;
  hubspotInvoiceIds?: unknown;
  reason?: unknown;
  note?: unknown;
};

/**
 * Invoice cleanup page: dismiss paid HubSpot invoices that don't need linking
 * to any work (their unmatched lines become IGNORED with a reason, so the
 * sync leaves them alone and they leave Needs linking), or undo that.
 * Linking itself goes through /api/erp/hubspot-invoice-links.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Body;

  if (body.action === "paid" || body.action === "void") {
    const keys = parseResolveKeys(body.keys);
    if (!keys) return NextResponse.json({ error: "Pick between 1 and 500 lines" }, { status: 400 });
    if (body.action === "paid") {
      const key = typeof body.paidOn === "string" ? body.paidOn : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || key > todayEasternKey() || key < "2020-01-01") {
        return NextResponse.json({ error: "Give the date it was paid (not in the future)" }, { status: 400 });
      }
      const lines = await resolveOldUnpaid(keys, { kind: "PAID", paidOn: new Date(`${key}T12:00:00.000Z`) });
      return NextResponse.json({ ok: true, lines });
    }
    const reason = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (reason.length < 3) return NextResponse.json({ error: "Say why it won't be billed" }, { status: 400 });
    const lines = await resolveOldUnpaid(keys, { kind: "VOID", reason });
    return NextResponse.json({ ok: true, lines });
  }

  const ids = Array.isArray(body.hubspotInvoiceIds) ? body.hubspotInvoiceIds.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  if (ids.length === 0 || ids.length > 500) {
    return NextResponse.json({ error: "Pick between 1 and 500 invoices" }, { status: 400 });
  }
  const byName = auth.email.split("@")[0] || auth.email;

  if (body.action === "dismiss") {
    if (!isDismissReason(body.reason)) return NextResponse.json({ error: "Pick a reason" }, { status: 400 });
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    if (body.reason === "OTHER" && !note) return NextResponse.json({ error: "Write why in the note" }, { status: 400 });
    const res = await prisma.hubSpotInvoiceLineItemMatch.updateMany({
      where: { hubspotInvoiceId: { in: ids }, status: "PENDING_REVIEW" },
      data: { status: "IGNORED", resolvedAt: new Date(), resolvedByName: byName, createAlias: false, dismissReason: body.reason, dismissNote: note || null },
    });
    return NextResponse.json({ ok: true, lines: res.count });
  }

  if (body.action === "undo") {
    // Only lines dismissed here; IGNORED from anywhere else stays as it was.
    const res = await prisma.hubSpotInvoiceLineItemMatch.updateMany({
      where: { hubspotInvoiceId: { in: ids }, status: "IGNORED", dismissReason: { not: null } },
      data: { status: "PENDING_REVIEW", resolvedAt: null, resolvedByName: null, dismissReason: null, dismissNote: null },
    });
    return NextResponse.json({ ok: true, lines: res.count });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
