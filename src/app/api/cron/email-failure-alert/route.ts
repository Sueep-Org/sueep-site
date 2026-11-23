import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendEmailFailureAlert } from "@/lib/emailFailureAlert";

export const dynamic = "force-dynamic";

/** Runs daily (see vercel.json), ~9am Eastern. Emails Admins only when emails failed in the last day. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 9:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 9)) return NextResponse.json({ skipped: "Runs at 9:00 Eastern; this was the other UTC hour" });
  return NextResponse.json(await sendEmailFailureAlert());
}
