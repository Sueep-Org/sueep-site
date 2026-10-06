import { NextResponse } from "next/server";
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

  const result = await sendPropertyManagerWeeklyEmails();
  return NextResponse.json(result);
}
