import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type HubSpotDealSearchResult = {
  results?: Array<{ id: string; properties?: { dealname?: string | null; amount?: string | null; dealstage?: string | null } }>;
};

/** Free-text search for HubSpot deals — defaults to this building's name but
 * accepts a `q` override, since the deal name doesn't always resemble the
 * building name closely enough for the default search to find it. */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const qParam = new URL(req.url).searchParams.get("q")?.trim();

  let query = qParam;
  if (!query) {
    const building = await prisma.building.findUnique({ where: { id }, select: { name: true } });
    if (!building) return NextResponse.json({ error: "Not found" }, { status: 404 });
    query = building.name.trim();
  }

  const res = await hubspotFetch("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      properties: ["dealname", "amount", "dealstage"],
      limit: 10,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `HubSpot search failed: ${text}` }, { status: 502 });
  }

  const data = (await res.json()) as HubSpotDealSearchResult;
  const results = (data.results ?? []).map((r) => ({
    id: r.id,
    name: r.properties?.dealname?.trim() || `Deal ${r.id}`,
  }));
  return NextResponse.json({ results });
}
