import { NextResponse } from "next/server";
import { alertMissedCheckIns } from "@/lib/erp/subCheckIns";

export const dynamic = "force-dynamic";

/** Every 15 minutes (see vercel.json): subs running a day who haven't checked in by the start time plus grace. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await alertMissedCheckIns());
}
