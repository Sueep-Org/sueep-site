import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendTurnoverCompletionDigest } from "@/lib/erp/turnoverCompletionDigest";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~6pm Eastern (5pm during EST, this fixed-UTC
 * schedule doesn't correct for DST, same as the existing schedule-nudge
 * crons). Emails each building's property manager a digest of every
 * turnover unit completed since it was last accounted for (not just what
 * finished today, a unit marked complete a few days late still gets caught
 * here rather than missing its window entirely, see
 * turnoverCompletionDigest.ts for the recent/stale/safety-ceiling
 * thresholds), bcc'ing the Sueep PM(s) involved. Skipped entirely for a
 * building with nothing to report, and skipped (logged, retried next run)
 * for a building with no property manager on file.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 19:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 19)) return NextResponse.json({ skipped: "Runs at 19:00 Eastern; this was the other UTC hour" });

  const result = await sendTurnoverCompletionDigest();
  return NextResponse.json(result);
}
