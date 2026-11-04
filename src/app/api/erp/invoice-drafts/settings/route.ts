import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { setDraftsGoToQuickBooks } from "@/lib/erp/qboInvoiceDrafts";

/** Admin switch: where new drafts go, { qboDrafts: true } for QuickBooks (with an optional nextInvoiceNumber) or false for HubSpot (backup). */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || auth.role !== "ADMIN") return NextResponse.json({ error: "Only an Admin can change where invoices go." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { qboDrafts?: unknown; nextInvoiceNumber?: unknown };
  if (typeof body.qboDrafts !== "boolean") return NextResponse.json({ error: "qboDrafts is required" }, { status: 400 });
  const next = body.nextInvoiceNumber === undefined || body.nextInvoiceNumber === null ? undefined : Number(body.nextInvoiceNumber);
  const result = await setDraftsGoToQuickBooks(body.qboDrafts, next);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
