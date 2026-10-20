/**
 * Re-bid a job we lost as GC Not Awarded with the GC that won it (PIPELINE_PLAN
 * Phase 5): creates a new post-construction deal in HubSpot at Lead and links
 * the two (DealRebid).
 *
 * - The lost deal is read from HubSpot first: it must be in the post-con
 *   pipeline, lost, with GC Not Awarded, and have a winner recorded in the ERP.
 * - The new deal copies the name (with the winning GC in place of the old
 *   one), amount, Area SQFT and Type of business. Company is the winning GC.
 *   Deal Description says which deal it came from.
 * - Owner: whoever the person picked in the confirm dialog (it starts on the
 *   lost deal's owner when they're active). Must be an active HubSpot owner.
 * - A Lead deal never creates an ERP project; only won stages do.
 * - One re-bid per lost deal.
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { normalizeCompanyName } from "./clientCompanies";
import { splitReasons, GC_NOT_AWARDED } from "./dealLostReasons";
import { isActiveOwner, pipelineStages, readDealForChange } from "./dealGuard";

/** "Ardmore House II - Harkins Builders" with winner "HIGH" becomes "Ardmore House II - HIGH". */
export function rebidName(name: string, oldGc: string | null, winner: string): string {
  const parts = name.split(/\s+-\s+/);
  const tail = parts.length > 1 ? parts[parts.length - 1]! : null;
  if (tail && oldGc && normalizeCompanyName(tail) === normalizeCompanyName(oldGc)) return [...parts.slice(0, -1), winner].join(" - ");
  return `${name} - ${winner}`;
}

export type CreateRebidInput = { fromDealId: string; ownerId: string | null; dealName: string; byEmail: string };

export async function createRebid(input: CreateRebidInput): Promise<{ error: string } | { newDealId: string }> {
  const name = input.dealName.trim().slice(0, 250);
  if (!name) return { error: "Give the new deal a name." };
  if (await prisma.dealRebid.findUnique({ where: { fromDealId: input.fromDealId } })) return { error: "This job was already re-bid." };
  const winner = await prisma.dealLostWinner.findUnique({ where: { hubspotDealId: input.fromDealId } });
  if (!winner) return { error: "Record which GC won first (Who won?)." };

  const deal = await readDealForChange(input.fromDealId, "post-con", ["deal_lost_reason", "amount", "area_sqft", "type_of_business"]);
  if ("error" in deal) return deal;
  const { rules, props: p } = deal;
  if (deal.outcome !== "lost") return { error: "Only lost post-construction deals can be re-bid." };
  if (!splitReasons(p.deal_lost_reason).includes(GC_NOT_AWARDED)) return { error: "Only deals lost as GC Not Awarded can be re-bid." };

  if (input.ownerId && !(await isActiveOwner(input.ownerId))) return { error: "That owner isn't active in HubSpot. Pick another." };

  const stages = await pipelineStages(rules.pipelineId);
  if ("error" in stages) return stages;
  const lead = stages.find((s) => /^\s*lead\s*$/i.test(s.label)) ?? stages[0];
  if (!lead) return { error: "The post-construction pipeline has no stages." };

  const properties: Record<string, string> = {
    dealname: name,
    pipeline: rules.pipelineId,
    dealstage: lead.id,
    company: winner.winningName,
    description: `Re-bid of "${p.dealname ?? ""}" (HubSpot deal ${input.fromDealId}), lost as GC Not Awarded. ${winner.winningName} won that job.`,
  };
  if (p.amount) properties.amount = p.amount;
  if (p.area_sqft) properties.area_sqft = p.area_sqft;
  if (p.type_of_business) properties.type_of_business = p.type_of_business;
  if (input.ownerId) properties.hubspot_owner_id = input.ownerId;

  // The link table must exist before HubSpot gets a new deal, or the deal would be made with no record of it.
  await prisma.dealRebid.findFirst({ select: { id: true } });
  const created = await hubspotFetch("/crm/v3/objects/deals", { method: "POST", body: JSON.stringify({ properties }) });
  if (!created.ok) {
    const msg = ((await created.json().catch(() => null)) as { message?: string } | null)?.message;
    return { error: `HubSpot didn't create the deal${msg ? `: ${msg}` : ` (${created.status})`}.` };
  }
  const newDealId = String(((await created.json()) as { id: string }).id);
  await prisma.dealRebid.create({
    data: { fromDealId: input.fromDealId, newDealId, winningCompanyId: winner.winningCompanyId, winningName: winner.winningName, byEmail: input.byEmail },
  });
  return { newDealId };
}

/** Every re-bid, by lost deal id. */
export async function loadRebids(): Promise<Map<string, { newDealId: string; winningName: string }>> {
  const rows = await prisma.dealRebid.findMany({ select: { fromDealId: true, newDealId: true, winningName: true } });
  return new Map(rows.map((r) => [r.fromDealId, { newDealId: r.newDealId, winningName: r.winningName }]));
}
