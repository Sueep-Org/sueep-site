import { NextResponse } from "next/server";
import { sendTurnoverCompletionDigest } from "@/lib/erp/turnoverCompletionDigest";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~6pm Eastern (5pm during EST — this fixed-UTC
 * schedule doesn't correct for DST, same as the existing schedule-nudge
 * crons). Emails each building's property manager a digest of every
 * turnover unit that finished today, bcc'ing the Sueep PM(s) involved;
 * skipped entirely for a building with nothing completed today, and skipped
 * (logged) for a building with no pmEmail on file.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendTurnoverCompletionDigest();
  return NextResponse.json(result);
}
