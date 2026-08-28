import { NextResponse } from "next/server";
import { processPaidInvoices } from "@/lib/hubspot/syncInvoicePayments";

export const dynamic = "force-dynamic";

/**
 * Runs on a schedule (see vercel.json) — HubSpot's private-app webhook
 * subscriptions don't currently support the Invoice object, so this polls
 * for currently-paid invoices instead of being pushed a notification.
 * Safe to run any number of times: already-applied line items are
 * idempotent no-ops (see processPaidInvoices/HubSpotInvoiceLineItemMatch).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processPaidInvoices();
  return NextResponse.json(result);
}
