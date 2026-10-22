import { NextResponse } from "next/server";
import { fillWalkDatesFromMeetings } from "@/lib/erp/dealWalks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs hourly (see vercel.json). Fills open deals' Job Walk Date from walk
 * meetings on them in HubSpot (dealWalks.ts), so walks booked in a synced
 * calendar show on the management calendar.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await fillWalkDatesFromMeetings({ apply: true });
  return NextResponse.json({ filled: rows.filter((r) => r.result === "filled").length, errors: rows.filter((r) => r.result === "error") });
}
