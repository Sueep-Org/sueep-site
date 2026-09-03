import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Stripe requires the raw body for signature verification — disable body parsing
export const dynamic = "force-dynamic";

// Used to handle both this repo's own real_estate_turnover billing and the
// estimator's subscription billing in one endpoint. The estimator side
// (and everything it needed -- customer.subscription.updated/deleted,
// Company/EstimatorUser, @/lib/estimatorBilling) moved out with the rest
// of the estimator during the Piramid split-out (see the migration plan);
// piramid.ai has its own webhook endpoint and its own Stripe event
// handling now. Only the real_estate_turnover branch is this repo's own.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !webhookSecret) {
    console.error("Stripe webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    const stripe = new Stripe(secret);
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const service = session.metadata?.service;

    if (service === "real_estate_turnover") {
      const projectId = session.metadata?.projectId;
      if (projectId) {
        try {
          await prisma.project.update({
            where: { id: projectId },
            data: { billingStatus: "BILLING", percentInvoiced: 50 },
          });
          console.log(`Stripe deposit confirmed — project ${projectId} billing status updated to BILLING (50%)`);
        } catch (e) {
          console.error(`Stripe webhook: failed to update project ${projectId}:`, e);
          // Return 200 so Stripe doesn't retry — log the error for manual resolution
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
