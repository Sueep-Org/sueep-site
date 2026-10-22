/**
 * Change order (CO) pricing package, per building. Subs pick from these
 * issues when they request a CO on a turnover; each issue has what we
 * charge the property manager and what we pay the sub. Saved on
 * Building.coPricingPackage; null means the building uses
 * DEFAULT_CO_PRICING_PACKAGE. Client-safe (no prisma).
 *
 * Prices are dollars, like the regular turnover pricing package.
 */

export type CoIssuePer = "room" | "unit" | "spot" | "load" | "each";

export const CO_ISSUE_PERS: CoIssuePer[] = ["room", "unit", "spot", "load", "each"];

export const CO_ISSUE_PER_LABELS: Record<CoIssuePer, { en: string; es: string }> = {
  room: { en: "per room", es: "por habitación" },
  unit: { en: "per unit", es: "por unidad" },
  spot: { en: "per spot", es: "por área" },
  load: { en: "per load", es: "por carga" },
  each: { en: "each", es: "cada uno" },
};

export type CoIssue = {
  /** Stable id, so renaming the label later doesn't orphan old requests. */
  id: string;
  label: string;
  /** Shown to subs whose language is Spanish. Falls back to label. */
  labelEs: string;
  per: CoIssuePer;
  /** What we charge the property manager, in dollars. */
  charge: number;
  /** What we pay the sub, in dollars. */
  subPay: number;
  /** Off hides it from subs but keeps it in the package. */
  active: boolean;
};

export type CoSurchargeId = "next-day" | "weekend";

export const CO_SURCHARGE_IDS: CoSurchargeId[] = ["next-day", "weekend"];

export type CoSurcharge = {
  id: CoSurchargeId;
  label: string;
  labelEs: string;
  /** Added on top of both the charge and the sub pay, 0 to 200. */
  percent: number;
  active: boolean;
};

export type CoPricingPackage = {
  issues: CoIssue[];
  surcharges: CoSurcharge[];
};

/** Built from past turnover COs (2026-10-22). Sub pay is about half the charge. */
export const DEFAULT_CO_PRICING_PACKAGE: CoPricingPackage = {
  issues: [
    { id: "extra-coat-room", label: "Additional coat of paint, one room", labelEs: "Capa adicional de pintura, una habitación", per: "room", charge: 150, subPay: 75, active: true },
    { id: "extra-coat-unit", label: "Additional coat of paint, whole unit", labelEs: "Capa adicional de pintura, unidad completa", per: "unit", charge: 200, subPay: 100, active: true },
    { id: "different-color", label: "Different color", labelEs: "Color diferente", per: "room", charge: 150, subPay: 75, active: true },
    { id: "different-finish", label: "Different paint finish (e.g. flat to semigloss)", labelEs: "Acabado de pintura diferente (ej. mate a semibrillante)", per: "room", charge: 150, subPay: 75, active: true },
    { id: "wall-repair-small", label: "Wall repair, small (nail holes, dents, up to fist size)", labelEs: "Reparación de pared, pequeña (agujeros de clavos, golpes, hasta el tamaño de un puño)", per: "spot", charge: 100, subPay: 50, active: true },
    { id: "wall-repair-medium", label: "Wall repair, medium (up to about 1 sq ft)", labelEs: "Reparación de pared, mediana (hasta 1 pie cuadrado aprox.)", per: "spot", charge: 200, subPay: 100, active: true },
    { id: "wall-repair-large", label: "Wall repair, large (bigger than 1 sq ft, drywall patch)", labelEs: "Reparación de pared, grande (más de 1 pie cuadrado, parche de drywall)", per: "spot", charge: 500, subPay: 250, active: true },
    { id: "deep-clean", label: "Extensive deep clean", labelEs: "Limpieza profunda extensa", per: "unit", charge: 150, subPay: 75, active: true },
    { id: "trash-removal", label: "Trash removal", labelEs: "Retiro de basura", per: "load", charge: 100, subPay: 50, active: true },
    { id: "carpet-clean", label: "Carpet clean", labelEs: "Limpieza de alfombra", per: "unit", charge: 100, subPay: 50, active: true },
  ],
  surcharges: [
    { id: "next-day", label: "Next day", labelEs: "Día siguiente", percent: 25, active: true },
    { id: "weekend", label: "Weekend", labelEs: "Fin de semana", percent: 50, active: true },
  ],
};

/** Slug the label plus a short random suffix so two issues never share an id. */
export function makeCoIssueId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "issue"}-${Math.random().toString(36).slice(2, 7)}`;
}

function readDollars(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function readIssues(value: unknown): CoIssue[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry): CoIssue[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const label = String(raw.label ?? "").trim().slice(0, 200);
    if (!label) return [];
    let id = String(raw.id ?? "").trim().slice(0, 80) || makeCoIssueId(label);
    if (seen.has(id)) id = makeCoIssueId(label);
    seen.add(id);
    const per = CO_ISSUE_PERS.includes(raw.per as CoIssuePer) ? (raw.per as CoIssuePer) : "each";
    return [
      {
        id,
        label,
        labelEs: String(raw.labelEs ?? "").trim().slice(0, 200),
        per,
        charge: readDollars(raw.charge),
        subPay: readDollars(raw.subPay),
        active: raw.active !== false,
      },
    ];
  });
}

function readSurcharges(value: unknown): CoSurcharge[] {
  const saved = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  // Always exactly the known surcharges, in order; saved values override the defaults.
  return DEFAULT_CO_PRICING_PACKAGE.surcharges.map((fallback) => {
    const raw = saved.find((s) => s && typeof s === "object" && s.id === fallback.id);
    if (!raw) return { ...fallback };
    const percent = Number(raw.percent);
    return {
      ...fallback,
      percent: Number.isFinite(percent) ? Math.min(200, Math.max(0, Math.round(percent * 100) / 100)) : fallback.percent,
      active: raw.active !== false,
    };
  });
}

/** Clean up a saved or posted package. Null/invalid gives the default. An
 * explicit empty issues list is kept (the building removed every issue). */
export function sanitizeCoPricingPackage(value: unknown): CoPricingPackage {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_CO_PRICING_PACKAGE);
  const raw = value as Record<string, unknown>;
  return {
    issues: raw.issues !== undefined ? readIssues(raw.issues) : structuredClone(DEFAULT_CO_PRICING_PACKAGE.issues),
    surcharges: readSurcharges(raw.surcharges),
  };
}

/** The package a building uses: its own if saved, otherwise the default. */
export function getCoPricingPackage(saved: unknown): CoPricingPackage {
  return sanitizeCoPricingPackage(saved);
}

export function coIssueLabel(issue: Pick<CoIssue, "label" | "labelEs">, lang: "en" | "es"): string {
  return lang === "es" && issue.labelEs ? issue.labelEs : issue.label;
}
