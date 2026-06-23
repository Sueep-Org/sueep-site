import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getRequestOrigin } from "@/lib/requestOrigin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.agentEmail || "").trim();
    const name = String(body?.agentName || "").trim();
    const address = String(body?.address || "").trim();
    const priceCents = Math.round(Number(body?.priceCents) || 0);
    const projectId = String(body?.projectId || "").trim() || null;

    if (!email || priceCents <= 0) {
      return NextResponse.json({ error: "Invalid checkout request" }, { status: 400 });
    }

    const depositCents = Math.round(priceCents / 2);
    const secret = process.env.STRIPE_SECRET_KEY;

    if (!secret) {
      return NextResponse.json({ testMode: true, depositCents });
    }

    const stripe = new Stripe(secret);
    const origin = getRequestOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      customer_email: email,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Turnover services deposit (50%)",
              description: address
                ? `Property: ${address}. Secures scheduling. Final price confirmed in writing before work begins.`
                : "Secures scheduling. Final price confirmed in writing before work begins.",
            },
            unit_amount: depositCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        agentName: name,
        agentEmail: email,
        address,
        deposit_type: "50pct",
        service: "real_estate_turnover",
        ...(projectId ? { projectId } : {}),
      },
      return_url: `${origin}/real-estate-thank-you?status=ok&deposit=paid&session_id={CHECKOUT_SESSION_ID}`,
      wallet_options: { link: { display: "never" } },
    } as unknown as Stripe.Checkout.SessionCreateParams);

    if (!session.client_secret) {
      return NextResponse.json({ error: "Checkout session missing client secret" }, { status: 500 });
    }

    return NextResponse.json({ clientSecret: session.client_secret, depositCents });
  } catch (e) {
    console.error("/api/real-estate-checkout error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
