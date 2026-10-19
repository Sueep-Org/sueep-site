import { NextResponse } from "next/server";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadManagementCategories, loadManagementItems } from "@/lib/erp/managementCalendarServer";
import { BID_CATEGORY_KEY } from "@/lib/erp/managementCalendar";
import { canManageManagementCalendar, canSeeBidCalendar, getErpAuth } from "@/lib/erpAuth";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 62;

/** Feed for the Schedule page's Management tab. Admin, PM and Business Manager get everything;
 * Sales and Estimation get the Bids category only. Editing routes stay Admin, PM and BM. */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeBidCalendar(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const bidsOnly = !canManageManagementCalendar(auth.role);

  const { searchParams } = new URL(req.url);
  const start = parseDateKey(searchParams.get("start"));
  const end = parseDateKey(searchParams.get("end"));
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)" }, { status: 400 });
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range can't be longer than ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const all = await loadManagementCategories();
  const categories = bidsOnly ? all.filter((c) => c.builtinKey === BID_CATEGORY_KEY) : all;
  const items = await loadManagementItems(searchParams.get("start")!, searchParams.get("end")!, categories);
  return NextResponse.json({ items, categories });
}
