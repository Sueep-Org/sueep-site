import { NextResponse } from "next/server";
import { runStageNextSteps } from "@/lib/erp/dealStageSteps";
import { runFollowAlerts } from "@/lib/erp/dealFollowers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs hourly (see vercel.json). Deals moved forward in HubSpot get their new
 * stage's automatic next step from the stage rules (dealStageSteps.ts), and
 * people following deals hear what changed (dealFollowers.ts).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await runStageNextSteps({ apply: true });
  const count = (r: string) => rows.filter((x) => x.result === r).length;
  // Separate so one failing never stops the other.
  const alerts = await runFollowAlerts({ apply: true }).catch((e) => {
    console.error("deal follow alerts failed:", e);
    return null;
  });
  return NextResponse.json({
    steps: count("step"),
    recorded: count("recorded"),
    hadStep: count("had step"),
    noRule: count("no rule"),
    back: count("back"),
    followAlerts: alerts?.length ?? "failed",
  });
}
