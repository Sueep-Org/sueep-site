import { NextResponse } from "next/server";
import { sendManagementReminders } from "@/lib/erp/managementReminders";
import { sendQualityCheckReminders } from "@/lib/erp/janitorialQualityChecks";
import { sendLienAlerts } from "@/lib/erp/lienAlerts";
import { sendBillingCutoffReminders } from "@/lib/erp/billingCutoffs";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json), ~8am Eastern (7am during EST, fixed UTC like
 * the other crons). Emails Admins, PMs and the Business Manager the Management calendar items that
 * reach one of their category's reminder days today, plus the quality check
 * emails (tomorrow's checks to whoever does them, and overdue ones) and the
 * lien alerts (jobs that reached a new lien stage), and billing cutoff
 * reminders to each job's PM 5 days before the GC's cutoff.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendManagementReminders();
  const qualityChecks = await sendQualityCheckReminders();
  const lienAlerts = await sendLienAlerts().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const billingCutoffs = await sendBillingCutoffReminders().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return NextResponse.json({ ...result, qualityChecks, lienAlerts, billingCutoffs });
}
