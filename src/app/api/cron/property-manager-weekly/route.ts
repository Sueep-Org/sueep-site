import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendPropertyManagerWeeklyEmails } from "@/lib/erp/propertyManagerWeekly";

export const dynamic = "force-dynamic";

/**
 * Runs Monday mornings (see vercel.json), about 7:30am Eastern (6:30am
 * during EST, fixed UTC like the other crons). Emails each property manager
 * their turnovers for the week.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 7:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 7)) return NextResponse.json({ skipped: "Runs at 7:00 Eastern; this was the other UTC hour" });

  const result = await sendPropertyManagerWeeklyEmails();
  return NextResponse.json(result);
}
