import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendScheduleNudgeEmails } from "@/lib/erp/scheduleNudge";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~1pm Eastern (noon during EST — same
 * fixed-UTC/DST caveat as schedule-nudge-morning). Follow-up nudge: only
 * emails each project's PM (same recipients as the morning one) if projects
 * are still unscheduled by midday.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 13:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 13)) return NextResponse.json({ skipped: "Runs at 13:00 Eastern; this was the other UTC hour" });

  const result = await sendScheduleNudgeEmails("midday");
  return NextResponse.json(result);
}
