import { NextResponse } from "next/server";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { parseDateKey } from "@/lib/erp/janitorialSchedule";
import { loadJanitorialHours } from "@/lib/erp/janitorialHoursServer";

const MAX_RANGE_DAYS = 31;

/** Resolved hours for every janitorial shift in a date range (see janitorialHours.ts). */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const start = parseDateKey(searchParams.get("start"));
  const end = parseDateKey(searchParams.get("end"));
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "start and end are required (YYYY-MM-DD)" }, { status: 400 });
  }
  if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Range can't be longer than ${MAX_RANGE_DAYS} days` }, { status: 400 });
  }

  const rows = await loadJanitorialHours(start, end);
  return NextResponse.json({ rows });
}
