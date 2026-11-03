import { NextResponse } from "next/server";
import { getErpAuth, canSeeFinanceDashboard } from "@/lib/erpAuth";
import { loadQuickBooksComparison } from "@/lib/erp/qboCompare";

export const dynamic = "force-dynamic";

/** Compare with QuickBooks on the Finance tab, loaded when it's opened. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinanceDashboard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ months: await loadQuickBooksComparison() });
}
