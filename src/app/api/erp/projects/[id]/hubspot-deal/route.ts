import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { classifyHubSpotDealStage } from "@/lib/hubspot/pipelineStages";
import { getErpAuth, isPmLevel } from "@/lib/erpAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

type DealProps = {
  dealname?: string | null;
  pipeline?: string | null;
  dealstage?: string | null;
  hs_is_closed_lost?: string | null;
};

const DEAL_PROPS = ["dealname", "pipeline", "dealstage", "hs_is_closed_lost"];

/** Same rule the deal sync uses to delete a project (isDealClosedLost in
 * syncDealsToProjects.ts). Linking one of these would get the project deleted
 * on the next sync, so it's refused. */
function isClosedLost(p: DealProps): boolean {
  return p.hs_is_closed_lost === "true";
}

/** Accepts a bare deal ID or a pasted HubSpot deal link (…/record/0-3/<id>). */
function parseDealId(raw: string): string | null {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return s;
  const m = s.match(/0-3\/(\d+)/) ?? s.match(/deals?\/(\d+)/i);
  return m ? m[1] : null;
}

async function requirePm() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPmLevel(auth.role)) return NextResponse.json({ error: "Only Admins and PMs can link HubSpot deals" }, { status: 403 });
  return null;
}

/** Search HubSpot deals by name, defaulting to the project's job title. */
export async function GET(req: Request, ctx: Ctx) {
  const denied = await requirePm();
  if (denied) return denied;
  const { id } = await ctx.params;

  let query = new URL(req.url).searchParams.get("q")?.trim();
  if (!query) {
    const project = await prisma.project.findUnique({ where: { id }, select: { jobTitle: true } });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    query = project.jobTitle.trim();
  }

  const res = await hubspotFetch("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({ query, properties: DEAL_PROPS, limit: 10 }),
  });
  if (!res.ok) {
    return NextResponse.json({ error: `HubSpot search failed: ${await res.text()}` }, { status: 502 });
  }
  const data = (await res.json()) as { results?: Array<{ id: string; properties?: DealProps }> };
  const results = (data.results ?? []).map((r) => {
    const p = r.properties ?? {};
    return {
      id: r.id,
      name: p.dealname?.trim() || `Deal ${r.id}`,
      closedLost: isClosedLost(p),
    };
  });
  return NextResponse.json({ results });
}

/** Link a manually created project to a HubSpot deal. After this the deal
 * sync and invoice sync treat it like any project the sync created. */
export async function POST(req: Request, ctx: Ctx) {
  const denied = await requirePm();
  if (denied) return denied;
  const { id } = await ctx.params;

  let body: { dealId?: unknown };
  try {
    body = (await req.json()) as { dealId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const dealId = parseDealId(String(body.dealId ?? ""));
  if (!dealId) return NextResponse.json({ error: "Enter a deal ID or paste the deal's HubSpot link" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id },
    select: { hubspotDealId: true, segment: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.hubspotDealId) {
    return NextResponse.json({ error: "This project is already linked to a HubSpot deal" }, { status: 409 });
  }
  if (project.segment === "JANITORIAL_TURNOVER_REQUESTS") {
    return NextResponse.json({ error: "Turnover units use their building's HubSpot deal" }, { status: 400 });
  }

  const [otherProject, building] = await Promise.all([
    prisma.project.findUnique({ where: { hubspotDealId: dealId }, select: { id: true, jobTitle: true } }),
    prisma.building.findUnique({ where: { hubspotDealId: dealId }, select: { name: true } }),
  ]);
  if (otherProject) {
    return NextResponse.json(
      { error: `This deal is already linked to another project: ${otherProject.jobTitle}`, projectId: otherProject.id },
      { status: 409 },
    );
  }
  if (building) {
    return NextResponse.json({ error: `This deal is already linked to the building ${building.name}` }, { status: 409 });
  }

  const res = await hubspotFetch(`/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPS.join(",")}`);
  if (res.status === 404) return NextResponse.json({ error: "No HubSpot deal has that ID" }, { status: 404 });
  if (!res.ok) return NextResponse.json({ error: `HubSpot lookup failed: ${await res.text()}` }, { status: 502 });
  const deal = (await res.json()) as { properties?: DealProps };
  const p = deal.properties ?? {};

  if (isClosedLost(p)) {
    return NextResponse.json(
      { error: "That deal is closed lost in HubSpot. The sync deletes projects linked to lost deals, so it can't be linked." },
      { status: 400 },
    );
  }
  if (!classifyHubSpotDealStage(p.pipeline, p.dealstage)) {
    return NextResponse.json({ error: "That deal's pipeline isn't one the ERP syncs" }, { status: 400 });
  }

  try {
    await prisma.project.update({
      where: { id },
      data: { hubspotDealId: dealId, hubspotPipelineId: p.pipeline ?? null, hubspotStageId: p.dealstage ?? null },
    });
  } catch {
    // Unique index: someone linked the same deal elsewhere in the meantime.
    return NextResponse.json({ error: "This deal was just linked somewhere else" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, dealId, dealName: p.dealname?.trim() || null });
}
