import { NextResponse } from "next/server";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadManagementCategories, loadManagementItems } from "@/lib/erp/managementCalendarServer";
import { requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

const MAX_RANGE_DAYS = 62;

/** Feed for the Schedule page's Management tab. Admin and PM only. */
export async function GET(req: Request) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const start = parseDateKey(searchParams.get("start"));
  const end = parseDateKey(searchParams.get("end"));
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)" }, { status: 400 });
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range can't be longer than ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const categories = await loadManagementCategories();
  const items = await loadManagementItems(searchParams.get("start")!, searchParams.get("end")!, categories);
  return NextResponse.json({ items, categories });
}
