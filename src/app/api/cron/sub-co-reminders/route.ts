import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { runSubCoReminders } from "@/lib/erp/subCoReminders";

export const dynamic = "force-dynamic";

/**
 * Runs weekday mornings (see vercel.json), about 9:30am Eastern (8:30am
 * during EST, fixed UTC like the other crons). Reminds property managers
 * about sub change orders they haven't answered, and lists the ones waiting
 * too long for David and Jennifer.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 9:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 9)) return NextResponse.json({ skipped: "Runs at 9:00 Eastern; this was the other UTC hour" });

  const result = await runSubCoReminders();
  return NextResponse.json(result);
}
