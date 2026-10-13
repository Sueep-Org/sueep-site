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

/** What was decided about a lien on a job. */
export const LIEN_DECISION_OPTIONS = [
  { value: "PURSUING", label: "Pursuing" },
  { value: "NOT_PURSUING", label: "Not pursuing" },
  { value: "FILED", label: "Lien filed" },
] as const;
export type LienDecision = (typeof LIEN_DECISION_OPTIONS)[number]["value"];

export function parseLienDecision(raw: unknown): LienDecision | null {
  const v = String(raw ?? "").trim().toUpperCase();
  return LIEN_DECISION_OPTIONS.some((o) => o.value === v) ? (v as LienDecision) : null;
}

/** Decided and done with: off the lien list, no more alerts. */
export function lienDecisionCloses(decision: string | null | undefined): boolean {
  return decision === "NOT_PURSUING" || decision === "FILED";
}

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

/**
 * How long before the next required step someone should decide whether to
 * file. A working default, not a legal rule: late enough that the invoice
 * has had a fair chance to be paid, early enough to leave time for an
 * attorney. New Jersey residential gets less because its first notice is
 * due only 60 days after the last day of work.
 */
export const LIEN_DECIDE_DAYS_BEFORE = 30;
export const LIEN_DECIDE_DAYS_BEFORE_NJ_RESIDENTIAL = 15;
/** A required notice this close and not yet sent is the most urgent thing on the list. */
export const LIEN_NOTICE_WARNING_DAYS = 14;
/** Pennsylvania: a subcontractor's notice has to be given this long before filing. */
export const PA_NOTICE_WAIT_DAYS = 30;
/** Pennsylvania: no lien for a claim of this much or less. */
export const PA_MINIMUM_CLAIM_CENTS = 50000;

export type LienDeadline = {
  /** Last day to file, "YYYY-MM-DD" */
  deadlineKey: string;
  daysLeft: number;
  /** A step the law requires before filing, when there is one */
  noticeLabel: string | null;
  noticeByKey: string | null;
  noticeDaysLeft: number | null;
  /** The suggested day to decide by (see LIEN_DECIDE_DAYS_BEFORE). */
  decideByKey: string;
  decideDaysLeft: number;
  /** After a notice is sent, how many days must pass before filing. 0 = none. */
  noticeWaitDays: number;
  /** A signed written contract is needed to have a lien at all (New Jersey). */
  contractRequired: boolean;
  /** No lien for a claim of this much or less. 0 = no minimum. */
  minimumClaimCents: number;
  state: LienState;
  /** Hired by a general contractor (or not set, which is treated the same). */
  isSub: boolean;
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
  // Decide ahead of the next thing that has to happen, which is the notice when there is one.
  const decideByKey = addDaysKey(
    noticeByKey ?? deadlineKey,
    -(state === "NJ" && input.residential ? LIEN_DECIDE_DAYS_BEFORE_NJ_RESIDENTIAL : LIEN_DECIDE_DAYS_BEFORE),
  );

  return {
    deadlineKey,
    daysLeft,
    noticeLabel,
    noticeByKey,
    noticeDaysLeft,
    decideByKey,
    decideDaysLeft: daysBetween(todayKey, decideByKey),
    noticeWaitDays: state === "PA" && isSub ? PA_NOTICE_WAIT_DAYS : 0,
    contractRequired: state === "NJ",
    minimumClaimCents: state === "PA" ? PA_MINIMUM_CLAIM_CENTS : 0,
    state,
    isSub,
    rule,
    roleAssumed: roleMatters && !parsedRole,
  };
}

/**
 * Where a job stands, most pressing first:
 *   TOO_LATE       the filing deadline has passed
 *   NOTICE_MISSED  a required notice wasn't sent by its date
 *   NOTICE_DUE     a required notice is due within LIEN_NOTICE_WARNING_DAYS
 *   DECIDE_NOW     the suggested decision day has arrived
 *   PAST_DUE       an invoice is late, so a lien is on the table
 *   NOT_DUE        unpaid, but nothing is late yet
 */
export type LienStage = "TOO_LATE" | "NOTICE_MISSED" | "NOTICE_DUE" | "DECIDE_NOW" | "PAST_DUE" | "NOT_DUE";

export const LIEN_STAGE_RANK: Record<LienStage, number> = { TOO_LATE: 0, NOTICE_MISSED: 1, NOTICE_DUE: 2, DECIDE_NOW: 3, PAST_DUE: 4, NOT_DUE: 5 };

/**
 * Steps a person ticks by hand on the Liens tab. Everything else in the
 * list is worked out by the ERP from the project.
 */
export const LIEN_MANUAL_STEP_KEYS = [
  "rightsConfirmed",
  "contractNoticeChecked",
  "letterPrepared",
  "attorneyApproved",
  "gcCopySent",
  "servedAfterFiling",
  "proofOfServiceFiled",
] as const;
export type LienManualStepKey = (typeof LIEN_MANUAL_STEP_KEYS)[number];

export function isLienManualStepKey(v: unknown): v is LienManualStepKey {
  return (LIEN_MANUAL_STEP_KEYS as readonly string[]).includes(String(v));
}

/** Who ticked a manual step and when, as saved on the project (Project.lienSteps). */
export type LienManualSteps = Partial<Record<LienManualStepKey, { at: string; by: string | null }>>;

export function parseLienManualSteps(raw: unknown): LienManualSteps {
  const out: LienManualSteps = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isLienManualStepKey(key) || !value || typeof value !== "object") continue;
    const v = value as { at?: unknown; by?: unknown };
    if (typeof v.at === "string") out[key] = { at: v.at, by: typeof v.by === "string" ? v.by : null };
  }
  return out;
}

/**
 * One line of the lien steps list.
 *   AUTO    worked out by the ERP
 *   MANUAL  ticked by a person; `manualKey` is what to save
 *   NOTICE  done by filling in the notice mailing date (and tracking number)
 */
export type LienStep = {
  key: string;
  label: string;
  kind: "AUTO" | "MANUAL" | "NOTICE";
  manualKey?: LienManualStepKey;
  done: boolean;
  /** Has to be done before filing. Optional steps are shown but don't hold up "Ready to file". */
  required: boolean;
  /** Comes after the lien is filed. */
  afterFiling: boolean;
  detail: string;
  /** For a ticked manual step */
  by?: string | null;
  onKey?: string | null;
};

export type LienFacts = {
  unpaidCents: number;
  /** Open invoices linked to the job's lines. Null due date = HubSpot has none. */
  openInvoices: Array<{ number: string | null; dueKey: string | null }>;
  /** "YYYY-MM-DD" the required notice went out, when someone recorded it */
  noticeSentKey: string | null;
  /** Certified mail or courier tracking number for that notice */
  noticeTracking: string | null;
  hasSignedContract: boolean;
  decision: LienDecision | null;
  /** The owner's name and mailing address are both filled in */
  hasOwnerDetails: boolean;
  /** The general contractor's name and mailing address are both filled in */
  hasGcDetails: boolean;
  manual: LienManualSteps;
};

export type LienReadiness = {
  stage: LienStage;
  steps: LienStep[];
  /** Every required step before filing is done. Still a person's call, and an attorney's. */
  canFileNow: boolean;
  /** Days the oldest late invoice is overdue, when one is */
  daysOverdue: number | null;
};

/** Where a job stands and the steps to a filing, in order. */
export function lienReadiness(d: LienDeadline, facts: LienFacts, todayKey: string = todayEasternKey()): LienReadiness {
  const late = facts.openInvoices
    .filter((i) => i.dueKey && i.dueKey < todayKey)
    .sort((a, b) => a.dueKey!.localeCompare(b.dueKey!));
  const daysOverdue = late.length > 0 ? daysBetween(late[0].dueKey!, todayKey) : null;
  const noticeNeeded = !!d.noticeByKey;
  const noticeSent = !!facts.noticeSentKey;
  const fileFromKey = noticeSent && d.noticeWaitDays > 0 ? addDaysKey(facts.noticeSentKey!, d.noticeWaitDays) : null;

  const steps: LienStep[] = [];
  const auto = (key: string, label: string, done: boolean, detail: string, required = true) =>
    steps.push({ key, label, kind: "AUTO", done, required, afterFiling: false, detail });
  const manual = (manualKey: LienManualStepKey, label: string, detail: string, opts: { required?: boolean; afterFiling?: boolean } = {}) => {
    const saved = facts.manual[manualKey];
    steps.push({
      key: manualKey,
      label,
      kind: "MANUAL",
      manualKey,
      done: !!saved,
      required: opts.required ?? true,
      afterFiling: opts.afterFiling ?? false,
      detail,
      by: saved?.by ?? null,
      onKey: saved ? todayEasternKey(new Date(saved.at)) : null,
    });
  };

  auto(
    "unpaid",
    "Money is owed",
    facts.unpaidCents > d.minimumClaimCents,
    facts.unpaidCents > d.minimumClaimCents ? "" : facts.unpaidCents > 0 ? `Under the $${d.minimumClaimCents / 100} minimum` : "Nothing is unpaid",
  );
  auto(
    "pastDue",
    "Invoice is past due",
    late.length > 0,
    late.length > 0
      ? `${late[0].number ?? "Oldest invoice"} was due ${formatLienDay(late[0].dueKey!)}, ${daysOverdue}d ago`
      : facts.openInvoices.length > 0
        ? "No linked invoice is late yet"
        : "No open invoice is linked to this job",
  );
  auto(
    "deadline",
    "Filing deadline has not passed",
    d.daysLeft >= 0,
    d.daysLeft >= 0 ? `${d.daysLeft}d left, until ${formatLienDay(d.deadlineKey)}` : `Passed ${formatLienDay(d.deadlineKey)}`,
  );
  manual("rightsConfirmed", "Confirmed Sueep can lien this job", "Hired by the owner, the general contractor, or one of the contractor's subs");
  auto(
    "contract",
    "Signed contract on file",
    facts.hasSignedContract,
    facts.hasSignedContract ? "" : d.contractRequired ? "Required in New Jersey. Add it on the project's Signing tab" : "None saved on the project",
    d.contractRequired,
  );
  manual("contractNoticeChecked", "Contract's notice section checked", "It may say where and how notices have to be sent");
  const needGc = d.isSub;
  auto(
    "parties",
    needGc ? "Owner and contractor details entered" : "Owner details entered",
    facts.hasOwnerDetails && (!needGc || facts.hasGcDetails),
    facts.hasOwnerDetails && (!needGc || facts.hasGcDetails) ? "" : "Names and mailing addresses, in Parties above",
  );
  auto("decision", "Decision to pursue recorded", facts.decision === "PURSUING" || facts.decision === "FILED", facts.decision ? "" : "Set Decision above");
  // The ERP hands the attorney the facts; the attorney writes anything that gets sent.
  manual("letterPrepared", "Fact sheet and documents prepared for the attorney", "Ticks when the packet is downloaded below");

  if (noticeNeeded) {
    manual("attorneyApproved", `${d.noticeLabel} prepared by the attorney`, "");
    steps.push({
      key: "noticeMailed",
      label: `${d.noticeLabel} mailed`,
      kind: "NOTICE",
      done: noticeSent,
      required: true,
      afterFiling: false,
      detail: noticeSent
        ? `Mailed ${formatLienDay(facts.noticeSentKey!)}${facts.noticeTracking ? `, tracking ${facts.noticeTracking}` : ""}`
        : d.noticeDaysLeft! >= 0
          ? `Due by ${formatLienDay(d.noticeByKey!)}. Keep the proof of mailing`
          : `Was due ${formatLienDay(d.noticeByKey!)}`,
    });
    if (d.isSub) manual("gcCopySent", "Copy sent to the general contractor", "Not required by law, but good practice", { required: false });
    if (d.noticeWaitDays > 0) {
      auto(
        "noticeWait",
        `${d.noticeWaitDays} days have passed since mailing`,
        !!fileFromKey && fileFromKey <= todayKey,
        fileFromKey ? (fileFromKey <= todayKey ? "" : `Can file from ${formatLienDay(fileFromKey)}`) : "Starts when the notice is mailed",
      );
    }
  } else {
    manual("attorneyApproved", "Lien claim prepared by an attorney", "");
  }

  steps.push({
    key: "filed",
    label: "Lien filed",
    kind: "AUTO",
    done: facts.decision === "FILED",
    required: false,
    afterFiling: true,
    detail: facts.decision === "FILED" ? "" : "Set Decision to Lien filed once it is",
  });
  if (d.state === "NJ") {
    manual("servedAfterFiling", d.isSub ? "Lien served on the owner and the contractor" : "Lien served on the owner", "Within 10 days of filing, by certified mail and regular mail together", {
      required: false,
      afterFiling: true,
    });
  } else if (d.state === "PA") {
    manual("servedAfterFiling", "Owner served with notice of the filing", "Within 1 month of filing", { required: false, afterFiling: true });
    manual("proofOfServiceFiled", "Proof of service filed with the court", "Within 20 days of serving the owner", { required: false, afterFiling: true });
  }

  let stage: LienStage;
  if (d.daysLeft < 0) stage = "TOO_LATE";
  else if (noticeNeeded && !noticeSent && d.noticeDaysLeft! < 0) stage = "NOTICE_MISSED";
  else if (noticeNeeded && !noticeSent && d.noticeDaysLeft! <= LIEN_NOTICE_WARNING_DAYS) stage = "NOTICE_DUE";
  else if (d.decideDaysLeft <= 0) stage = "DECIDE_NOW";
  else if (late.length > 0) stage = "PAST_DUE";
  else stage = "NOT_DUE";

  const canFileNow = steps.every((st) => st.done || !st.required || st.afterFiling);
  return { stage, steps, canFileNow, daysOverdue };
}

/** Short text for the pill on a billing row. */
export function lienPillLabel(d: LienDeadline, r: LienReadiness): string {
  switch (r.stage) {
    case "TOO_LATE":
      return "Lien deadline passed";
    case "NOTICE_MISSED":
      return "Lien notice date passed";
    case "NOTICE_DUE":
      return d.noticeDaysLeft === 0 ? "Lien notice due today" : `Lien notice due in ${d.noticeDaysLeft}d`;
    case "DECIDE_NOW":
      return `Decide on lien, ${d.daysLeft}d to file`;
    case "PAST_DUE":
      return `Past due, ${d.daysLeft}d to file a lien`;
    default:
      return `Not due yet, ${d.daysLeft}d to file a lien`;
  }
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
