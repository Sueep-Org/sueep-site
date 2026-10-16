import { unstable_cache } from "next/cache";
import { hubspotFetch } from "@/lib/hubspot/client";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import type { CardRow, DashboardCardData } from "@/app/erp/(shell)/_dashboard/DashboardCard";
import { centsToDollarsCompact } from "./money";

/**
 * Estimation Wins tab (DASHBOARDS_PLAN.md Phase 8): win rate and quote
 * turnaround, read live from HubSpot (the ERP deletes lost deals on sync,
 * so it can't answer this itself). Cached for an hour.
 *
 * Deals are grouped by when they were created, so a period's numbers are
 * "of the deals that came in, how many we won, lost, or still have open".
 * Won = reached the first won stage or anything after it (post-con: Quote
 * Approved; janitorial: Active Turnovers, per the business). Lost = a
 * "Deal Lost" / "Not Awarded" stage. Stage order and names come from
 * HubSpot's own pipeline settings, so renamed or reordered stages still work.
 */

const CACHE_SECONDS = 3600;
const DAY_MS = 86_400_000;
const PERIODS = [
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "12m", label: "Last 12 months", days: 365 },
] as const;
const LOST_LABEL = /deal lost|not awarded/i;
/** HubSpot's built-in id for the default pipeline's "Quote Sent" stage. */
const DEFAULT_QUOTE_SENT_STAGE = "presentationscheduled";

export type PipelineRules = {
  key: "post-con" | "janitorial";
  label: string;
  pipelineId: string;
  /** Stage ids that count as won / lost. */
  won: Set<string>;
  lost: Set<string>;
  /** The "quote sent" stage for turnaround, when known. */
  quoteStageId: string | null;
};

type DealStats = { won: number; lost: number; open: number; wonCents: number; lostCents: number; turnaroundDays: number[] };

export type WinsSummary = {
  pipelines: { key: string; label: string; hasQuoteStage: boolean; periods: Record<string, DealStats> }[];
  fetchedAt: string;
};

type HubSpotStage = { id: string; label: string; displayOrder: number };

/** Won/lost stage sets per pipeline, from HubSpot's own stage order. Also used by the Win/loss page. */
export async function loadRules(): Promise<PipelineRules[]> {
  const cfg = parseHubSpotPipelineStageMap();
  if (!cfg) throw new Error("HUBSPOT_PIPELINE_STAGE_MAP is not set");
  const res = await hubspotFetch("/crm/v3/pipelines/deals");
  if (!res.ok) throw new Error(`HubSpot pipelines failed: ${res.status}`);
  const data = (await res.json()) as { results?: { id: string; stages?: HubSpotStage[] }[] };
  const stagesOf = (pipelineId: string) => (data.results ?? []).find((p) => p.id === pipelineId)?.stages ?? [];

  const build = (key: PipelineRules["key"], label: string, pipelineId: string, firstWonStageId: string | undefined, quoteStageId: string | null): PipelineRules => {
    const stages = stagesOf(pipelineId);
    const lost = new Set(stages.filter((s) => LOST_LABEL.test(s.label)).map((s) => s.id));
    const firstWon = stages.find((s) => s.id === firstWonStageId);
    const won = new Set(firstWon ? stages.filter((s) => s.displayOrder >= firstWon.displayOrder && !lost.has(s.id)).map((s) => s.id) : []);
    return { key, label, pipelineId, won, lost, quoteStageId: quoteStageId && stages.some((s) => s.id === quoteStageId) ? quoteStageId : null };
  };

  const pc = cfg.postConstruction;
  const jan = cfg.janitorial;
  const pcQuote = pc.stages.quoteSent?.trim() || (pc.pipelineId === "default" ? DEFAULT_QUOTE_SENT_STAGE : null);
  return [
    build("post-con", "Post-construction", pc.pipelineId, pc.stages.quoteApproved, pcQuote),
    build("janitorial", "Janitorial", jan.pipelineId, jan.stages.activeTurnovers || jan.stages.quoteApproved, jan.stages.proposal?.trim() || null),
  ];
}

type Deal = { properties: Record<string, string | null> };

/** Every deal in a pipeline created since `since`, a page at a time. */
async function searchDeals(pipelineId: string, since: Date, quoteStageId: string | null): Promise<Deal[]> {
  const properties = ["dealstage", "amount", "createdate"];
  if (quoteStageId) properties.push(`hs_v2_date_entered_${quoteStageId}`, `hs_date_entered_${quoteStageId}`);
  const deals: Deal[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await hubspotFetch("/crm/v3/objects/deals/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{ filters: [
          { propertyName: "pipeline", operator: "EQ", value: pipelineId },
          { propertyName: "createdate", operator: "GTE", value: String(since.getTime()) },
        ] }],
        properties,
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HubSpot deal search failed: ${res.status}`);
    const data = (await res.json()) as { results?: Deal[]; paging?: { next?: { after?: string } } };
    deals.push(...(data.results ?? []));
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return deals;
}

function emptyStats(): DealStats {
  return { won: 0, lost: 0, open: 0, wonCents: 0, lostCents: 0, turnaroundDays: [] };
}

async function computeWins(): Promise<WinsSummary> {
  const rules = await loadRules();
  const now = Date.now();
  const longest = Math.max(...PERIODS.map((p) => p.days));
  const pipelines: WinsSummary["pipelines"] = [];
  for (const r of rules) {
    const deals = await searchDeals(r.pipelineId, new Date(now - longest * DAY_MS), r.quoteStageId);
    const periods: Record<string, DealStats> = {};
    for (const period of PERIODS) {
      const cutoff = now - period.days * DAY_MS;
      const stats = emptyStats();
      for (const d of deals) {
        const created = Date.parse(d.properties.createdate ?? "");
        if (!Number.isFinite(created) || created < cutoff) continue;
        const stage = d.properties.dealstage ?? "";
        const cents = Math.round(Number(d.properties.amount ?? 0) * 100) || 0;
        if (r.won.has(stage)) {
          stats.won++;
          stats.wonCents += cents;
        } else if (r.lost.has(stage)) {
          stats.lost++;
          stats.lostCents += cents;
        } else {
          stats.open++;
        }
        if (r.quoteStageId) {
          const entered = Date.parse(d.properties[`hs_v2_date_entered_${r.quoteStageId}`] ?? d.properties[`hs_date_entered_${r.quoteStageId}`] ?? "");
          if (Number.isFinite(entered) && entered >= created) stats.turnaroundDays.push((entered - created) / DAY_MS);
        }
      }
      periods[period.key] = stats;
    }
    pipelines.push({ key: r.key, label: r.label, hasQuoteStage: !!r.quoteStageId, periods });
  }
  return { pipelines, fetchedAt: new Date(now).toISOString() };
}

/** Cached an hour. A HubSpot error isn't cached, so the next visit tries again. */
const cachedWins = unstable_cache(computeWins, ["dashboard-wins-v1"], { revalidate: CACHE_SECONDS });

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quoteStageName(key: string): string {
  return key === "post-con" ? "Quote Sent" : "Proposal";
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "No decisions yet";
}

export async function loadWins(): Promise<DashboardCardData> {
  let summary: WinsSummary;
  try {
    summary = await cachedWins();
  } catch (err) {
    console.error("Wins card: HubSpot unavailable", err);
    return { sections: [{ key: "error", label: "", rows: [], empty: "HubSpot isn't answering right now, so win rate can't load. The rest of the dashboard isn't affected. Try again in a few minutes." }] };
  }

  const updated = new Date(summary.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const sections = PERIODS.map((period) => {
    const rows: CardRow[] = summary.pipelines.flatMap((p) => {
      const s = p.periods[period.key];
      const decided = s.won + s.lost;
      const days = median(s.turnaroundDays);
      return [
        {
          id: `${p.key}-rate`,
          href: "/erp/projects",
          title: `${p.label} win rate`,
          note: `${s.won} won, ${s.lost} lost, ${s.open} still open${s.wonCents + s.lostCents > 0 ? ` · ${centsToDollarsCompact(s.wonCents)} won of ${centsToDollarsCompact(s.wonCents + s.lostCents)} decided` : ""}`,
          value: pct(s.won, decided),
          secondary: decided && s.wonCents + s.lostCents > 0 ? `${pct(s.wonCents, s.wonCents + s.lostCents)} by $` : undefined,
          group: p.label,
        },
        {
          id: `${p.key}-turnaround`,
          href: "/erp/projects",
          title: "Time to send a quote",
          note: !p.hasQuoteStage
            ? "Needs the quote stage set in HUBSPOT_PIPELINE_STAGE_MAP"
            : days == null
              ? "No deal reached that stage yet"
              : days < 1
                ? `Most of ${s.turnaroundDays.length} deals reached ${quoteStageName(p.key)} the day they were created, so they're likely entered in HubSpot when the quote goes out`
                : `Median from deal created to ${quoteStageName(p.key)}, ${s.turnaroundDays.length} deals`,
          value: days == null ? "-" : days < 1 ? "Same day" : `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`,
          group: p.label,
        },
      ];
    });
    return { key: period.key, label: period.label, rows, empty: "No deals in HubSpot for this period.", footer: `From HubSpot, updated ${updated}` };
  });
  return { sections };
}
