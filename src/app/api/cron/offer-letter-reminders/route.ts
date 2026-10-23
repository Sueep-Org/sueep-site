import { NextResponse } from "next/server";
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
  return NextResponse.json(await sendOfferLetterReminders());
}
