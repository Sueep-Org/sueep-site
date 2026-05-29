import { after } from "next/server";
import { NextResponse } from "next/server";
import { verifyHubSpotWebhookPost } from "@/lib/hubspot/signature";
import { handleHubSpotWebhookEvents, parseHubSpotWebhookBody } from "@/lib/hubspot/webhookEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HubSpot private app → Webhooks → Target URL.
 * Set in HubSpot: Integrations → Private Apps → [app] → Webhooks → Target URL =
 *   https://YOUR_DOMAIN/api/integrations/hubspot/webhook
 *
 * Requires `HUBSPOT_CLIENT_SECRET` (from the same private app) to verify `X-HubSpot-Signature`.
 * `HUBSPOT_ACCESS_TOKEN` is for outbound API calls, not this route.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-hubspot-signature") || request.headers.get("X-HubSpot-Signature");

  const secret = process.env.HUBSPOT_CLIENT_SECRET || "";

  if (!secret) {
    console.error("hubspot webhook: HUBSPOT_CLIENT_SECRET is not set");
    return NextResponse.json(
      { error: "Server misconfigured: add HUBSPOT_CLIENT_SECRET (private app client secret) to verify webhooks" },
      { status: 503 },
    );
  }

  if (!verifyHubSpotWebhookPost(request, rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const events = parseHubSpotWebhookBody(rawBody);
  if (!events) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Respond immediately so HubSpot doesn't retry; sync runs after the response.
  after(() => handleHubSpotWebhookEvents(events));

  return NextResponse.json({ received: events.length });
}

/** HubSpot may probe with GET; return 200 so health checks pass. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      "HubSpot webhook endpoint (GET = health check). HubSpot sends CRM events via POST with a signed body.",
  });
}
