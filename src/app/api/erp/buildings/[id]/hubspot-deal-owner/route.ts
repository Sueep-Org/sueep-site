import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { matchEmployeeByHubspotOwner } from "@/lib/erp/commission";

export const runtime = "nodejs";

/**
 * Looks up a HubSpot deal's owner and suggests a matching ERP employee for
 * Building.commissionEmployeeId — same email/name matching used to default
 * a Project's commission owner from its synced HubSpot deal, applied here so
 * a PM doesn't have to manually pick someone who's already the deal owner in
 * HubSpot. `dealId` is taken from the query string rather than the saved
 * building record since this needs to work against a deal the user just
 * picked in the search UI, before it's been saved.
 */
export async function GET(req: Request) {
  const dealId = new URL(req.url).searchParams.get("dealId")?.trim();
  if (!dealId) return NextResponse.json({ error: "dealId is required" }, { status: 400 });

  const dealRes = await hubspotFetch(`/crm/v3/objects/deals/${dealId}?properties=hubspot_owner_id`);
  if (!dealRes.ok) {
    const text = await dealRes.text();
    return NextResponse.json({ error: `HubSpot deal lookup failed: ${text}` }, { status: 502 });
  }
  const deal = (await dealRes.json()) as { properties?: { hubspot_owner_id?: string | null } };
  const ownerId = deal.properties?.hubspot_owner_id;
  if (!ownerId) return NextResponse.json({ ownerName: null, ownerEmail: null, matchedEmployeeId: null });

  const ownerRes = await hubspotFetch(`/crm/v3/owners/${ownerId}`);
  if (!ownerRes.ok) {
    const text = await ownerRes.text();
    return NextResponse.json({ error: `HubSpot owner lookup failed: ${text}` }, { status: 502 });
  }
  const owner = (await ownerRes.json()) as { email?: string; firstName?: string; lastName?: string };
  const ownerEmail = owner.email ?? null;
  const ownerName = `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() || ownerEmail;

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, email: true, firstName: true, lastName: true },
  });

  const matched = matchEmployeeByHubspotOwner(ownerEmail, ownerName, employees);

  return NextResponse.json({
    ownerName,
    ownerEmail,
    matchedEmployeeId: matched?.id ?? null,
    matchedEmployeeName: matched ? `${matched.firstName} ${matched.lastName}`.trim() : null,
  });
}
