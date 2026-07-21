import { NextResponse } from "next/server";
import { searchJanitorialDealsForBuildingCreation } from "@/lib/hubspot/dealSearch";

export const runtime = "nodejs";

/**
 * Free-text search for janitorial-pipeline deals (Walkthrough through
 * Signed) — used by the New Project wizard's "add new building" step so a
 * building can be named/linked from its matching deal instead of typed in
 * blind. Not building-scoped since there's no Building yet at this point.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  try {
    const deals = await searchJanitorialDealsForBuildingCreation(q);
    const results = deals.map((d) => ({ id: d.id, name: d.properties.dealname?.trim() || `Deal ${d.id}` }));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "HubSpot search failed" }, { status: 502 });
  }
}
