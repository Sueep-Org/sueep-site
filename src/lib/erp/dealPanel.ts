/**
 * The pipeline board's deal side panel (PIPELINE_PLAN Phase 6), loaded when
 * the panel opens: HubSpot activity, line items, the GC's record with us, and
 * the ERP's own history for the deal. Read-only.
 *
 * - Activity: emails, calls, notes, tasks and meetings on the deal, newest
 *   first. Emails show subject, who, date and HubSpot's short body preview
 *   (user decision 2026-10-22); the full email is in HubSpot. Notes show their text.
 * - GC record: every deal (both outcomes and open) matched to the same GC.
 * - ERP history: lost reasons, Mark lost, info edits and next steps.
 * - Stage history: HubSpot's date entered and exited for each stage
 *   (hs_v2_date_entered_ / hs_v2_date_exited_). A stage entered twice shows
 *   its latest visit, which is what HubSpot keeps.
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { centsToDollars } from "./money";
import { companyMatcher, gcPrices, type GcPrice } from "./winLoss";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";
import { loadDeals, loadJanitorialDeals } from "./dealEdits";
import { loadLostReasonOptions } from "./dealLostReasons";
import { IMPORT_DAY } from "./pipelineBoard";

const MAX_ACTIVITY = 40;
const MAX_HISTORY = 40;

export type ActivityKind = "email" | "call" | "note" | "task" | "meeting";
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string | null;
  /** Emails only: the start of the body */
  preview?: string | null;
};
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
export type StageStep = {
  stageId: string;
  label: string;
  enteredAt: string;
  /** Null for the stage it's in now */
  exitedAt: string | null;
  days: number;
  /** Entered on the 2024-12-26 bulk import, so the real date is earlier */
  imported: boolean;
};

export type DealPanelData = {
  activity: ActivityItem[];
  /** True when there was more than we show */
  activityMore: boolean;
  /** Emails on the deal HubSpot wouldn't let us read (if the ERP app loses sales-email-read) */
  hiddenEmails: number;
  lineItems: LineItem[];
  gc: GcRecord | null;
  history: HistoryItem[];
  stages: StageStep[];
};

/** The deal's stages in the order it entered them. Empty if HubSpot can't be read. */
async function loadStageHistory(dealId: string, stageIds: string[], labels: Record<string, string>, currentStageId: string | null): Promise<StageStep[]> {
  if (!stageIds.length) return [];
  const props = stageIds.flatMap((id) => [`hs_v2_date_entered_${id}`, `hs_v2_date_exited_${id}`]);
  const res = await hubspotFetch(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${props.join(",")}`).catch(() => null);
  if (!res?.ok) return [];
  const p = ((await res.json()) as { properties?: Record<string, string | null> }).properties ?? {};
  const now = Date.now();
  return stageIds
    .map((id) => ({ id, entered: p[`hs_v2_date_entered_${id}`], exited: p[`hs_v2_date_exited_${id}`] }))
    .filter((s): s is { id: string; entered: string; exited: string | null } => !!s.entered)
    .sort((a, b) => a.entered.localeCompare(b.entered))
    .map((s) => {
      // Only the stage it's in now has no exit; an older stage missing one ended when the next began.
      const exitedAt = s.id === currentStageId ? null : (s.exited ?? null);
      return {
        stageId: s.id,
        label: (labels[s.id] ?? s.id).trim(),
        enteredAt: s.entered,
        exitedAt,
        days: Math.max(0, Math.round(((exitedAt ? Date.parse(exitedAt) : now) - Date.parse(s.entered)) / 86_400_000)),
        imported: s.entered.startsWith(IMPORT_DAY),
      };
    });
}

const OBJECTS: { kind: ActivityKind; type: string; props: string[] }[] = [
  { kind: "email", type: "emails", props: ["hs_email_subject", "hs_email_direction", "hs_email_from_email", "hs_email_to_email", "hs_body_preview", "hs_timestamp"] },
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

/** Note bodies are HTML (email previews can carry entities too); the panel shows plain text, shortened. */
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
      preview: plainText(p.hs_body_preview, 200),
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
  award_date: "Award Date",
  amount: "Amount",
  area_sqft: "Area SQFT",
  dealstage: "Stage",
  hs_priority: "Priority",
};

/** `preloaded` skips the cache, for checks run outside the app. */
export async function loadDealPanel(dealId: string, pipeline: PipelineKey, preloaded?: Bundle): Promise<DealPanelData> {
  const [bundle, companies, activity, lineItems, lost, info, steps, reasonOptions] = await Promise.all([
    preloaded ?? (pipeline === "janitorial" ? loadJanitorialDeals() : loadDeals()),
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
    if (prop === "bid_date" || prop === "completion_date" || prop === "award_date") return v.slice(0, 10);
    if (prop === "dealstage") return stage(v);
    if (prop === "hs_priority") return v[0].toUpperCase() + v.slice(1);
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

  const stages = await loadStageHistory(dealId, bundle.stageOrder, bundle.stageLabels, deal?.stageId ?? null);

  return { activity: activity.items, activityMore: activity.more, hiddenEmails: activity.hiddenEmails, lineItems, gc, history, stages };
}
