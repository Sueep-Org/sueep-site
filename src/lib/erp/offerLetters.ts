/**
 * Offer letter templates (office hiring). A template is an ordered list of
 * sections. Text sections hold plain text with blanks like {firstName} and
 * light formatting:
 *   - a blank line starts a new paragraph (lines inside a paragraph keep their breaks)
 *   - a line starting with "- " is a bullet
 *   - **word** is bold
 * The same parser feeds the on-screen preview and the PDF, so both match.
 * Plain data, no server imports, so client components can use it too.
 */

export type OfferSectionKind = "text" | "commission" | "signature";

export type OfferSection = {
  key: string;
  title: string;
  kind: OfferSectionKind;
  body: string;
  enabled: boolean;
  /** Signatures only: label above the candidate's signature line */
  acceptLabel?: string;
  /** Signatures only: text under the candidate's signature line (same format as body) */
  acceptBody?: string;
};

export const DEFAULT_ACCEPT_LABEL = "Accepted by:";
export const DEFAULT_ACCEPT_BODY = "{fullName}";

export const SECTION_KINDS: { value: OfferSectionKind; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "commission", label: "Commission tables" },
  { value: "signature", label: "Signatures" },
];

export const OFFER_LETTER_STATUSES: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-gray-100 text-gray-700" },
  SENT: { label: "Sent", cls: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "Signed", cls: "bg-emerald-100 text-emerald-700" },
  DECLINED: { label: "Declined", cls: "bg-red-100 text-red-700" },
  VOID: { label: "Void", cls: "bg-gray-100 text-gray-500 line-through" },
};

/**
 * The one offer flag on a board card, from the candidate's latest letter
 * that isn't void. Sent letters count down to their sign-by date.
 */
export function offerFlag(
  offer: { status: string; sentAt: string | null; signByDate: string | null } | null,
  todayIso: string,
): { label: string; cls: string; title: string } | null {
  if (!offer) return null;
  const day = (iso: string) => Math.round((Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86_400_000);
  const signBy = offer.signByDate ? offer.signByDate.slice(0, 10) : null;
  // Sent time is a moment; count days in Philadelphia time.
  const sentDay = offer.sentAt ? isoToday(new Date(offer.sentAt)) : null;
  const title = [
    sentDay ? `Sent ${formatOfferDate(sentDay, "long")}` : null,
    signBy ? `Sign by ${formatOfferDate(signBy, "long")}` : null,
  ].filter(Boolean).join("\n");
  switch (offer.status) {
    case "DRAFT":
      return { label: "Offer draft", cls: "bg-gray-100 text-gray-600", title: "Offer letter saved, not sent yet" };
    case "SIGNED":
      return { label: "Offer signed", cls: "bg-emerald-100 text-emerald-700", title };
    case "DECLINED":
      return { label: "Offer declined", cls: "bg-red-100 text-red-700", title };
    case "SENT": {
      const left = signBy ? day(signBy) : null;
      if (left != null && left < 0) return { label: "Offer overdue", cls: "bg-red-100 text-red-700", title };
      if (left === 0) return { label: "Offer due today", cls: "bg-amber-100 text-amber-800", title };
      if (left === 1) return { label: "Offer due tomorrow", cls: "bg-amber-100 text-amber-800", title };
      const ago = sentDay ? -day(sentDay) : null;
      return { label: ago ? `Offer sent ${ago}d ago` : "Offer sent today", cls: "bg-blue-100 text-blue-700", title };
    }
    default:
      return null;
  }
}

export type OfferBlank = {
  key: string;
  label: string;
  /** Example shown next to the blank in the editor's picker */
  sample: string;
  /** Prefilled on a new letter when nothing better is known */
  defaultValue?: string;
  /** Date blanks are picked with a date input (stored as YYYY-MM-DD) and printed in this style */
  date?: "long" | "ordinal" | "short";
};

export const DEFAULT_OFFICE_ADDRESS = "3500 Scotts Lane Unit F22, Philadelphia, PA 19129";

/** Every blank a template may use. Anything else in {braces} is flagged as a typo. */
export const OFFER_BLANKS: OfferBlank[] = [
  { key: "today", label: "Letter date", sample: "October 23, 2026", date: "long" },
  { key: "firstName", label: "First name", sample: "Jordan" },
  { key: "fullName", label: "Full name", sample: "Jordan Smith" },
  { key: "title", label: "Job title", sample: "Estimator" },
  { key: "workMode", label: "Work mode", sample: "hybrid" },
  { key: "officeAddress", label: "Office address", sample: DEFAULT_OFFICE_ADDRESS, defaultValue: DEFAULT_OFFICE_ADDRESS },
  { key: "inOfficeDays", label: "Days in office", sample: "2-3" },
  { key: "salary", label: "Salary", sample: "$65,000" },
  { key: "startDate", label: "Start date", sample: "November 2nd, 2026", date: "ordinal" },
  { key: "employmentType", label: "Employment type", sample: "Full-Time, W-2 Employee", defaultValue: "Full-Time, W-2 Employee" },
  { key: "reportsTo", label: "Reports to", sample: "Management Team", defaultValue: "Management Team" },
  { key: "trialDays", label: "Trial period (days)", sample: "30", defaultValue: "30" },
  { key: "signByDate", label: "Sign by date", sample: "10/27/26", date: "short" },
  { key: "commissionRate", label: "Commission rate", sample: "3%", defaultValue: "3%" },
];

const BLANK_KEYS = new Set(OFFER_BLANKS.map((b) => b.key));
const BLANK_RE = /\{([A-Za-z0-9_]+)\}/g;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ordinal(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "2026-11-02" -> "November 2, 2026" | "November 2nd, 2026" | "11/2/26". Anything else is returned as typed. */
export function formatOfferDate(iso: string, style: "long" | "ordinal" | "short"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (style === "short") return `${mo}/${d}/${String(y).slice(2)}`;
  return `${MONTHS[mo - 1]} ${style === "ordinal" ? ordinal(d) : d}, ${y}`;
}

/** Stored letter values -> what gets printed (dates formatted). */
export function displayValues(values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...values };
  for (const b of OFFER_BLANKS) if (b.date && out[b.key]) out[b.key] = formatOfferDate(out[b.key], b.date);
  return out;
}

/** YYYY-MM-DD in Philadelphia time. */
export function isoToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

function addBusinessDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const WORK_MODE_WORDS: Record<string, string> = { ON_SITE: "on site", HYBRID: "hybrid", REMOTE: "remote" };

/** Starting values for a new letter, from the candidate and their opening. Everything stays editable. */
export function defaultOfferValues(input: {
  fullName: string;
  opening: { title: string; workMode: string | null; salaryMinCents: number | null; salaryMaxCents: number | null } | null;
}): Record<string, string> {
  const values: Record<string, string> = {};
  for (const b of OFFER_BLANKS) values[b.key] = b.defaultValue ?? "";
  const today = isoToday();
  const o = input.opening;
  values.today = today;
  values.signByDate = addBusinessDays(today, 2);
  values.fullName = input.fullName.trim();
  values.firstName = input.fullName.trim().split(/\s+/)[0] ?? "";
  if (o) {
    values.title = o.title;
    if (o.workMode && WORK_MODE_WORDS[o.workMode]) values.workMode = WORK_MODE_WORDS[o.workMode];
    // Only a single figure is a salary; a range still needs a decision.
    const one = o.salaryMinCents != null && (o.salaryMaxCents == null || o.salaryMaxCents === o.salaryMinCents) ? o.salaryMinCents : null;
    if (one != null) values.salary = `$${Math.round(one / 100).toLocaleString("en-US")}`;
  }
  return values;
}

/** Only known blank keys, as trimmed strings. */
export function parseOfferValues(input: unknown): Record<string, string> {
  const r = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const b of OFFER_BLANKS) out[b.key] = typeof r[b.key] === "string" ? (r[b.key] as string).slice(0, 500) : "";
  return out;
}

/**
 * Blanks the letter uses that are still empty. The commission rate is left
 * out when the letter has commission tables, since it comes from them.
 */
export function missingOfferBlanks(sections: OfferSection[], values: Record<string, string>): OfferBlank[] {
  const hasCommission = sections.some((s) => s.enabled && s.kind === "commission");
  return usedBlanks(sections).filter((b) => !(hasCommission && b.key === "commissionRate") && !values[b.key]?.trim());
}

/** Blanks in the text that aren't in OFFER_BLANKS (typos like {salry}). */
export function unknownBlanks(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(BLANK_RE)) if (!BLANK_KEYS.has(m[1])) out.add(m[1]);
  return [...out];
}

/** Blanks used by the enabled sections, in OFFER_BLANKS order. */
export function usedBlanks(sections: OfferSection[]): OfferBlank[] {
  const used = new Set<string>();
  for (const s of sections) {
    if (!s.enabled) continue;
    for (const m of `${s.title}\n${s.body}\n${s.acceptBody ?? ""}`.matchAll(BLANK_RE)) used.add(m[1]);
  }
  return OFFER_BLANKS.filter((b) => used.has(b.key));
}

/** Fills known blanks. A blank with no value stays visible as [Label] so it can't slip through unnoticed. */
export function fillBlanks(text: string, values: Record<string, string>): string {
  return text.replace(BLANK_RE, (whole, key: string) => {
    if (!BLANK_KEYS.has(key)) return whole;
    const v = values[key]?.trim();
    if (v) return v;
    return `[${OFFER_BLANKS.find((b) => b.key === key)!.label}]`;
  });
}

export type OfferRun = { text: string; bold: boolean };
export type OfferBlock =
  | { type: "para"; lines: OfferRun[][] }
  | { type: "bullets"; items: OfferRun[][] };

function parseRuns(line: string): OfferRun[] {
  const runs: OfferRun[] = [];
  line.split("**").forEach((part, i) => {
    if (part) runs.push({ text: part, bold: i % 2 === 1 });
  });
  return runs;
}

/** Splits filled section text into paragraphs and bullet lists. */
export function parseOfferBody(text: string): OfferBlock[] {
  const blocks: OfferBlock[] = [];
  let para: OfferRun[][] | null = null;
  let bullets: OfferRun[][] | null = null;
  const flush = () => {
    if (para) blocks.push({ type: "para", lines: para });
    if (bullets) blocks.push({ type: "bullets", items: bullets });
    para = null;
    bullets = null;
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (/^\s*- /.test(line)) {
      if (para) flush();
      (bullets ??= []).push(parseRuns(line.replace(/^\s*- /, "")));
    } else {
      if (bullets) flush();
      (para ??= []).push(parseRuns(line));
    }
  }
  flush();
  return blocks;
}

const MAX_SECTIONS = 40;
const MAX_BODY = 20_000;

/** Cleans a section list from the editor. Returns an error message when it can't be saved. */
export function parseSections(input: unknown): { sections: OfferSection[]; error?: string } {
  if (!Array.isArray(input)) return { sections: [], error: "Sections missing" };
  if (input.length > MAX_SECTIONS) return { sections: [], error: `At most ${MAX_SECTIONS} sections` };
  const sections: OfferSection[] = [];
  const kinds = new Set(SECTION_KINDS.map((k) => k.value));
  for (const [i, raw] of input.entries()) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const kind = (typeof r.kind === "string" && kinds.has(r.kind as OfferSectionKind) ? r.kind : "text") as OfferSectionKind;
    const body = typeof r.body === "string" ? r.body : "";
    if (body.length > MAX_BODY) return { sections: [], error: `Section ${i + 1} is too long` };
    sections.push({
      key: typeof r.key === "string" && r.key ? r.key.slice(0, 64) : `s${i + 1}`,
      title: typeof r.title === "string" ? r.title.trim().slice(0, 200) : "",
      kind,
      body,
      enabled: r.enabled !== false,
      ...(kind === "signature"
        ? {
            acceptLabel: typeof r.acceptLabel === "string" ? r.acceptLabel.trim().slice(0, 200) : DEFAULT_ACCEPT_LABEL,
            acceptBody: typeof r.acceptBody === "string" ? r.acceptBody.slice(0, 2000) : DEFAULT_ACCEPT_BODY,
          }
        : {}),
    });
  }
  if (sections.filter((s) => s.kind === "signature").length > 1) return { sections: [], error: "Only one signatures section" };
  if (sections.filter((s) => s.kind === "commission").length > 1) return { sections: [], error: "Only one commission section" };
  return { sections };
}

/** Reads a stored section list (JSON column) without throwing on old or odd data. */
export function readSections(json: unknown): OfferSection[] {
  return parseSections(json).sections;
}
