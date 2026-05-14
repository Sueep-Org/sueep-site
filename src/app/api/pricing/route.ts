import { NextRequest, NextResponse } from "next/server";
import { computeServicePricing, parseServicePricingPayload } from "@/lib/servicePricing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = parseServicePricingPayload(body);
    if (!input) {
      return NextResponse.json({ error: "Invalid pricing request" }, { status: 400 });
    }

    const pricing = computeServicePricing(input);
    return NextResponse.json(pricing);
  } catch (err) {
    console.error("/api/pricing error", err);
    return NextResponse.json({ error: "Failed to compute pricing" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const service = String(searchParams.get("service") || "").trim().toLowerCase();
  const beds = Number(searchParams.get("beds"));

  if ((service !== "cleaning" && service !== "painting") || !Number.isFinite(beds) || beds < 1) {
    return NextResponse.json({ error: "Invalid pricing query" }, { status: 400 });
  }

  const pricing = computeServicePricing({ service, beds });
  return NextResponse.json(pricing);
}
