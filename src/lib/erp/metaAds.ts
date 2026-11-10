/**
 * Meta (Facebook/Instagram) ad spend, read from the Marketing API Insights endpoint.
 *
 * Auth: a System User token from Business Settings (business.facebook.com/settings
 * -> Users -> System users -> erp-bot). It belongs to the business, not a person,
 * and never expires. See sueep-plans/META_ADS.md for how to regenerate it.
 *
 * Env: META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID ("act_" + the ad account number).
 * Server only: never import this from a client component (it reads the token).
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export const META_PERIODS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "last_90d", label: "Last 90 days" },
  { key: "this_year", label: "This year" },
  { key: "maximum", label: "All time" },
] as const;
export type MetaPeriod = (typeof META_PERIODS)[number]["key"];

export function parseMetaPeriod(v: string | undefined): MetaPeriod {
  return (META_PERIODS.find((p) => p.key === v)?.key ?? "last_30d") as MetaPeriod;
}

/** What a campaign is for, guessed from its name. */
export type CampaignKind = "HIRING" | "FRANCHISE" | "OTHER";

export function campaignKind(name: string): CampaignKind {
  if (/franchis/i.test(name)) return "FRANCHISE";
  if (/hir|recruit|personal|pintura|limpieza|cleaners|painters/i.test(name)) return "HIRING";
  return "OTHER";
}

type RawAction = { action_type: string; value: string };
type RawRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: RawAction[];
  date_start: string;
  date_stop: string;
};

export type MetaRow = {
  spendCents: number;
  impressions: number;
  clicks: number;
  /** Leads as Meta counts them (form fills on Meta plus website leads from the Pixel). */
  leads: number;
};

export type MetaCampaign = MetaRow & { id: string; name: string; kind: CampaignKind };

export const CAMPAIGN_KINDS: readonly CampaignKind[] = ["HIRING", "FRANCHISE", "OTHER"];

/** One calendar month, split by what the campaigns were for. */
export type MetaMonthRow = MetaRow & { month: string; byKind: Record<CampaignKind, MetaRow> };

const ZERO: MetaRow = { spendCents: 0, impressions: 0, clicks: 0, leads: 0 };

function addRow(a: MetaRow, b: MetaRow): MetaRow {
  return { spendCents: a.spendCents + b.spendCents, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, leads: a.leads + b.leads };
}

export type MetaAdsReport =
  | { ok: false; reason: "NOT_CONFIGURED" | "ERROR"; message: string }
  | {
      ok: true;
      /** Date range Meta used, in the ad account's time zone (YYYY-MM-DD). */
      since: string | null;
      until: string | null;
      total: MetaRow;
      /** The same number of days just before, for the change arrows (null for All time). */
      previous: MetaRow | null;
      campaigns: MetaCampaign[];
      /** The last 12 calendar months, oldest first, months with no spend included. */
      months: MetaMonthRow[];
    };

function toRow(r: RawRow): MetaRow {
  const lead = r.actions?.find((a) => a.action_type === "lead");
  return {
    spendCents: Math.round(Number(r.spend ?? 0) * 100),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    leads: lead ? Number(lead.value) : 0,
  };
}

async function insights(params: Record<string, string>): Promise<RawRow[]> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  const rows: RawRow[] = [];
  let next: string | null = (() => {
    const u = new URL(`${GRAPH}/${account}/insights`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("limit", "200");
    u.searchParams.set("access_token", token ?? "");
    return u.toString();
  })();
  // Follow paging; cap pages so a bad response can't loop forever.
  for (let page = 0; next && page < 20; page++) {
    // Cached an hour; give up after 8s so a slow Meta never holds up a page.
    const res: Response = await fetch(next, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json?.error?.message ?? `Meta returned ${res.status}`);
    }
    rows.push(...(json.data as RawRow[]));
    next = json.paging?.next ?? null;
  }
  return rows;
}

function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthsBack(n: number): { since: string; until: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
  return { since: start.toISOString().slice(0, 10), until: now.toISOString().slice(0, 10) };
}

const FIELDS = "spend,impressions,clicks,actions";

export async function loadMetaAds(period: MetaPeriod): Promise<MetaAdsReport> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    return {
      ok: false,
      reason: "NOT_CONFIGURED",
      message: "Meta isn't connected. Add META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID to the environment.",
    };
  }
  try {
    const [totalRows, campaignRows, monthRows] = await Promise.all([
      insights({ fields: FIELDS, date_preset: period }),
      insights({ fields: `campaign_id,campaign_name,${FIELDS}`, level: "campaign", date_preset: period }),
      insights({ fields: `campaign_name,${FIELDS}`, level: "campaign", time_increment: "monthly", time_range: JSON.stringify(monthsBack(12)) }),
    ]);
    const first = totalRows[0];
    const total = first ? toRow(first) : ZERO;

    // The period just before, same length, for "vs previous" arrows.
    let previous: MetaRow | null = null;
    if (period !== "maximum" && first) {
      const days = Math.round((Date.parse(first.date_stop) - Date.parse(first.date_start)) / 86_400_000) + 1;
      const until = shiftDay(first.date_start, -1);
      const prevRows = await insights({ fields: FIELDS, time_range: JSON.stringify({ since: shiftDay(until, -(days - 1)), until }) });
      previous = prevRows[0] ? toRow(prevRows[0]) : ZERO;
    }
    const campaigns = campaignRows
      .map((r) => ({
        ...toRow(r),
        id: r.campaign_id ?? "",
        name: r.campaign_name ?? "(no name)",
        kind: campaignKind(r.campaign_name ?? ""),
      }))
      .filter((c) => c.spendCents > 0)
      .sort((a, b) => b.spendCents - a.spendCents);
    const range = monthsBack(12);
    const months: MetaMonthRow[] = [];
    for (let m = range.since.slice(0, 7); m <= range.until.slice(0, 7); m = shiftDay(`${m}-28`, 7).slice(0, 7)) {
      months.push({ ...ZERO, month: m, byKind: { HIRING: ZERO, FRANCHISE: ZERO, OTHER: ZERO } });
    }
    for (const r of monthRows) {
      const row = months.find((m) => m.month === r.date_start.slice(0, 7));
      if (!row) continue;
      const v = toRow(r);
      const kind = campaignKind(r.campaign_name ?? "");
      row.byKind[kind] = addRow(row.byKind[kind], v);
      Object.assign(row, addRow(row, v));
    }
    return {
      ok: true,
      since: first?.date_start ?? null,
      until: first?.date_stop ?? null,
      total,
      previous,
      campaigns,
      months,
    };
  } catch (e) {
    return { ok: false, reason: "ERROR", message: e instanceof Error ? e.message : String(e) };
  }
}

export function metaConfigured(): boolean {
  return !!process.env.META_ADS_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID;
}

/** Meta can't report on days that haven't happened yet. */
function clampToToday(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return day > today ? today : day;
}

/**
 * Total Meta spend between two days ("YYYY-MM-DD", inclusive), or null when
 * Meta isn't connected or doesn't answer. For notes only: QuickBooks already
 * has these charges, so this must never be added to a cost total.
 */
export async function metaSpendBetween(since: string, until: string): Promise<number | null> {
  if (!metaConfigured()) return null;
  const to = clampToToday(until);
  if (to < since) return 0;
  try {
    const rows = await insights({ fields: "spend", time_range: JSON.stringify({ since, until: to }) });
    return rows.reduce((s, r) => s + toRow(r).spendCents, 0);
  } catch {
    return null;
  }
}

export type MetaMonth = { spendCents: number; campaigns: { name: string; spendCents: number }[] };

/**
 * Meta spend per calendar month ("YYYY-MM") from a month on, with each
 * month's campaigns, or null when Meta isn't connected or doesn't answer.
 */
export async function metaSpendByMonth(fromMonth: string): Promise<Map<string, MetaMonth> | null> {
  if (!metaConfigured()) return null;
  try {
    const rows = await insights({
      fields: "campaign_name,spend",
      level: "campaign",
      time_increment: "monthly",
      time_range: JSON.stringify({ since: `${fromMonth}-01`, until: clampToToday("9999-12-31") }),
    });
    const out = new Map<string, MetaMonth>();
    for (const r of rows) {
      const cents = toRow(r).spendCents;
      if (!cents) continue;
      const key = r.date_start.slice(0, 7);
      const m = out.get(key) ?? { spendCents: 0, campaigns: [] };
      m.spendCents += cents;
      m.campaigns.push({ name: r.campaign_name ?? "(no name)", spendCents: cents });
      out.set(key, m);
    }
    for (const m of out.values()) m.campaigns.sort((a, b) => b.spendCents - a.spendCents);
    return out;
  } catch {
    return null;
  }
}
