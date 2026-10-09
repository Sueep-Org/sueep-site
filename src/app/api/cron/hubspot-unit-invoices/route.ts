import { NextResponse } from "next/server";
import { syncAllUnitInvoices } from "@/lib/hubspot/syncUnitInvoices";
import { syncAllProjectInvoices } from "@/lib/hubspot/syncProjectInvoices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs hourly (see vercel.json). Mirrors HubSpot invoices onto building
 * units and onto post-construction SOV lines / change orders, for display
 * only; never changes billing status.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const units = await syncAllUnitInvoices();
  const projects = await syncAllProjectInvoices();
  return NextResponse.json({ units, projects });
}
