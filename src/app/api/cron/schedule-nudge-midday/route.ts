import { NextResponse } from "next/server";
import { sendScheduleNudgeEmails } from "@/lib/erp/scheduleNudge";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~1pm Eastern (noon during EST — same
 * fixed-UTC/DST caveat as schedule-nudge-morning). Follow-up nudge: only
 * emails PROJECT_MANAGER users if projects are still unscheduled by midday.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendScheduleNudgeEmails("midday");
  return NextResponse.json(result);
}
