import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import { getRequestOrigin } from "@/lib/requestOrigin";
import { getStripeClient } from "@/lib/estimatorBilling";

// Opens Stripe's hosted Customer Portal, this *is* "Stripe login" from the
// plan doc: card updates, invoices, cancellation, switching billing
// interval, all handled by Stripe's own UI. Nothing custom to build here
// beyond starting the session. Owner-only, same as checkout.
export async function POST(request: NextRequest) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ error: "Not part of a company yet" }, { status: 403 });
  if (user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the company owner can manage billing" }, { status: 403 });
  }

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (!company.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet, upgrade to Pro first" }, { status: 400 });
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (e) {
    console.error("estimator billing portal: Stripe not configured", e);
    return NextResponse.json({ error: "Billing is not configured" }, { status: 500 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${getRequestOrigin(request)}/estimator/settings?tab=billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("estimator billing portal: failed to create session", e);
    return NextResponse.json({ error: "Failed to open billing portal" }, { status: 500 });
  }
}
