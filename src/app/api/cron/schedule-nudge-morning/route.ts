import { NextResponse } from "next/server";
import { sendScheduleNudgeEmails } from "@/lib/erp/scheduleNudge";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~8am Eastern (7am during EST — this fixed-UTC
 * schedule doesn't correct for DST, same as the existing recurring-contracts
 * cron). Emails each project's PM (by name, any role, backup PMs when no
 * match) the ACTIVE projects still unscheduled for today; skipped entirely if nothing is unscheduled.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendScheduleNudgeEmails("morning");
  return NextResponse.json(result);
}
