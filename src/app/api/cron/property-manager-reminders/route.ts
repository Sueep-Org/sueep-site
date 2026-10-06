import { NextResponse } from "next/server";
import { sendPropertyManagerReminders } from "@/lib/erp/propertyManagerReminders";

export const dynamic = "force-dynamic";

/**
 * Runs weekday mornings (see vercel.json), about 9:30am Eastern (8:30am
 * during EST, fixed UTC like the other crons). Reminds staff about property
 * manager requests and changes waiting over a business day.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendPropertyManagerReminders();
  return NextResponse.json(result);
}
