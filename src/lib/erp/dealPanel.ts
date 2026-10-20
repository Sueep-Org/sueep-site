/**
 * The pipeline board's deal side panel (PIPELINE_PLAN Phase 6), loaded when
 * the panel opens: HubSpot activity, line items, the GC's record with us, and
 * the ERP's own history for the deal. Read-only.
 *
 * - Activity: emails, calls, notes, tasks and meetings on the deal, newest
 *   first. Emails show subject, who and date only (never the body, user
 *   decision 2026-10-19); the full email is in HubSpot. Notes show their text.
 * - GC record: every deal (both outcomes and open) matched to the same GC.
 * - ERP history: lost reasons, Mark lost, info edits and next steps.
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { centsToDollars } from "./money";
import { companyMatcher, gcPrices, type GcPrice } from "./winLoss";
import { loadDealBundle, loadJanitorialDealBundle, outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";
import { loadLostReasonOptions } from "./dealLostReasons";

const MAX_ACTIVITY = 40;
const MAX_HISTORY = 40;

export type ActivityKind = "email" | "call" | "note" | "task" | "meeting";
export type ActivityItem = { id: string; kind: ActivityKind; at: string; title: string; detail: string | null };
export type LineItem = { id: string; name: string; quantity: number | null; priceCents: number | null; amountCents: number | null };
export type GcRecord = {
  label: string;
  companyId: string | null;
  bids: number;
  won: number;
  lost: number;
  open: number;
  gcNotAwarded: number;
  winRate: number | null;
  /** Their price per sq ft for this deal's type of work, when they have enough priced bids (post-con only) */
  price: GcPrice | null;
};
export type HistoryItem = { at: string; by: string; text: string };

export type DealPanelData = {
  activity: ActivityItem[];
  /** True when there was more than we show */
  activityMore: boolean;
  /** Emails on the deal HubSpot wouldn't let us read (the ERP app lacks sales-email-read) */
  hiddenEmails: number;
  lineItems: LineItem[];
  gc: GcRecord | null;
  history: HistoryItem[];
};

const OBJECTS: { kind: ActivityKind; type: string; props: string[] }[] = [
  { kind: "email", type: "emails", props: ["hs_email_subject", "hs_email_direction", "hs_email_from_email", "hs_email_to_email", "hs_timestamp"] },
  { kind: "call", type: "calls", props: ["hs_call_title", "hs_call_direction", "hs_call_duration", "hs_timestamp"] },
  { kind: "note", type: "notes", props: ["hs_note_body", "hs_timestamp"] },
  { kind: "task", type: "tasks", props: ["hs_task_subject", "hs_task_status", "hs_timestamp"] },
  { kind: "meeting", type: "meetings", props: ["hs_meeting_title", "hs_meeting_start_time", "hs_timestamp"] },
];

/** Ids of objects of one type linked to the deal (first page of 100 is plenty for a panel). */
async function associated(dealId: string, type: string): Promise<string[]> {
  const res = await hubspotFetch(`/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/${type}?limit=100`);
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: { toObjectId: number | string }[] };
  return (data.results ?? []).map((r) => String(r.toObjectId));
}

/** `denied` when HubSpot refuses the object type for missing permissions (emails need sales-email-read). */
async function batchRead(
  type: string,
  ids: string[],
  props: string[],
): Promise<{ rows: { id: string; properties: Record<string, string | null> }[]; denied: boolean }> {
  const rows: { id: string; properties: Record<string, string | null> }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hubspotFetch(`/crm/v3/objects/${type}/batch/read`, {
      method: "POST",
      body: JSON.stringify({ properties: props, inputs: ids.slice(i, i + 100).map((id) => ({ id })) }),
    });
    if (res.status === 403) return { rows: [], denied: true };
    if (!res.ok) continue;
    rows.push(...(((await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[] }).results ?? []));
  }
  return { rows, denied: false };
}

/** Note bodies are HTML; the panel shows plain text, shortened. */
function plainText(html: string | null | undefined, max = 400): string | null {
  const t = (html ?? "")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return t ? (t.length > max ? `${t.slice(0, max)}…` : t) : null;
}

function toItem(kind: ActivityKind, o: { id: string; properties: Record<string, string | null> }): ActivityItem {
  const p = o.properties;
  const at = p.hs_timestamp ?? p.hs_meeting_start_time ?? "";
  if (kind === "email") {
    const incoming = p.hs_email_direction === "INCOMING_EMAIL";
    const who = incoming ? p.hs_email_from_email : p.hs_email_to_email;
    return {
      id: o.id,
      kind,
      at,
      title: p.hs_email_subject?.trim() || "(no subject)",
      detail: [incoming ? "Received" : "Sent", who ? `${incoming ? "from" : "to"} ${who}` : null].filter(Boolean).join(" "),
    };
  }
  if (kind === "call") {
    const mins = Math.round(Number(p.hs_call_duration ?? 0) / 60000);
    return {
      id: o.id,
      kind,
      at,
      title: p.hs_call_title?.trim() || "Call",
      detail: [p.hs_call_direction === "INBOUND" ? "Inbound" : "Outbound", mins ? `${mins} min` : null].filter(Boolean).join(", "),
    };
  }
  if (kind === "note") return { id: o.id, kind, at, title: "Note", detail: plainText(p.hs_note_body) };
  if (kind === "task") return { id: o.id, kind, at, title: p.hs_task_subject?.trim() || "Task", detail: p.hs_task_status === "COMPLETED" ? "Done" : "Open" };
  return { id: o.id, kind, at, title: p.hs_meeting_title?.trim() || "Meeting", detail: null };
}

async function loadActivity(dealId: string): Promise<{ items: ActivityItem[]; more: boolean; hiddenEmails: number }> {
  let hiddenEmails = 0;
  const lists = await Promise.all(
    OBJECTS.map(async (o) => {
      const ids = await associated(dealId, o.type);
      if (!ids.length) return [];
      const { rows, denied } = await batchRead(o.type, ids, o.props);
      if (denied && o.kind === "email") hiddenEmails = ids.length;
      return rows.map((x) => toItem(o.kind, x));
    }),
  );
  const all = lists.flat().sort((a, b) => b.at.localeCompare(a.at));
  return { items: all.slice(0, MAX_ACTIVITY), more: all.length > MAX_ACTIVITY, hiddenEmails };
}

async function loadLineItems(dealId: string): Promise<LineItem[]> {
  const ids = await associated(dealId, "line_items");
  if (!ids.length) return [];
  const cents = (v: string | null | undefined) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100));
  return (await batchRead("line_items", ids, ["name", "quantity", "price", "amount"])).rows.map((li) => ({
    id: li.id,
    name: li.properties.name?.trim() || "(no name)",
    quantity: li.properties.quantity != null && li.properties.quantity !== "" ? Number(li.properties.quantity) : null,
    priceCents: cents(li.properties.price),
    amountCents: cents(li.properties.amount),
  }));
}

const PROP_LABELS: Record<string, string> = {
  hubspot_owner_id: "Owner",
  company: "GC",
  bid_date: "Bid Date",
  completion_date: "Job Walk Date",
  amount: "Amount",
  area_sqft: "Area SQFT",
  dealstage: "Stage",
};

/** `preloaded` skips the cache, for checks run outside the app. */
export async function loadDealPanel(dealId: string, pipeline: PipelineKey, preloaded?: Bundle): Promise<DealPanelData> {
  const [bundle, companies, activity, lineItems, lost, info, steps, reasonOptions] = await Promise.all([
    preloaded ?? (pipeline === "janitorial" ? loadJanitorialDealBundle() : loadDealBundle()),
    prisma.clientCompany.findMany({ select: { id: true, name: true, aliases: true } }),
    loadActivity(dealId),
    loadLineItems(dealId),
    prisma.dealLostChange.findMany({ where: { hubspotDealId: dealId }, orderBy: { createdAt: "desc" }, take: MAX_HISTORY }),
    prisma.dealInfoChange.findMany({ where: { hubspotDealId: dealId }, orderBy: { createdAt: "desc" }, take: MAX_HISTORY }),
    prisma.dealFollowUp.findMany({ where: { hubspotDealId: dealId }, orderBy: { createdAt: "desc" }, take: MAX_HISTORY }),
    loadLostReasonOptions().catch(() => []),
  ]);

  // GC record across every deal in this pipeline matched to the same GC.
  const match = companyMatcher(companies);
  const deal = bundle.deals.find((d) => d.id === dealId);
  const key = deal ? match(deal) : null;
  let gc: GcRecord | null = null;
  if (key) {
    const price =
      pipeline === "post-con" && key.companyId && deal
        ? (gcPrices(bundle, match)
            .byCompany.get(key.companyId)
            ?.find((p) => p.scope === deal.scope) ?? null)
        : null;
    const r = { label: key.label, companyId: key.companyId, bids: 0, won: 0, lost: 0, open: 0, gcNotAwarded: 0, winRate: null as number | null, price };
    for (const d of bundle.deals) {
      if (match(d)?.key !== key.key) continue;
      const o = outcomeOf(bundle, d.stageId);
      r.bids++;
      r[o]++;
      if (o === "lost" && /gc not awarded/i.test(d.lostReason ?? "")) r.gcNotAwarded++;
    }
    r.winRate = r.won + r.lost ? r.won / (r.won + r.lost) : null;
    gc = r;
  }

  const reasonLabel = new Map(reasonOptions.map((o) => [o.value, o.label]));
  const stage = (id: string) => (bundle.stageLabels[id] ?? id).trim();
  const show = (prop: string, v: string) => {
    if (!v) return "blank";
    if (prop === "hubspot_owner_id") return bundle.owners[v] ?? v;
    if (prop === "amount") return centsToDollars(Math.round(Number(v) * 100));
    if (prop === "bid_date" || prop === "completion_date") return v.slice(0, 10);
    if (prop === "dealstage") return stage(v);
    return v;
  };
  const history: HistoryItem[] = [
    ...lost.map((c) => ({
      at: c.createdAt.toISOString(),
      by: c.byEmail,
      text:
        c.action === "MARK_LOST"
          ? `Marked lost (${stage(c.fromStageId)} to ${stage(c.toStageId)}): ${c.reasons.map((r) => reasonLabel.get(r) ?? r).join(", ")}`
          : `Lost reason set to ${c.reasons.map((r) => reasonLabel.get(r) ?? r).join(", ")}`,
    })),
    ...info.map((c) => ({
      at: c.createdAt.toISOString(),
      by: c.byEmail,
      text: `${PROP_LABELS[c.property] ?? c.property}: ${show(c.property, c.fromValue)} to ${show(c.property, c.toValue)}`,
    })),
    ...steps.flatMap((s) => [
      { at: s.createdAt.toISOString(), by: s.createdByEmail, text: `Next step added: ${s.text} (due ${s.dueDate})` },
      ...(s.doneAt ? [{ at: s.doneAt.toISOString(), by: s.doneByEmail ?? "", text: `Next step done: ${s.text}` }] : []),
    ]),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MAX_HISTORY);

  return { activity: activity.items, activityMore: activity.more, hiddenEmails: activity.hiddenEmails, lineItems, gc, history };
}
