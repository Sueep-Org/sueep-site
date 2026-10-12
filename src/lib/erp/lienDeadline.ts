/**
 * How long Sueep has to file a mechanics lien on an unpaid job. The clock
 * starts on the last day of work, not the invoice date, and the rules depend
 * on the state, on who hired Sueep, and on the kind of property. The last
 * day of work is the project's completion date (see lienWatch.ts).
 *
 * These are the general statutory deadlines, for showing how much time is
 * left. They are not legal advice and don't cover every exception.
 */

import { todayEasternKey, utcDateKey } from "./dates";

export const LIEN_STATE_OPTIONS = [
  { value: "PA", label: "Pennsylvania" },
  { value: "NJ", label: "New Jersey" },
  { value: "DE", label: "Delaware" },
  { value: "NY", label: "New York" },
] as const;
export type LienState = (typeof LIEN_STATE_OPTIONS)[number]["value"];

/** Who hired Sueep. Hired by a GC makes Sueep a subcontractor, which has stricter rules. */
export const LIEN_ROLE_OPTIONS = [
  { value: "SUB", label: "General contractor" },
  { value: "DIRECT", label: "Property owner" },
] as const;
export type LienRole = (typeof LIEN_ROLE_OPTIONS)[number]["value"];

export function parseLienState(raw: unknown): LienState | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return LIEN_STATE_OPTIONS.some((o) => o.value === v) ? (v as LienState) : null;
}

export function parseLienRole(raw: unknown): LienRole | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return LIEN_ROLE_OPTIONS.some((o) => o.value === v) ? (v as LienRole) : null;
}

/**
 * The state named in an address or job title, e.g. "55 Ardmore Ave, Ardmore,
 * PA 19003" or "Brightview, Brick, NJ". Only the states with a rule above.
 * When more than one shows up (a road like "NJ-88"), the last one wins, since
 * the state comes at the end of an address.
 */
export function detectLienState(text: string | null | undefined): LienState | null {
  if (!text) return null;
  let found: { state: LienState; at: number } | null = null;
  const note = (state: LienState, at: number) => {
    if (!found || at > found.at) found = { state, at };
  };
  // Two-letter codes must be capitals, so words like "de" or "pa" don't count.
  for (const m of text.matchAll(/\b(PA|NJ|DE|NY)\b/g)) note(m[1] as LienState, m.index);
  for (const o of LIEN_STATE_OPTIONS) {
    const at = text.toLowerCase().lastIndexOf(o.label.toLowerCase());
    if (at >= 0) note(o.value, at);
  }
  return (found as { state: LienState; at: number } | null)?.state ?? null;
}

/** Days before the next required step when the pill turns amber, then red. */
export const LIEN_SOON_DAYS = 60;
export const LIEN_URGENT_DAYS = 30;

export type LienLevel = "OK" | "SOON" | "URGENT" | "PASSED";

export type LienDeadline = {
  /** Last day to file, "YYYY-MM-DD" */
  deadlineKey: string;
  daysLeft: number;
  /** A step the law requires before filing, when there is one */
  noticeLabel: string | null;
  noticeByKey: string | null;
  noticeDaysLeft: number | null;
  level: LienLevel;
  /** The rule this came from, in plain words */
  rule: string;
  /** True when who hired Sueep isn't set and the stricter subcontractor rule was used */
  roleAssumed: boolean;
};

function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateKey(d);
}

/** Same day N months later. A day the target month doesn't have lands on its last day. */
function addMonthsKey(key: string, months: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return utcDateKey(d);
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((new Date(`${toKey}T00:00:00.000Z`).getTime() - new Date(`${fromKey}T00:00:00.000Z`).getTime()) / 86_400_000);
}

export type LienInput = {
  state: string | null;
  role: string | null;
  residential: boolean;
  lastWorkDate: Date | null;
};

/** The filing deadline for a job, or null when the state or completion date isn't known. */
export function lienDeadline(input: LienInput, todayKey: string = todayEasternKey()): LienDeadline | null {
  const state = parseLienState(input.state);
  if (!state || !input.lastWorkDate) return null;
  const lastKey = utcDateKey(input.lastWorkDate);
  const parsedRole = parseLienRole(input.role);
  const isSub = parsedRole !== "DIRECT";

  let deadlineKey: string;
  let noticeLabel: string | null = null;
  let noticeByKey: string | null = null;
  let rule: string;
  let roleMatters = false;

  if (state === "PA") {
    deadlineKey = addMonthsKey(lastKey, 6);
    rule = "Pennsylvania: 6 months after the last day of work.";
    roleMatters = true;
    if (isSub) {
      noticeLabel = "Written notice to the owner";
      noticeByKey = addDaysKey(deadlineKey, -30);
      rule += " A subcontractor must give the owner written notice at least 30 days before filing.";
    }
  } else if (state === "NJ") {
    if (input.residential) {
      deadlineKey = addDaysKey(lastKey, 120);
      noticeLabel = "Notice of Unpaid Balance";
      noticeByKey = addDaysKey(lastKey, 60);
      rule = "New Jersey residential: 120 days after the last day of work, with a Notice of Unpaid Balance filed within 60 days.";
    } else {
      deadlineKey = addDaysKey(lastKey, 90);
      rule = "New Jersey commercial: 90 days after the last day of work.";
    }
  } else if (state === "DE") {
    roleMatters = true;
    deadlineKey = addDaysKey(lastKey, isSub ? 120 : 180);
    rule = isSub
      ? "Delaware subcontractor: 120 days after the last day of work."
      : "Delaware, hired by the owner: 180 days after the job is finished.";
  } else {
    deadlineKey = addMonthsKey(lastKey, input.residential ? 4 : 8);
    rule = input.residential
      ? "New York single-family residential: 4 months after the last day of work."
      : "New York: 8 months after the last day of work.";
  }

  const daysLeft = daysBetween(todayKey, deadlineKey);
  const noticeDaysLeft = noticeByKey ? daysBetween(todayKey, noticeByKey) : null;
  // The color follows the next thing that has to happen, which is the notice when there is one.
  const actDays = noticeDaysLeft ?? daysLeft;
  const level: LienLevel =
    daysLeft < 0 ? "PASSED" : actDays <= LIEN_URGENT_DAYS ? "URGENT" : actDays <= LIEN_SOON_DAYS ? "SOON" : "OK";

  return {
    deadlineKey,
    daysLeft,
    noticeLabel,
    noticeByKey,
    noticeDaysLeft,
    level,
    rule,
    roleAssumed: roleMatters && !parsedRole,
  };
}

/** Short text for the pill on a billing row. */
export function lienPillLabel(d: LienDeadline): string {
  if (d.level === "PASSED") return "Lien deadline passed";
  if (d.noticeDaysLeft != null && d.noticeDaysLeft < 0) return "Lien notice date passed";
  return d.daysLeft === 0 ? "Lien deadline today" : `Lien deadline in ${d.daysLeft}d`;
}

/** "Mar 3, 2027" for a "YYYY-MM-DD" day label. */
export function formatLienDay(key: string): string {
  return new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
