import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { resetDraftRecipients, setDraftRecipients, type RecipientDraftKind } from "@/lib/erp/invoiceRecipients";

const KINDS: RecipientDraftKind[] = ["month", "items", "qbo"];

/**
 * Who a waiting draft on Ready to send is emailed to.
 * Body: { kind, rowId, to: string[], cc: string[], forFuture?: boolean } or { kind, rowId, reset: true }.
 */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = body?.kind as RecipientDraftKind;
  const rowId = typeof body?.rowId === "string" ? body.rowId : "";
  if (!KINDS.includes(kind) || !rowId) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const result = body?.reset === true ? await resetDraftRecipients(kind, rowId) : await setDraftRecipients(kind, rowId, { to: body?.to, cc: body?.cc, forFuture: body?.forFuture === true }, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
