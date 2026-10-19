import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { setDraftDueDate } from "@/lib/erp/invoiceDraftExtras";

/** Sets a waiting draft's due date when its client company has no payment terms. Body: { kind, rowId, dueDate }. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; rowId?: unknown; dueDate?: unknown };
  if ((body.kind !== "month" && body.kind !== "items") || typeof body.rowId !== "string") return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
  const result = await setDraftDueDate(body.kind, body.rowId, typeof body.dueDate === "string" ? body.dueDate : "");
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
