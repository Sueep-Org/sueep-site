/** Request body parsing for the insurance policy and COI holder routes. */

import { inputToCents } from "./money";
import { isPolicyType } from "./insurance";

type Body = Record<string, unknown>;

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function day(v: unknown): Date | null | "invalid" {
  const t = text(v);
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "invalid";
  const d = new Date(`${t}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? "invalid" : d;
}

function money(body: Body, key: string): number | null | "invalid" {
  const v = body[key];
  if (v == null || v === "") return null;
  const c = inputToCents(v);
  return c == null || c < 0 ? "invalid" : c;
}

const MONEY_LABELS: Record<string, string> = {
  eachOccurrenceCents: "Main limit",
  aggregateCents: "Aggregate",
  reqGlOccurrenceCents: "Required per occurrence",
  reqGlAggregateCents: "Required aggregate",
  reqAutoCents: "Required auto",
  reqUmbrellaCents: "Required umbrella",
  reqWcEmployersLiabilityCents: "Required employer's liability",
};

function moneyFields<K extends string>(body: Body, keys: K[]): { data: Record<K, number | null> } | { error: string } {
  const data = {} as Record<K, number | null>;
  for (const k of keys) {
    const c = money(body, k);
    if (c === "invalid") return { error: `${MONEY_LABELS[k] ?? k} must be a dollar amount` };
    data[k] = c;
  }
  return { data };
}

/** Premium, audit, and cancel date: the same on a policy's current term and its past terms. */
type CostFields = { premiumCents: number | null; auditAdjustmentCents: number | null; auditDate: Date | null; cancelledOn: Date | null };

function parseCostFields(body: Body, effectiveDate: Date | null, expiresAt: Date): { data: CostFields } | { error: string } {
  const premium = money(body, "premiumCents");
  if (premium === "invalid") return { error: "Premium must be a dollar amount" };
  // An audit can be a refund, so negative is fine here.
  const rawAudit = body.auditAdjustmentCents;
  const audit = rawAudit == null || rawAudit === "" ? null : inputToCents(rawAudit);
  if (rawAudit != null && rawAudit !== "" && audit == null) return { error: "Audit amount must be a dollar amount (negative for a refund)" };
  const auditDate = day(body.auditDate);
  if (auditDate === "invalid") return { error: "Audit date is not a valid date" };
  if (audit && !auditDate) return { error: "Add the date of the audit bill or refund" };
  const cancelledOn = day(body.cancelledOn);
  if (cancelledOn === "invalid") return { error: "Cancelled date is not a valid date" };
  if (cancelledOn && (cancelledOn > expiresAt || (effectiveDate && cancelledOn < effectiveDate))) {
    return { error: "Cancelled date has to be within the policy dates" };
  }
  return {
    data: { premiumCents: premium, auditAdjustmentCents: audit || null, auditDate: audit ? auditDate : null, cancelledOn },
  };
}

export function parsePolicyBody(body: Body) {
  if (!isPolicyType(body.policyType)) return { error: "Pick a policy type" } as const;
  const carrier = text(body.carrier);
  if (!carrier) return { error: "Carrier is required" } as const;
  const expiresAt = day(body.expiresAt);
  if (!expiresAt || expiresAt === "invalid") return { error: "Expiration date is required" } as const;
  const effectiveDate = day(body.effectiveDate);
  if (effectiveDate === "invalid") return { error: "Effective date is not a valid date" } as const;
  if (effectiveDate && effectiveDate > expiresAt) return { error: "Effective date is after the expiration date" } as const;
  const limits = moneyFields(body, ["eachOccurrenceCents", "aggregateCents"]);
  if ("error" in limits) return limits;
  const cost = parseCostFields(body, effectiveDate, expiresAt);
  if ("error" in cost) return { error: cost.error } as const;

  return {
    data: {
      ...cost.data,
      policyType: body.policyType,
      carrier,
      policyNumber: text(body.policyNumber),
      effectiveDate,
      expiresAt,
      ...limits.data,
      aggregatePerProject: body.aggregatePerProject === true,
      otherLimits: text(body.otherLimits),
      blanketAdditionalInsured: body.blanketAdditionalInsured === true,
      waiverOfSubrogation: body.waiverOfSubrogation === true,
      primaryNoncontributory: body.primaryNoncontributory === true,
      notes: text(body.notes),
      active: body.active !== false,
      onCertificates: body.onCertificates !== false,
    },
  } as const;
}

/** A past policy term: its own dates plus the same cost fields. */
export function parseTermBody(body: Body) {
  const expiresAt = day(body.expiresAt);
  if (!expiresAt || expiresAt === "invalid") return { error: "Expiration date is required" } as const;
  const effectiveDate = day(body.effectiveDate);
  if (effectiveDate === "invalid") return { error: "Effective date is not a valid date" } as const;
  if (effectiveDate && effectiveDate > expiresAt) return { error: "Effective date is after the expiration date" } as const;
  const cost = parseCostFields(body, effectiveDate, expiresAt);
  if ("error" in cost) return { error: cost.error } as const;
  return { data: { effectiveDate, expiresAt, ...cost.data } } as const;
}

export function parseHolderBody(body: Body) {
  const name = text(body.name);
  if (!name) return { error: "Name is required" } as const;
  const email = text(body.contactEmail);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "Contact email is not valid" } as const;
  const reqs = moneyFields(body, [
    "reqGlOccurrenceCents",
    "reqGlAggregateCents",
    "reqAutoCents",
    "reqUmbrellaCents",
    "reqWcEmployersLiabilityCents",
  ]);
  if ("error" in reqs) return reqs;

  const aliases = (Array.isArray(body.aliases) ? body.aliases : typeof body.aliases === "string" ? body.aliases.split("\n") : [])
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter((a, i, all) => a && a !== name && all.indexOf(a) === i);

  return {
    data: {
      name,
      aliases,
      address: text(body.address),
      contactName: text(body.contactName),
      contactEmail: email,
      contactPhone: text(body.contactPhone),
      ...reqs.data,
      requiresAdditionalInsured: body.requiresAdditionalInsured === true,
      requiresWaiverOfSubrogation: body.requiresWaiverOfSubrogation === true,
      requiresPrimaryNoncontributory: body.requiresPrimaryNoncontributory === true,
      additionalInsureds: text(body.additionalInsureds),
      specialWording: text(body.specialWording),
      notes: text(body.notes),
      archived: body.archived === true,
    },
  } as const;
}

export type InsuranceContactInput = {
  name: string;
  company: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export function parseContactBody(body: Body): { data: InsuranceContactInput } | { error: string } {
  const name = text(body.name);
  if (!name) return { error: "Name is required." };
  const email = text(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email doesn't look right." };
  return {
    data: { name, company: text(body.company), role: text(body.role), email, phone: text(body.phone), notes: text(body.notes) },
  };
}
