/**
 * Deal info edits from the pipeline board (PIPELINE_PLAN Phase 7): owner,
 * company (GC), Bid Date, Job Walk Date, Amount and Area SQFT, saved to
 * HubSpot on open deals only. Each changed field is logged (DealInfoChange).
 *
 * - The deal is read from HubSpot first: it must still be open and in the
 *   same pipeline. Won deals are ERP projects with their own contract values.
 * - Only fields that differ from HubSpot are sent. Blank clears a field.
 * - A typed company name can be added to a Company's other names, so the GC
 *   matches from then on (Admin and Business Manager only, same as editing
 *   companies).
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { loadRules } from "@/lib/hubspot/pipelineRules";
import { normalizeCompanyName } from "./clientCompanies";
import type { PipelineKey } from "./postConDeals";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CENTS = 1_000_000_000_00;
const MAX_SQFT = 100_000_000;

export const INFO_PROPS = ["hubspot_owner_id", "company", "bid_date", "completion_date", "amount", "area_sqft"] as const;
export type InfoProp = (typeof INFO_PROPS)[number];

/** Fields to change; leave a key out to keep it, null or "" to clear it. */
export type DealInfoChanges = {
  ownerId?: string | null;
  company?: string | null;
  bidDate?: string | null;
  walkDate?: string | null;
  cents?: number | null;
  sqft?: number | null;
};

export type SaveDealInfoInput = {
  dealId: string;
  pipeline: PipelineKey;
  changes: DealInfoChanges;
  /** Add the typed company name to this Company's other names */
  aliasCompanyId: string | null;
  mayEditCompanies: boolean;
  byEmail: string;
};

/** HubSpot's text for each field, "" for blank. */
function toHubSpot(changes: DealInfoChanges): { patch: Partial<Record<InfoProp, string>> } | { error: string } {
  const patch: Partial<Record<InfoProp, string>> = {};
  if ("ownerId" in changes) {
    const v = changes.ownerId ?? "";
    if (v && !/^\d+$/.test(v)) return { error: "Pick an owner from the list." };
    patch.hubspot_owner_id = v;
  }
  if ("company" in changes) patch.company = (changes.company ?? "").trim().slice(0, 200);
  for (const [key, prop, label] of [
    ["bidDate", "bid_date", "Bid Date"],
    ["walkDate", "completion_date", "Job Walk Date"],
  ] as const) {
    if (!(key in changes)) continue;
    const v = changes[key] ?? "";
    if (v && (!DAY_KEY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))) return { error: `Check the ${label}.` };
    patch[prop] = v;
  }
  if ("cents" in changes) {
    const c = changes.cents;
    if (c != null && (!Number.isInteger(c) || c < 0 || c > MAX_CENTS)) return { error: "Check the amount." };
    patch.amount = c == null ? "" : (c / 100).toFixed(2);
  }
  if ("sqft" in changes) {
    const q = changes.sqft;
    if (q != null && (!Number.isFinite(q) || q < 0 || q > MAX_SQFT)) return { error: "Check the square footage." };
    patch.area_sqft = q == null ? "" : String(q);
  }
  return { patch };
}

/** Same value? HubSpot returns numbers and dates in its own format ("1500.0", "2026-10-22T00:00:00Z"). */
function same(prop: InfoProp, hubspot: string | null | undefined, next: string): boolean {
  const cur = (hubspot ?? "").trim();
  if (prop === "amount" || prop === "area_sqft") return (cur === "" && next === "") || (cur !== "" && next !== "" && Number(cur) === Number(next));
  if (prop === "bid_date" || prop === "completion_date") return cur.slice(0, 10) === next;
  return cur === next;
}

export async function saveDealInfo(input: SaveDealInfoInput): Promise<{ error: string } | { changed: InfoProp[] }> {
  const built = toHubSpot(input.changes);
  if ("error" in built) return built;

  const rules = (await loadRules()).find((r) => r.key === input.pipeline);
  if (!rules) return { error: "Pipeline not found in HubSpot." };
  const res = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(input.dealId)}?properties=dealname,dealstage,pipeline,${INFO_PROPS.join(",")}`);
  if (res.status === 404) return { error: "This deal is no longer in HubSpot." };
  if (!res.ok) return { error: `Couldn't read the deal from HubSpot (${res.status}).` };
  const p = ((await res.json()) as { properties: Record<string, string | null> }).properties;
  if (p.pipeline !== rules.pipelineId) return { error: "This deal moved to another pipeline in HubSpot. Reload the page." };
  if (rules.won.has(p.dealstage ?? "") || rules.lost.has(p.dealstage ?? ""))
    return { error: "This deal is closed in HubSpot. Edit won and lost deals in HubSpot." };

  if (built.patch.hubspot_owner_id) {
    const owner = await hubspotFetch(`/crm/v3/owners/${built.patch.hubspot_owner_id}?archived=false`);
    if (!owner.ok) return { error: "That owner isn't active in HubSpot. Pick another." };
  }

  const changed = (Object.keys(built.patch) as InfoProp[]).filter((k) => !same(k, p[k], built.patch[k]!));
  let aliasCompany: { id: string; aliases: string[] } | null = null;
  const typed = built.patch.company ?? "";
  if (input.aliasCompanyId && typed) {
    if (!input.mayEditCompanies) return { error: "Only Admins and the Business Manager can add other names to a company." };
    aliasCompany = await prisma.clientCompany.findUnique({ where: { id: input.aliasCompanyId }, select: { id: true, aliases: true } });
    if (!aliasCompany) return { error: "That company no longer exists." };
  }
  if (!changed.length && !aliasCompany) return { changed: [] };

  // The log table must exist before HubSpot changes, or the change would go unrecorded.
  await prisma.dealInfoChange.findFirst({ select: { id: true } });
  if (changed.length) {
    const properties = Object.fromEntries(changed.map((k) => [k, built.patch[k]!]));
    const upd = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(input.dealId)}`, { method: "PATCH", body: JSON.stringify({ properties }) });
    if (!upd.ok) {
      const msg = ((await upd.json().catch(() => null)) as { message?: string } | null)?.message;
      return { error: `HubSpot didn't save it${msg ? `: ${msg}` : ` (${upd.status})`}.` };
    }
    await prisma.dealInfoChange.createMany({
      data: changed.map((k) => ({
        hubspotDealId: input.dealId,
        pipeline: input.pipeline,
        dealName: p.dealname ?? "(no name)",
        property: k,
        fromValue: (p[k] ?? "").trim(),
        toValue: built.patch[k]!,
        byEmail: input.byEmail,
      })),
    });
  }
  if (aliasCompany && !aliasCompany.aliases.some((a) => normalizeCompanyName(a) === normalizeCompanyName(typed))) {
    await prisma.clientCompany.update({ where: { id: aliasCompany.id }, data: { aliases: [...aliasCompany.aliases, typed] } });
  }
  return { changed };
}

/** Edits made after the cached HubSpot read, oldest first, so the board can show them before the next refresh. */
export async function infoChangesSince(pipeline: PipelineKey, since: string) {
  return prisma.dealInfoChange.findMany({
    where: { pipeline, createdAt: { gt: new Date(since) } },
    orderBy: { createdAt: "asc" },
    select: { hubspotDealId: true, property: true, toValue: true, createdAt: true },
  });
}
