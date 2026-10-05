import { NextResponse } from "next/server";
import { sendEmailFailureAlert } from "@/lib/emailFailureAlert";

export const dynamic = "force-dynamic";

/** Runs daily (see vercel.json), ~9am Eastern. Emails Admins only when emails failed in the last day. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await sendEmailFailureAlert());
}
