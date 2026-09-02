import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { billingIntervalFromRecurring, planTierFromSubscriptionStatus } from "@/lib/estimatorBilling";

export const runtime = "nodejs";

// Stripe requires the raw body for signature verification — disable body parsing
export const dynamic = "force-dynamic";

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
    } else if (service === "estimator_subscription") {
      await handleEstimatorCheckoutCompleted(session, new Stripe(secret));
    }
  } else if (event.type === "customer.subscription.updated") {
    await handleEstimatorSubscriptionSync(event.data.object as Stripe.Subscription);
  } else if (event.type === "customer.subscription.deleted") {
    await handleEstimatorSubscriptionCanceled(event.data.object as Stripe.Subscription);
  }

  return NextResponse.json({ ok: true });
}

// Fetches the subscription directly rather than trusting whatever the
// checkout.session.completed payload happens to include for `subscription`
// (often just an ID, not expanded), this way period end / status / price
// are correct immediately, not "correct once the next event happens to
// arrive."
async function handleEstimatorCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const companyId = session.metadata?.companyId;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!companyId || !subscriptionId || !customerId) {
    console.error("estimator webhook: checkout.session.completed missing companyId/subscription/customer");
    return;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncCompanyFromSubscription(companyId, customerId, subscription);
    console.log(`Estimator subscription started, company ${companyId} now on Pro`);
  } catch (e) {
    console.error(`estimator webhook: failed to sync company ${companyId} after checkout:`, e);
  }
}

// customer.subscription.updated fires for plan changes, renewals, and
// every step of Stripe's own failed-payment retry schedule, this is what
// keeps planTier/status/currentPeriodEnd honest on an ongoing basis, not
// just at initial signup.
async function handleEstimatorSubscriptionSync(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const company = await prisma.company.findUnique({ where: { stripeCustomerId: customerId } });
  if (!company) return; // not an estimator subscription (e.g. unrelated Stripe activity on this account)

  await syncCompanyFromSubscription(company.id, customerId, subscription);
}

async function handleEstimatorSubscriptionCanceled(subscription: Stripe.Subscription) {
  const company = await prisma.company.findUnique({ where: { stripeSubscriptionId: subscription.id } });
  if (!company) return;

  // freeTrialUploadsUsed is left untouched on purpose, canceling doesn't
  // re-grant the free upload (plan §2/§8). stripeCustomerId/subscriptionId
  // stay on the row too, both as a history trail and so a resubscribe
  // reuses the existing Stripe customer instead of minting a new one.
  await prisma.company.update({
    where: { id: company.id },
    data: { planTier: "FREE", stripeSubscriptionStatus: "canceled", currentPeriodEnd: null },
  });
  console.log(`Estimator subscription canceled, company ${company.id} downgraded to Free`);
}

async function syncCompanyFromSubscription(companyId: string, customerId: string, subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      planTier: planTierFromSubscriptionStatus(subscription.status),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripeBillingInterval: billingIntervalFromRecurring(price?.recurring) ?? undefined,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}
