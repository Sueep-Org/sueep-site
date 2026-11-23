import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendScheduleNudgeEmails } from "@/lib/erp/scheduleNudge";

export const dynamic = "force-dynamic";

/**
 * Runs daily at 8am Eastern all year (listed at two UTC hours in vercel.json,
 * see cronEastern.ts). Emails each project's PM (by name, any role, backup PMs when no
 * match) the ACTIVE projects still unscheduled for today; skipped entirely if nothing is unscheduled.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 8:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 8)) return NextResponse.json({ skipped: "Runs at 8:00 Eastern; this was the other UTC hour" });

  const result = await sendScheduleNudgeEmails("morning");
  return NextResponse.json(result);
}
