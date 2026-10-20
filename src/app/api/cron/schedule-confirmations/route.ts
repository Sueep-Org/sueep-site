import { NextResponse } from "next/server";
import { sendUnansweredAlert } from "@/lib/erp/scheduleConfirmations";

export const dynamic = "force-dynamic";

/**
 * Daily about 2pm Eastern (vercel.json; fixed UTC like the other crons, so
 * 1pm during EST): one email to the Schedule not confirmed recipients listing
 * everyone scheduled for tomorrow who hasn't clicked Confirm or Can't make it.
 * Each invite is only listed once; nothing is sent when everyone answered.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await sendUnansweredAlert().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json(result);
}
