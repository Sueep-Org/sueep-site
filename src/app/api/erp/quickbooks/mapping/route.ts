import { NextResponse } from "next/server";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { clearCompanyCustomer, isLineKind, setCompanyCustomer, setLineItem } from "@/lib/erp/qboMapping";

/**
 * Invoice setup (ERP_QBO_INVOICING_PLAN.md Phase 1). Only saves in the ERP;
 * nothing is sent to QuickBooks.
 * - { companyId, qboCustomerId: string | null } confirms a company's customer (null: make a new one at the switch)
 * - { companyId, clear: true } undoes that
 * - { lineKind, qboItemId: string | null } sets or clears a line's product
 */
export async function PATCH(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { companyId?: unknown; qboCustomerId?: unknown; clear?: unknown; lineKind?: unknown; qboItemId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const idOrNull = (v: unknown): v is string | null => v === null || (typeof v === "string" && v.length > 0 && v.length < 64);
  const email = auth.email ?? null;

  if (typeof body.companyId === "string") {
    if (body.clear === true) return NextResponse.json(await clearCompanyCustomer(body.companyId));
    if (!idOrNull(body.qboCustomerId)) return NextResponse.json({ error: "Pick a customer" }, { status: 400 });
    const r = await setCompanyCustomer(body.companyId, body.qboCustomerId, email);
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  if (isLineKind(body.lineKind)) {
    if (!idOrNull(body.qboItemId)) return NextResponse.json({ error: "Pick a product" }, { status: 400 });
    const r = await setLineItem(body.lineKind, body.qboItemId, email);
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
}
