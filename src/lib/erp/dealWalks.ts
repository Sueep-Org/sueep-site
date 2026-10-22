/**
 * Job walks as HubSpot meetings (HUBSPOT_DEALS_PLAN Phase 5).
 *
 * - Book: the deal panel logs a HubSpot meeting on the deal and sets Job Walk
 *   Date (HubSpot's completion_date) through saveDealInfo, so it's checked
 *   and logged like Edit info. Meetings made through the API don't go on
 *   anyone's Outlook or Google calendar; people still add it there.
 * - Fill: walk meetings already on open deals (title has walk, walkthrough or
 *   walk-through, most come from calendars synced to HubSpot) fill an empty
 *   Job Walk Date: the next upcoming walk, else the latest past one. A date
 *   the ERP filled follows the meeting when it's moved; a date anyone typed
 *   or cleared by hand is never touched again.
 * The management calendar's Bids category shows Job Walk Date already.
 */
import { prisma } from "@/lib/prisma";
import { hubspotFetch } from "@/lib/hubspot/client";
import { todayEasternKey } from "./dates";
import { saveDealInfo } from "./dealInfo";
import { readDealForChange } from "./dealGuard";
import { loadDealsFor } from "./dealEdits";
import { outcomeOf, type Bundle, type PipelineKey } from "./postConDeals";

/** byEmail on DealInfoChange rows the fill writes, so it can tell its own dates from hand edits. */
export const WALK_FILL_BY = "Job walk meeting (auto)";
const WALK_TITLE = /\bwalk(?:[\s-]?(?:through|thru))?\b|\bwalkthrough\b/i;
const MEETING_TO_DEAL = 212;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "2026-10-23" + "09:30" in Eastern time, as a UTC timestamp. */
export function easternToUtc(day: string, time: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  const shown = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "America/New_York" }));
  const asUtc = Date.UTC(shown.getFullYear(), shown.getMonth(), shown.getDate(), shown.getHours(), shown.getMinutes());
  return guess + (guess - asUtc);
}

function easternDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export type BookWalkInput = {
  dealId: string;
  pipeline: PipelineKey;
  day: string;
  time: string;
  minutes: number;
  title: string;
  /** HubSpot owner the meeting belongs to: the viewer when they're an owner, else the deal's owner */
  ownerId: string | null;
  byEmail: string;
};

export async function bookJobWalk(input: BookWalkInput): Promise<{ error: string } | { meetingId: string }> {
  if (!DAY_KEY.test(input.day) || Number.isNaN(Date.parse(`${input.day}T00:00:00Z`))) return { error: "Pick a date." };
  if (!TIME.test(input.time)) return { error: "Pick a time." };
  if (!Number.isInteger(input.minutes) || input.minutes < 15 || input.minutes > 480) return { error: "Check how long the walk takes." };
  const deal = await readDealForChange(input.dealId, input.pipeline, ["hubspot_owner_id"]);
  if ("error" in deal) return deal;
  if (deal.outcome !== "open") return { error: "This deal is closed in HubSpot." };

  const start = easternToUtc(input.day, input.time);
  const owner = input.ownerId ?? deal.props.hubspot_owner_id ?? null;
  const res = await hubspotFetch("/crm/v3/objects/meetings", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_timestamp: new Date(start).toISOString(),
        hs_meeting_start_time: new Date(start).toISOString(),
        hs_meeting_end_time: new Date(start + input.minutes * 60_000).toISOString(),
        hs_meeting_title: input.title.trim().slice(0, 200) || `Job walk: ${deal.props.dealname ?? ""}`.trim(),
        hs_meeting_outcome: "SCHEDULED",
        hs_meeting_body: `Booked from the ERP by ${input.byEmail}.`,
        ...(owner ? { hubspot_owner_id: owner } : {}),
      },
      associations: [{ to: { id: input.dealId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: MEETING_TO_DEAL }] }],
    }),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { message?: string } | null)?.message;
    return { error: `HubSpot didn't book the walk${msg ? `: ${msg}` : ` (${res.status})`}.` };
  }
  const meetingId = String(((await res.json()) as { id: string }).id);
  const saved = await saveDealInfo({ dealId: input.dealId, pipeline: input.pipeline, changes: { walkDate: input.day }, aliasCompanyId: null, mayEditCompanies: false, byEmail: input.byEmail });
  if ("error" in saved) return { error: `The meeting is booked in HubSpot, but Job Walk Date didn't save: ${saved.error}` };
  return { meetingId };
}

type WalkMeeting = { id: string; title: string; start: number };

/** Every walk meeting in HubSpot with the deals it's on. A few dozen today. */
async function walkMeetingsByDeal(): Promise<Map<string, WalkMeeting[]>> {
  const meetings: WalkMeeting[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await hubspotFetch("/crm/v3/objects/meetings/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: ["walk*", "walkthrough*", "walk-through*"].map((v) => ({ filters: [{ propertyName: "hs_meeting_title", operator: "CONTAINS_TOKEN", value: v }] })),
        properties: ["hs_meeting_title", "hs_meeting_start_time", "hs_meeting_outcome"],
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HubSpot meeting search failed: ${res.status}`);
    const data = (await res.json()) as { results?: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };
    for (const m of data.results ?? []) {
      const p = m.properties;
      const start = Date.parse(p.hs_meeting_start_time ?? "");
      if (!Number.isFinite(start) || !WALK_TITLE.test(p.hs_meeting_title ?? "")) continue;
      if (p.hs_meeting_outcome === "CANCELED" || p.hs_meeting_outcome === "CANCELLED") continue;
      meetings.push({ id: m.id, title: p.hs_meeting_title ?? "", start });
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  const byDeal = new Map<string, WalkMeeting[]>();
  for (let i = 0; i < meetings.length; i += 100) {
    const batch = meetings.slice(i, i + 100);
    const res = await hubspotFetch("/crm/v4/associations/meetings/deals/batch/read", {
      method: "POST",
      body: JSON.stringify({ inputs: batch.map((m) => ({ id: m.id })) }),
    });
    if (!res.ok) throw new Error(`HubSpot meeting links failed: ${res.status}`);
    const data = (await res.json()) as { results?: { from: { id: string }; to: { toObjectId: number | string }[] }[] };
    const meetingOf = new Map(batch.map((m) => [m.id, m]));
    for (const r of data.results ?? []) {
      const m = meetingOf.get(String(r.from.id));
      if (!m) continue;
      for (const t of r.to) byDeal.set(String(t.toObjectId), [...(byDeal.get(String(t.toObjectId)) ?? []), m]);
    }
  }
  return byDeal;
}

/** The next upcoming walk, else the latest past one, as an Eastern day. */
function pickWalkDay(meetings: WalkMeeting[], today: string): string {
  const days = meetings.map((m) => easternDay(m.start)).sort();
  return days.find((d) => d >= today) ?? days[days.length - 1]!;
}

export type WalkFill = { dealId: string; pipeline: PipelineKey; dealName: string; from: string; to: string; meeting: string; result: "filled" | "would fill" | "error"; error?: string };

/** Fills Job Walk Date from walk meetings. `apply: false` only lists what it would do. `preloaded` skips the cache, for checks run outside the app. */
export async function fillWalkDatesFromMeetings({
  apply,
  now = new Date(),
  preloaded,
}: {
  apply: boolean;
  now?: Date;
  preloaded?: { postCon: Bundle; janitorial: Bundle };
}): Promise<WalkFill[]> {
  const today = todayEasternKey(now);
  const [byDeal, postCon, janitorial] = await Promise.all([
    walkMeetingsByDeal(),
    preloaded?.postCon ?? loadDealsFor("post-con"),
    preloaded?.janitorial ?? loadDealsFor("janitorial"),
  ]);
  const out: WalkFill[] = [];
  for (const [pipeline, bundle] of [["post-con", postCon], ["janitorial", janitorial]] as const) {
    const open = bundle.deals.filter((d) => byDeal.has(d.id) && outcomeOf(bundle, d.stageId) === "open");
    if (!open.length) continue;
    const history = await prisma.dealInfoChange.findMany({
      where: { hubspotDealId: { in: open.map((d) => d.id) }, property: "completion_date" },
      orderBy: { createdAt: "desc" },
      select: { hubspotDealId: true, toValue: true, byEmail: true },
    });
    const last = new Map<string, (typeof history)[number]>();
    for (const h of history) if (!last.has(h.hubspotDealId)) last.set(h.hubspotDealId, h);
    for (const d of open) {
      const meetings = byDeal.get(d.id)!;
      const to = pickWalkDay(meetings, today);
      const prev = last.get(d.id);
      const ours = prev?.byEmail === WALK_FILL_BY;
      // Never over a hand edit; an empty date only when nobody has touched it; our own date follows the meeting.
      if (prev && !ours) continue;
      if (!prev && d.walkDate) continue;
      if (ours && (d.walkDate ?? "") !== prev.toValue) continue;
      if ((d.walkDate ?? "") === to) continue;
      const meeting = meetings.find((m) => easternDay(m.start) === to)?.title ?? "";
      const row: WalkFill = { dealId: d.id, pipeline, dealName: d.name, from: d.walkDate ?? "", to, meeting, result: apply ? "filled" : "would fill" };
      if (apply) {
        // Re-read so a date typed in HubSpot since the cached read wins.
        const fresh = await readDealForChange(d.id, pipeline, ["completion_date"]);
        if ("error" in fresh) {
          out.push({ ...row, result: "error", error: fresh.error });
          continue;
        }
        if ((fresh.props.completion_date ?? "").slice(0, 10) !== (d.walkDate ?? "")) continue;
        const saved = await saveDealInfo({ dealId: d.id, pipeline, changes: { walkDate: to }, aliasCompanyId: null, mayEditCompanies: false, byEmail: WALK_FILL_BY });
        if ("error" in saved) {
          out.push({ ...row, result: "error", error: saved.error });
          continue;
        }
      }
      out.push(row);
    }
  }
  return out;
}
