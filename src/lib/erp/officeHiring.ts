/**
 * Office hiring (the Office tab on Candidates): job openings and the
 * candidates for them. Plain data and helpers, no server imports, so client
 * components can use it too.
 */

export type OfficeStage =
  | "NEW"
  | "CONTACTING"
  | "PHONE_SCREEN"
  | "INTERVIEW"
  | "FINAL"
  | "OFFER"
  | "BACKUP"
  | "HIRED"
  | "REJECTED"
  | "WITHDREW";

export const OFFICE_STAGES: { value: OfficeStage; label: string; cls: string }[] = [
  { value: "NEW", label: "New", cls: "bg-gray-100 text-gray-700" },
  { value: "CONTACTING", label: "Contacting", cls: "bg-sky-100 text-sky-700" },
  { value: "PHONE_SCREEN", label: "Phone screen", cls: "bg-blue-100 text-blue-700" },
  { value: "INTERVIEW", label: "Interview", cls: "bg-indigo-100 text-indigo-700" },
  { value: "FINAL", label: "Final round", cls: "bg-purple-100 text-purple-700" },
  { value: "OFFER", label: "Offer", cls: "bg-amber-100 text-amber-800" },
  { value: "BACKUP", label: "Backup", cls: "bg-orange-100 text-orange-700" },
  { value: "HIRED", label: "Hired", cls: "bg-emerald-100 text-emerald-700" },
  { value: "REJECTED", label: "Rejected", cls: "bg-red-100 text-red-600" },
  { value: "WITHDREW", label: "Withdrew", cls: "bg-zinc-100 text-zinc-500" },
];

/** Stages that are finished one way or the other (shown last, not counted as active). */
export const CLOSED_OFFICE_STAGES: readonly OfficeStage[] = ["HIRED", "REJECTED", "WITHDREW"];

export function isOfficeStage(v: unknown): v is OfficeStage {
  return typeof v === "string" && OFFICE_STAGES.some((s) => s.value === v);
}

export function officeStageMeta(stage: string | null | undefined) {
  return OFFICE_STAGES.find((s) => s.value === stage) ?? OFFICE_STAGES[0];
}

/**
 * The field-candidate `status` an office stage maps to. Kept in sync on every
 * stage change so the shared Paperwork / Onboarding / Signing tabs (which key
 * off status === "ONBOARDING") work for office hires, and so the denied-cron
 * and dashboard counts see a sensible value.
 */
export function statusForStage(stage: OfficeStage): string {
  switch (stage) {
    case "NEW":
    case "CONTACTING":
      return "APPLIED";
    case "HIRED":
      return "ONBOARDING";
    case "REJECTED":
    case "WITHDREW":
      return "DENIED";
    default:
      return "INTERVIEWING";
  }
}

export const HIRING_SOURCES = [
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "INDEED", label: "Indeed" },
  { value: "REFERRAL", label: "Referral" },
  { value: "WEBSITE", label: "Website" },
  { value: "OTHER", label: "Other" },
] as const;

export function hiringSourceLabel(v: string | null | undefined): string {
  return HIRING_SOURCES.find((s) => s.value === v)?.label ?? (v || "-");
}

export const WORK_MODES = [
  { value: "ON_SITE", label: "On site" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "REMOTE", label: "Remote" },
] as const;

export function workModeLabel(v: string | null | undefined): string {
  return WORK_MODES.find((m) => m.value === v)?.label ?? "";
}

export const OPENING_STATUSES = [
  { value: "OPEN", label: "Open", cls: "bg-emerald-100 text-emerald-700" },
  { value: "PAUSED", label: "Paused", cls: "bg-amber-100 text-amber-800" },
  { value: "FILLED", label: "Filled", cls: "bg-blue-100 text-blue-700" },
  { value: "CLOSED", label: "Closed", cls: "bg-gray-100 text-gray-500" },
] as const;

export function openingStatusMeta(v: string) {
  return OPENING_STATUSES.find((s) => s.value === v) ?? OPENING_STATUSES[3];
}

/** "$65k - $80k", "$65k+", "Up to $80k", or "" */
export function formatSalaryRange(minCents: number | null, maxCents: number | null): string {
  const k = (c: number) => {
    const d = c / 100;
    return d >= 1000 ? `$${Math.round(d / 1000)}k` : `$${d.toLocaleString("en-US")}`;
  };
  if (minCents != null && maxCents != null) return `${k(minCents)} - ${k(maxCents)}`;
  if (minCents != null) return `${k(minCents)}+`;
  if (maxCents != null) return `Up to ${k(maxCents)}`;
  return "";
}

/** "$240" or "$1,234.50" */
export function formatCost(cents: number | null | undefined): string {
  if (cents == null) return "-";
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", { minimumFractionDigits: d % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Digits only, US numbers without the leading 1, for duplicate matching. */
export function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Parses "$65,000", "65000", "65k" into cents. Returns null for blank, NaN for junk. */
export function parseDollarsToCents(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return NaN;
  return Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1) * 100);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type OpeningInput = {
  title?: string;
  department?: string | null;
  location?: string | null;
  workMode?: string | null;
  salaryMinCents?: number | null;
  salaryMaxCents?: number | null;
  status?: string;
  hiringManagerEmail?: string | null;
  description?: string | null;
};

/**
 * Validates an opening create/edit body. Only keys present in the body are
 * returned, so a PATCH can send just what changed. `requireTitle` is for create.
 */
export function parseOpeningInput(
  body: Record<string, unknown>,
  requireTitle: boolean,
): { data: OpeningInput; error: string | null } {
  const data: OpeningInput = {};
  const text = (k: string) => (body[k] == null ? null : String(body[k]).trim() || null);

  if (body.title !== undefined || requireTitle) {
    const title = text("title");
    if (!title) return { data, error: "Title is required" };
    data.title = title;
  }
  if (body.department !== undefined) data.department = text("department");
  if (body.location !== undefined) data.location = text("location");
  if (body.description !== undefined) data.description = text("description");
  if (body.hiringManagerEmail !== undefined) data.hiringManagerEmail = text("hiringManagerEmail")?.toLowerCase() ?? null;
  if (body.workMode !== undefined) {
    const v = text("workMode");
    if (v && !WORK_MODES.some((m) => m.value === v)) return { data, error: "Invalid work mode" };
    data.workMode = v;
  }
  if (body.status !== undefined) {
    const v = text("status");
    if (!v || !OPENING_STATUSES.some((s) => s.value === v)) return { data, error: "Invalid status" };
    data.status = v;
  }
  for (const [inKey, outKey] of [["salaryMin", "salaryMinCents"], ["salaryMax", "salaryMaxCents"]] as const) {
    if (body[inKey] === undefined) continue;
    const cents = parseDollarsToCents(body[inKey]);
    if (Number.isNaN(cents)) return { data, error: "Salary should be a number, like 65000 or 65k" };
    data[outKey] = cents;
  }
  if (data.salaryMinCents != null && data.salaryMaxCents != null && data.salaryMinCents > data.salaryMaxCents) {
    return { data, error: "Salary min is higher than max" };
  }
  return { data, error: null };
}

export type PostingInput = {
  source?: string;
  costCents?: number | null;
  applicantCount?: number | null;
  postedAt?: Date | null;
  notes?: string | null;
};

export function parsePostingInput(
  body: Record<string, unknown>,
  requireSource: boolean,
): { data: PostingInput; error: string | null } {
  const data: PostingInput = {};
  if (body.source !== undefined || requireSource) {
    const v = String(body.source ?? "").trim().toUpperCase();
    if (!HIRING_SOURCES.some((s) => s.value === v)) return { data, error: "Pick where it was posted" };
    data.source = v;
  }
  if (body.cost !== undefined) {
    const cents = parseDollarsToCents(body.cost);
    if (Number.isNaN(cents)) return { data, error: "Cost should be a number, like 240" };
    data.costCents = cents;
  }
  if (body.applicantCount !== undefined) {
    const raw = String(body.applicantCount ?? "").trim();
    const n = raw ? Number(raw) : null;
    if (n != null && (!Number.isInteger(n) || n < 0)) return { data, error: "Applicants should be a whole number" };
    data.applicantCount = n;
  }
  if (body.postedAt !== undefined) {
    const raw = String(body.postedAt ?? "").trim();
    // Date-only input, stored as UTC midnight like the other day labels.
    const d = raw ? new Date(`${raw.slice(0, 10)}T00:00:00.000Z`) : null;
    if (d && Number.isNaN(d.getTime())) return { data, error: "Invalid posted date" };
    data.postedAt = d;
  }
  if (body.notes !== undefined) data.notes = String(body.notes ?? "").trim() || null;
  return { data, error: null };
}
