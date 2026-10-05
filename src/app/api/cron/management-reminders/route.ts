import { NextResponse } from "next/server";
import { sendManagementReminders } from "@/lib/erp/managementReminders";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~8am Eastern (7am during EST, fixed UTC like
 * the other crons). Emails Admins and PMs the Management calendar items that
 * reach one of their category's reminder days today.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendManagementReminders();
  return NextResponse.json(result);
}
