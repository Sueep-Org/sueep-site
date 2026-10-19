import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { emailDraftPreview } from "@/lib/erp/invoiceDraftExtras";

/** Emails the signed-in person a preview of the client email for a waiting draft. Body: { kind, rowId }. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; rowId?: unknown };
  if ((body.kind !== "month" && body.kind !== "items") || typeof body.rowId !== "string") return NextResponse.json({ error: "Unknown draft." }, { status: 400 });
  const result = await emailDraftPreview(body.kind, body.rowId, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json({ ok: true, to: auth.email });
}
