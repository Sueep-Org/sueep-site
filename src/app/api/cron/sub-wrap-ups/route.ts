import { NextResponse } from "next/server";
import { sendWrapUpEmails } from "@/lib/erp/subWrapUps";

export const dynamic = "force-dynamic";

/** Every 15 minutes (see vercel.json): end-of-day wrap-up emails to subs, and next-morning reminders. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendWrapUpEmails());
}
