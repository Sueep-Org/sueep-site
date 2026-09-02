import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import { getRequestOrigin } from "@/lib/requestOrigin";
import {
  estimatorPriceId,
  getStripeClient,
  isCompanyPaid,
  isEstimatorBillingInterval,
} from "@/lib/estimatorBilling";

// Starts a Stripe Checkout session for the company's Pro subscription.
// Owner-only, same rule as everything else that changes company-wide state
// (see estimator/company/members). Billing is company-wide, not per-seat,
// one subscription covers every EstimatorUser on this company, up to
// seatLimit, so there's no per-user checkout, just one per company.
export async function POST(request: NextRequest) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Not part of a company yet" }, { status: 403 });
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the company owner can manage billing" }, { status: 403 });
  }

  let body: { interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!isEstimatorBillingInterval(body.interval)) {
    return NextResponse.json({ error: "interval must be one of: month, six_month, year" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (isCompanyPaid(company)) {
    return NextResponse.json(
      { error: "Already on Pro, use the billing portal to change plans, not a new checkout" },
      { status: 400 },
    );
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (e) {
    console.error("estimator checkout: Stripe not configured", e);
    return NextResponse.json({ error: "Billing is not configured" }, { status: 500 });
  }

  const origin = getRequestOrigin(request);
  const returnBase = `${origin}/estimator/settings?tab=billing`;

  // metadata on both the session and the subscription itself: the session
  // is only around for the initial checkout.session.completed event, but
  // customer.subscription.updated/deleted later on carry the subscription's
  // own metadata, not the session's, so it needs to be set in both places
  // for the webhook to identify this company on every event, not just the
  // first one.
  const metadata = {
    service: "estimator_subscription",
    companyId: company.id,
    billingInterval: body.interval,
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(company.stripeCustomerId
        ? { customer: company.stripeCustomerId }
        : { customer_email: user.email }),
      line_items: [{ price: estimatorPriceId(body.interval), quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: `${returnBase}&checkout=success`,
      cancel_url: `${returnBase}&checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout session missing URL" }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("estimator checkout: failed to create session", e);
    return NextResponse.json({ error: "Failed to start checkout" }, { status: 500 });
  }
}
