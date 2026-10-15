/**
 * Client companies (property managers, general contractors, owners) and how
 * they want to be billed. Plain data and parsing only, so client components
 * can use it too. Server queries live in clientCompaniesServer.ts.
 */
import { parseLinkUrl } from "./companyInfo";

export const COMPANY_TYPES = ["PROPERTY_MANAGER", "GENERAL_CONTRACTOR", "OWNER"] as const;
export type CompanyType = (typeof COMPANY_TYPES)[number];
export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  PROPERTY_MANAGER: "Property manager",
  GENERAL_CONTRACTOR: "General contractor",
  OWNER: "Owner",
};

export const BILLING_METHODS = ["EMAIL", "REALPAGE_EMAIL", "PROCORE", "COUPA", "VENDOR_PORTAL", "OTHER"] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];
export const BILLING_METHOD_LABELS: Record<BillingMethod, string> = {
  EMAIL: "Email",
  REALPAGE_EMAIL: "RealPage email inbox",
  PROCORE: "Procore",
  COUPA: "Coupa",
  VENDOR_PORTAL: "Vendor portal",
  OTHER: "Other",
};
/** Methods where someone uploads the invoice to a website instead of emailing it. */
export const PORTAL_METHODS: readonly BillingMethod[] = ["PROCORE", "COUPA", "VENDOR_PORTAL"];

export const BILLING_FREQUENCIES = ["MONTHLY", "PER_JOB"] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export const BILLING_FREQUENCY_LABELS: Record<BillingFrequency, string> = {
  MONTHLY: "One invoice a month",
  PER_JOB: "Per job",
};

export function isCompanyType(v: unknown): v is CompanyType {
  return typeof v === "string" && (COMPANY_TYPES as readonly string[]).includes(v);
}
export function isBillingMethod(v: unknown): v is BillingMethod {
  return typeof v === "string" && (BILLING_METHODS as readonly string[]).includes(v);
}
export function isBillingFrequency(v: unknown): v is BillingFrequency {
  return typeof v === "string" && (BILLING_FREQUENCIES as readonly string[]).includes(v);
}

/** For pickers: "Jefferson Apartment Group (JAG)", so typing an alias finds it. */
export function companyOptionLabel(c: { name: string; aliases: string[]; archived?: boolean }): string {
  const aka = c.aliases.length ? ` (${c.aliases.join(", ")})` : "";
  return `${c.name}${aka}${c.archived ? " [archived]" : ""}`;
}

/** Case and punctuation blind, so "Ingerman Group" and "ingerman  group." match. */
export function normalizeCompanyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function companyMatchesQuery(c: { name: string; aliases: string[] }, query: string): boolean {
  const q = normalizeCompanyName(query);
  if (!q) return true;
  return [c.name, ...c.aliases].some((n) => normalizeCompanyName(n).includes(q));
}

// ── Rows sent to the browser ────────────────────────────────────────────

export type CompanyListRow = {
  id: string;
  name: string;
  type: CompanyType;
  aliases: string[];
  archived: boolean;
  billingMethod: BillingMethod | null;
  buildingCount: number;
  projectCount: number;
};

export type BillingProfile = {
  billingMethod: BillingMethod | null;
  billingPortalUrl: string | null;
  billingSendTo: string[];
  billingCc: string[];
  billingCutoffDay: number | null;
  billingCutoffNote: string | null;
  billingFrequency: BillingFrequency | null;
  paymentTermsDays: number | null;
  billingInstructions: string | null;
};

export type CompanyContactRow = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

/** Building or project billing overrides. Each one set wins over the level above. */
export type BillingOverride = {
  method: BillingMethod | null;
  portalUrl: string | null;
  sendTo: string[];
  cc: string[];
  note: string | null;
};

export const EMPTY_OVERRIDE: BillingOverride = { method: null, portalUrl: null, sendTo: [], cc: [], note: null };

export function hasOverride(o: BillingOverride): boolean {
  return !!(o.method || o.portalUrl || o.sendTo.length || o.cc.length || o.note);
}

// ── Parsing ─────────────────────────────────────────────────────────────

function text(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Accepts an array or a comma/semicolon/newline separated string. Drops blanks and duplicates. */
function list(v: unknown): string[] {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  for (const p of parts) {
    const t = typeof p === "string" ? p.trim() : "";
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailList(v: unknown, label: string): { value: string[] } | { error: string } {
  const emails = list(v);
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  return bad ? { error: `${label}: "${bad}" isn't an email address.` } : { value: emails };
}

function optionalInt(v: unknown, label: string, min: number, max: number): { value: number | null } | { error: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { error: `${label} must be a whole number from ${min} to ${max}.` };
  return { value: n };
}

function portalUrl(v: unknown): { value: string | null } | { error: string } {
  const raw = text(v);
  if (!raw) return { value: null };
  const url = parseLinkUrl(raw);
  return url ? { value: url } : { error: "Portal link doesn't look like a web address." };
}

export type CompanyInput = {
  name: string;
  type: CompanyType;
  aliases: string[];
  notes: string | null;
  archived: boolean;
} & BillingProfile;

export function parseCompanyBody(body: Record<string, unknown>): { data: CompanyInput } | { error: string } {
  const name = text(body.name, 200);
  if (!name) return { error: "Name is required." };
  if (!isCompanyType(body.type)) return { error: "Pick a company type." };
  if (body.billingMethod != null && body.billingMethod !== "" && !isBillingMethod(body.billingMethod)) return { error: "Pick a billing method." };
  if (body.billingFrequency != null && body.billingFrequency !== "" && !isBillingFrequency(body.billingFrequency)) return { error: "Pick how often they're billed." };

  const sendTo = emailList(body.billingSendTo, "Send to");
  if ("error" in sendTo) return sendTo;
  const cc = emailList(body.billingCc, "Cc");
  if ("error" in cc) return cc;
  const cutoff = optionalInt(body.billingCutoffDay, "Cutoff day", 1, 31);
  if ("error" in cutoff) return cutoff;
  const terms = optionalInt(body.paymentTermsDays, "Payment terms", 0, 365);
  if ("error" in terms) return terms;
  const url = portalUrl(body.billingPortalUrl);
  if ("error" in url) return url;

  return {
    data: {
      name,
      type: body.type,
      aliases: list(body.aliases).filter((a) => a.toLowerCase() !== name.toLowerCase()),
      notes: text(body.notes),
      archived: body.archived === true,
      billingMethod: isBillingMethod(body.billingMethod) ? body.billingMethod : null,
      billingPortalUrl: url.value,
      billingSendTo: sendTo.value,
      billingCc: cc.value,
      billingCutoffDay: cutoff.value,
      billingCutoffNote: text(body.billingCutoffNote, 500),
      billingFrequency: isBillingFrequency(body.billingFrequency) ? body.billingFrequency : null,
      paymentTermsDays: terms.value,
      billingInstructions: text(body.billingInstructions),
    },
  };
}

export function parseContactBody(body: Record<string, unknown>): { data: Omit<CompanyContactRow, "id"> } | { error: string } {
  const name = text(body.name, 200);
  if (!name) return { error: "Name is required." };
  const email = text(body.email, 200);
  if (email && !EMAIL_RE.test(email)) return { error: "That email doesn't look right." };
  return { data: { name, role: text(body.role, 200), email, phone: text(body.phone, 50), notes: text(body.notes) } };
}

export function parseOverrideBody(body: Record<string, unknown>): { data: BillingOverride } | { error: string } {
  if (body.method != null && body.method !== "" && !isBillingMethod(body.method)) return { error: "Pick a billing method." };
  const sendTo = emailList(body.sendTo, "Send to");
  if ("error" in sendTo) return sendTo;
  const cc = emailList(body.cc, "Cc");
  if ("error" in cc) return cc;
  const url = portalUrl(body.portalUrl);
  if ("error" in url) return url;
  return {
    data: {
      method: isBillingMethod(body.method) ? body.method : null,
      portalUrl: url.value,
      sendTo: sendTo.value,
      cc: cc.value,
      note: text(body.note),
    },
  };
}

/** Override columns on Building and Project, from a parsed override. */
export function overrideColumns(o: BillingOverride) {
  return {
    billingOverrideMethod: o.method,
    billingOverridePortalUrl: o.portalUrl,
    billingOverrideSendTo: o.sendTo,
    billingOverrideCc: o.cc,
    billingOverrideNote: o.note,
  };
}

/** The reverse of overrideColumns, for rows read from Building or Project. */
export function overrideFromColumns(r: {
  billingOverrideMethod: string | null;
  billingOverridePortalUrl: string | null;
  billingOverrideSendTo: string[];
  billingOverrideCc: string[];
  billingOverrideNote: string | null;
}): BillingOverride {
  return {
    method: isBillingMethod(r.billingOverrideMethod) ? r.billingOverrideMethod : null,
    portalUrl: r.billingOverridePortalUrl,
    sendTo: r.billingOverrideSendTo,
    cc: r.billingOverrideCc,
    note: r.billingOverrideNote,
  };
}
