/**
 * Sueep's own insurance policies and the certificate holders (GCs, property
 * managers) we make COIs for. COIs themselves are made in CoverDash; this
 * is what the ERP knows about them.
 */

import { centsToDollars } from "./money";
import { todayEasternKey, utcDateKey } from "./dates";

export const POLICY_TYPES = [
  { value: "GENERAL_LIABILITY", label: "General liability" },
  { value: "UMBRELLA", label: "Umbrella / excess" },
  { value: "AUTO", label: "Auto" },
  { value: "HIRED_NON_OWNED_AUTO", label: "Hired / non-owned auto" },
  { value: "WORKERS_COMP", label: "Workers' comp" },
  { value: "OTHER", label: "Other" },
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number]["value"];

export function isPolicyType(v: unknown): v is PolicyType {
  return POLICY_TYPES.some((t) => t.value === v);
}

export function policyTypeLabel(v: string): string {
  return POLICY_TYPES.find((t) => t.value === v)?.label ?? v;
}

/** What the main limit means for each policy type, for form labels. */
export function occurrenceLabel(type: string): string {
  if (type === "AUTO" || type === "HIRED_NON_OWNED_AUTO") return "Combined single limit";
  if (type === "WORKERS_COMP") return "Employer's liability, each accident";
  return "Each occurrence";
}

/** Same window as the workers' comp alert on the dashboard. */
export const EXPIRING_SOON_DAYS = 30;

export type ExpiryStatus = { status: "CURRENT" | "EXPIRING" | "EXPIRED"; daysLeft: number };

export function expiryStatus(expiresAt: Date, todayKey: string = todayEasternKey()): ExpiryStatus {
  const today = new Date(`${todayKey}T00:00:00.000Z`).getTime();
  const end = new Date(`${utcDateKey(expiresAt)}T00:00:00.000Z`).getTime();
  const daysLeft = Math.round((end - today) / 86_400_000);
  if (daysLeft < 0) return { status: "EXPIRED", daysLeft };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { status: "EXPIRING", daysLeft };
  return { status: "CURRENT", daysLeft };
}

/** "$1M", "$2.5M", or plain dollars for anything under a million. */
export function formatLimit(cents: number | null | undefined): string {
  if (cents == null) return "Not set";
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${+(dollars / 1_000_000).toFixed(2)}M`;
  return centsToDollars(cents).replace(/\.00$/, "");
}

export type PolicyForCheck = {
  policyType: string;
  carrier: string;
  active: boolean;
  eachOccurrenceCents: number | null;
  aggregateCents: number | null;
  blanketAdditionalInsured: boolean;
  waiverOfSubrogation: boolean;
  primaryNoncontributory: boolean;
  /** Usually on our COIs. Policies marked off are left out of the checks. */
  onCertificates?: boolean;
};

export type HolderRequirements = {
  reqGlOccurrenceCents: number | null;
  reqGlAggregateCents: number | null;
  reqAutoCents: number | null;
  reqUmbrellaCents: number | null;
  reqWcEmployersLiabilityCents: number | null;
  requiresAdditionalInsured: boolean;
  requiresWaiverOfSubrogation: boolean;
  requiresPrimaryNoncontributory: boolean;
};

function best(policies: PolicyForCheck[], type: string | string[], field: "eachOccurrenceCents" | "aggregateCents"): PolicyForCheck | null {
  const types = Array.isArray(type) ? type : [type];
  let top: PolicyForCheck | null = null;
  for (const p of policies) {
    if (!p.active || !types.includes(p.policyType) || p[field] == null) continue;
    if (!top || (p[field] ?? 0) > (top[field] ?? 0)) top = p;
  }
  return top;
}

/** Highest per-occurrence amount we can show: best GL plus best umbrella. */
export function maxCertifiableCents(policies: PolicyForCheck[]): number | null {
  const gl = best(policies, "GENERAL_LIABILITY", "eachOccurrenceCents")?.eachOccurrenceCents ?? null;
  const umb = best(policies, "UMBRELLA", "eachOccurrenceCents")?.eachOccurrenceCents ?? 0;
  return gl == null ? null : gl + umb;
}

export type RequirementCheck = { level: "gap" | "note"; text: string };

/**
 * Compares what a holder requires with our active policies. "gap" means our
 * coverage falls short and the broker needs to be involved; "note" means
 * it's covered but something specific has to go on the certificate.
 */
export function checkRequirements(req: HolderRequirements, policies: PolicyForCheck[]): RequirementCheck[] {
  const out: RequirementCheck[] = [];
  // Only what actually goes on our certificates (owned auto, for one, is
  // left off them by CoverDash).
  const active = policies.filter((p) => p.active && p.onCertificates !== false);
  const gl = best(active, "GENERAL_LIABILITY", "eachOccurrenceCents");
  const glAgg = best(active, "GENERAL_LIABILITY", "aggregateCents");
  const umb = best(active, "UMBRELLA", "eachOccurrenceCents");
  const umbAgg = best(active, "UMBRELLA", "aggregateCents");
  // Whichever auto policy has the higher limit. Our COIs list hired and
  // non-owned auto ($1M), not the owned auto policy.
  const auto = best(active, ["AUTO", "HIRED_NON_OWNED_AUTO"], "eachOccurrenceCents");
  const wc = best(active, "WORKERS_COMP", "eachOccurrenceCents");

  const glOcc = gl?.eachOccurrenceCents ?? 0;
  const umbOcc = umb?.eachOccurrenceCents ?? 0;
  let needsUmbrella = req.reqUmbrellaCents != null;

  if (req.reqGlOccurrenceCents != null) {
    if (req.reqGlOccurrenceCents > glOcc + umbOcc) {
      out.push({
        level: "gap",
        text: `Asks for ${formatLimit(req.reqGlOccurrenceCents)} per occurrence. The most we can certify is ${formatLimit(glOcc + umbOcc)} (general liability plus umbrella). Talk to the broker.`,
      });
    } else if (req.reqGlOccurrenceCents > glOcc) {
      needsUmbrella = true;
      out.push({
        level: "note",
        text: `Asks for ${formatLimit(req.reqGlOccurrenceCents)} per occurrence, more than general liability alone (${formatLimit(glOcc)}). Include the umbrella on the certificate.`,
      });
    }
  }

  if (req.reqGlAggregateCents != null) {
    const glA = glAgg?.aggregateCents ?? 0;
    const umbA = umbAgg?.aggregateCents ?? 0;
    if (req.reqGlAggregateCents > glA + umbA) {
      out.push({
        level: "gap",
        text: `Asks for a ${formatLimit(req.reqGlAggregateCents)} aggregate. The most we can certify is ${formatLimit(glA + umbA)}. Talk to the broker.`,
      });
    } else if (req.reqGlAggregateCents > glA) {
      needsUmbrella = true;
      out.push({
        level: "note",
        text: `Asks for a ${formatLimit(req.reqGlAggregateCents)} aggregate, more than general liability alone (${formatLimit(glA)}). Include the umbrella on the certificate.`,
      });
    }
  }

  if (req.reqAutoCents != null && req.reqAutoCents > (auto?.eachOccurrenceCents ?? 0)) {
    out.push({
      level: "gap",
      text: auto
        ? `Asks for ${formatLimit(req.reqAutoCents)} auto. Our ${policyTypeLabel(auto.policyType).toLowerCase()} policy (${auto.carrier}) is ${formatLimit(auto.eachOccurrenceCents)}.`
        : `Asks for ${formatLimit(req.reqAutoCents)} auto, and no active auto policy is on file.`,
    });
  }

  if (req.reqUmbrellaCents != null && req.reqUmbrellaCents > umbOcc) {
    out.push({
      level: "gap",
      text: umb
        ? `Asks for a ${formatLimit(req.reqUmbrellaCents)} umbrella. Ours (${umb.carrier}) is ${formatLimit(umbOcc)}.`
        : `Asks for a ${formatLimit(req.reqUmbrellaCents)} umbrella, and no active umbrella is on file.`,
    });
  }

  if (req.reqWcEmployersLiabilityCents != null && req.reqWcEmployersLiabilityCents > (wc?.eachOccurrenceCents ?? 0)) {
    out.push({
      level: "gap",
      text: wc
        ? `Asks for ${formatLimit(req.reqWcEmployersLiabilityCents)} employer's liability. Ours (${wc.carrier}) is ${formatLimit(wc.eachOccurrenceCents)}.`
        : `Asks for ${formatLimit(req.reqWcEmployersLiabilityCents)} employer's liability, and no active workers' comp policy is on file.`,
    });
  }

  // Which policies would be on their certificate, to check the wording
  // items against. GL always; the others only when they ask for them.
  const onCert: PolicyForCheck[] = [];
  if (gl) onCert.push(gl);
  if (needsUmbrella && umb) onCert.push(umb);
  if (req.reqAutoCents != null && auto) onCert.push(auto);
  const withWc = req.reqWcEmployersLiabilityCents != null && wc ? [...onCert, wc] : onCert;

  const missing = (list: PolicyForCheck[], field: "blanketAdditionalInsured" | "waiverOfSubrogation" | "primaryNoncontributory") =>
    list.filter((p) => !p[field]).map((p) => `${policyTypeLabel(p.policyType)} (${p.carrier})`);

  if (req.requiresAdditionalInsured) {
    const m = missing(onCert, "blanketAdditionalInsured");
    if (m.length) out.push({ level: "gap", text: `Requires additional insured, which ${m.join(", ")} does not include. Needs broker review.` });
  }
  if (req.requiresWaiverOfSubrogation) {
    const m = missing(withWc, "waiverOfSubrogation");
    if (m.length) out.push({ level: "gap", text: `Requires waiver of subrogation, which ${m.join(", ")} does not include. Needs broker review.` });
  }
  if (req.requiresPrimaryNoncontributory) {
    const m = missing(onCert, "primaryNoncontributory");
    if (m.length) out.push({ level: "gap", text: `Requires primary and noncontributory, which ${m.join(", ")} does not include. Needs broker review.` });
  }

  return out;
}

/** Short lines like "GL $1M / $2M" and "AI, Waiver" for what a holder requires. */
export function requirementSummary(h: HolderRequirements): string[] {
  const out: string[] = [];
  if (h.reqGlOccurrenceCents != null || h.reqGlAggregateCents != null) {
    out.push(`GL ${formatLimit(h.reqGlOccurrenceCents)} / ${formatLimit(h.reqGlAggregateCents)}`);
  }
  if (h.reqAutoCents != null) out.push(`Auto ${formatLimit(h.reqAutoCents)}`);
  if (h.reqUmbrellaCents != null) out.push(`Umbrella ${formatLimit(h.reqUmbrellaCents)}`);
  if (h.reqWcEmployersLiabilityCents != null) out.push(`EL ${formatLimit(h.reqWcEmployersLiabilityCents)}`);
  const wording = [
    h.requiresAdditionalInsured && "AI",
    h.requiresWaiverOfSubrogation && "Waiver",
    h.requiresPrimaryNoncontributory && "P&NC",
  ].filter(Boolean);
  if (wording.length) out.push(wording.join(", "));
  return out;
}

/** Lowercased name with punctuation and company suffixes removed, for spotting duplicates like "Harkins Builders, Inc." vs "Harkins Builders Inc". */
export function normalizeHolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,'"()]/g, " ")
    .replace(/\b(inc|llc|l l c|co|corp|corporation|company|ltd|lp|llp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
