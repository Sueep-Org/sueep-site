/**
 * Company Info page: the boss's "General information" sheet as cards of
 * label/value rows. Pure helpers shared by the page and its API routes.
 */

export const COMPANY_INFO_SECTIONS = [
  { id: "COMPANY", label: "Company", tab: "general" },
  { id: "OWNERSHIP", label: "Owners", tab: "general" },
  { id: "FEDERAL_IDS", label: "Federal IDs", tab: "general" },
  { id: "STATE_LOCAL_IDS", label: "State and city IDs", tab: "general" },
  { id: "LICENSES", label: "Licenses and registrations", tab: "general" },
  { id: "CERTIFICATIONS", label: "Certifications and safety", tab: "general" },
  { id: "CODES", label: "Industry codes", tab: "general" },
  { id: "CAPABILITIES", label: "What we do", tab: "general" },
  { id: "DOCUMENTS", label: "Documents and insurance", tab: "general" },
  { id: "FINANCIAL_OVERVIEW", label: "Company size", tab: "financial" },
  { id: "BANKING", label: "Banking", tab: "financial" },
] as const;

export type CompanyInfoSection = (typeof COMPANY_INFO_SECTIONS)[number]["id"];
export type CompanyInfoTab = (typeof COMPANY_INFO_SECTIONS)[number]["tab"];

export function sectionsForTab(tab: CompanyInfoTab) {
  return COMPANY_INFO_SECTIONS.filter((s) => s.tab === tab);
}

export function isCompanyInfoSection(v: unknown): v is CompanyInfoSection {
  return COMPANY_INFO_SECTIONS.some((s) => s.id === v);
}

/** What the browser gets for one row. A sensitive row never carries its
 * value, only a mask, until someone clicks Reveal. */
export type CompanyInfoRow = {
  id: string;
  section: CompanyInfoSection;
  label: string;
  value: string | null;
  sensitive: boolean;
  /** "•••• 4821" for a sensitive row with a value, else null */
  masked: string | null;
  comment: string | null;
  /** YYYY-MM-DD */
  expiresAt: string | null;
  updatedAt: string;
  updatedByEmail: string | null;
};

export type CompanyInfoInput = {
  section: CompanyInfoSection;
  label: string;
  /** undefined on a sensitive row means keep the stored value */
  value: string | null | undefined;
  sensitive: boolean;
  comment: string | null;
  expiresAt: Date | null;
};

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export function parseCompanyInfoBody(body: Record<string, unknown>): { data: CompanyInfoInput } | { error: string } {
  if (!isCompanyInfoSection(body.section)) return { error: "Pick a section." };
  const label = text(body.label);
  if (!label) return { error: "Name is required." };
  if (label.length > 120) return { error: "Name is too long." };

  let expiresAt: Date | null = null;
  const exp = text(body.expiresAt);
  if (exp) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return { error: "Expiration date is not a valid date." };
    expiresAt = new Date(`${exp}T00:00:00.000Z`);
    if (Number.isNaN(expiresAt.getTime())) return { error: "Expiration date is not a valid date." };
  }

  return {
    data: {
      section: body.section,
      label,
      value: body.value === undefined ? undefined : text(body.value),
      sensitive: body.sensitive === true,
      comment: text(body.comment),
      expiresAt,
    },
  };
}

/** Shown as a link when the value is a web address. */
export function asUrl(value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value;
  if (/^www\.[^\s]+\.[a-z]{2,}/i.test(value)) return `https://${value}`;
  return null;
}

// ---------- Financial tab ----------

export const COMPANY_DOC_KINDS = [
  { id: "PROFIT_LOSS", label: "Profit and loss" },
  { id: "BALANCE_SHEET", label: "Balance sheet" },
  { id: "OTHER", label: "Other" },
] as const;

export type CompanyDocKind = (typeof COMPANY_DOC_KINDS)[number]["id"];

export function isCompanyDocKind(v: unknown): v is CompanyDocKind {
  return COMPANY_DOC_KINDS.some((k) => k.id === v);
}

/** Yearly statements; everything else is OTHER with its own label. */
export function isYearlyDocKind(kind: CompanyDocKind): boolean {
  return kind === "PROFIT_LOSS" || kind === "BALANCE_SHEET";
}

export type CompanyDocumentRow = {
  id: string;
  kind: CompanyDocKind;
  year: number | null;
  label: string;
  /** Drive (or other) link; null for an uploaded file */
  linkUrl: string | null;
  filename: string | null;
  size: number | null;
  createdAt: string;
  uploadedByEmail: string | null;
};

export type FinancialYearRow = {
  id: string;
  year: number;
  annualVolumeCents: number | null;
  comment: string | null;
};

export const COMPANY_DOC_MAX_SIZE = 4 * 1024 * 1024;

const DOC_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/** PDFs, images, and the Excel/Word files P&Ls usually come in. Goes by
 * extension since browsers often send an empty or generic type. */
export function resolveCompanyDocMimeType(filename: string): string | null {
  return DOC_TYPE_BY_EXTENSION[filename.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}

export const YEAR_MIN = 2000;

export function parseYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  const max = new Date().getUTCFullYear() + 1;
  return Number.isInteger(n) && n >= YEAR_MIN && n <= max ? n : null;
}

export function parseLinkUrl(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return null;
  // Also takes a bare domain like "sam.gov" or "drive.google.com/...".
  const url = asUrl(t) ?? (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i.test(t) ? `https://${t}` : null);
  if (!url) return null;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

// ---------- Logins tab ----------

/** What the browser gets for a login: never the password, only whether one is stored. */
export type CompanyLoginRow = {
  id: string;
  name: string;
  url: string | null;
  username: string | null;
  hasPassword: boolean;
  /** ISO */
  passwordChangedAt: string | null;
  owner: string | null;
  notes: string | null;
  updatedAt: string;
  updatedByEmail: string | null;
};

export type CompanyLoginInput = {
  name: string;
  url: string | null;
  username: string | null;
  /** undefined keeps the stored password; null clears it */
  password: string | null | undefined;
  owner: string | null;
  notes: string | null;
};

export function parseCompanyLoginBody(body: Record<string, unknown>): { data: CompanyLoginInput } | { error: string } {
  const name = text(body.name);
  if (!name) return { error: "Site name is required." };
  if (name.length > 120) return { error: "Site name is too long." };
  const rawUrl = text(body.url);
  const url = rawUrl ? parseLinkUrl(rawUrl) : null;
  if (rawUrl && !url) return { error: "Website doesn't look like a web address. Start it with https:// or www." };

  let password: string | null | undefined;
  if (body.clearPassword === true) password = null;
  else if (typeof body.password === "string" && body.password !== "") password = body.password;
  else password = undefined;

  return { data: { name, url, username: text(body.username), password, owner: text(body.owner), notes: text(body.notes) } };
}

/** Access log entry for the admin-only Access log tab. */
export type AccessLogRow = {
  id: string;
  createdAt: string;
  targetType: "FIELD" | "LOGIN";
  label: string;
  action: "REVEAL" | "COPY";
  userEmail: string;
};
