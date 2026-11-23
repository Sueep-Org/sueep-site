import { NextResponse } from "next/server";
import { runsNowAtEasternHour } from "@/lib/erp/cronEastern";
import { sendOfferLetterReminders } from "@/lib/erp/offerLetterReminders";

export const dynamic = "force-dynamic";

/**
 * Runs daily about 8am Eastern (see vercel.json; fixed UTC like the other
 * crons). Reminds whoever sent an offer letter the day before it's due back.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Listed at two UTC hours in vercel.json; only the 8:00 Eastern run does the work (daylight saving).
  if (!runsNowAtEasternHour(req, 8)) return NextResponse.json({ skipped: "Runs at 8:00 Eastern; this was the other UTC hour" });
  return NextResponse.json(await sendOfferLetterReminders());
}
