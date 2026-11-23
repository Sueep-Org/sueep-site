import { prisma } from "@/lib/prisma";
import {
  clientChangeOrderPrice,
  deriveChangeOrderSupervisorCount,
  getChangeOrderLaborRates,
  hasCustomChangeOrderLaborRate,
} from "@/lib/changeOrderLaborRates";
import { loadPricingSettings } from "@/lib/pricingSettingsServer";
import { fillChangeOrderContractPdf, lockContractFieldsExceptSigning } from "@/lib/contracts/fillChangeOrderPdf";

import { DEFAULT_PURCHASE_TERMS } from "@/lib/contracts/changeOrderTerms";

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export type ChangeOrderContractInput = {
  projectId: string;
  coTitle: string;
  coDescription?: string;
  coEstimatedStartDate?: string;
  /** Last day of the work; left out for one day */
  coEstimatedEndDate?: string;
  coCleanerCount?: string;
  clientCompany: string;
  clientAddress: string;
  requesterName: string;
  requesterEmail: string;
};

export type ChangeOrderContractResult =
  | { ok: true; pdfBytes: Uint8Array }
  | { ok: false; error: string; status: number };

/** Shared by the unsigned-preview endpoint (/api/co-request-contract-pdf)
 * and the final signed-submit endpoint (/api/external/project-requests) —
 * both need the exact same field mapping and price recomputation, just at
 * different points in the "review, then sign" flow. */
export async function generateChangeOrderContractPdf(
  input: ChangeOrderContractInput,
): Promise<ChangeOrderContractResult> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { jobTitle: true, laborRateCard: true },
  });
  if (!project) return { ok: false, error: "Project not found", status: 404 };

  // Same "is this project priced at all" gate the request form itself uses
  // (see hasCustomChangeOrderLaborRate). This only makes sense once a real
  // price is on screen, so refuse rather than generate a $0 contract.
  const cleanerCount = Math.max(0, Math.round(Number(input.coCleanerCount) || 0));
  if (!hasCustomChangeOrderLaborRate(project.laborRateCard) || cleanerCount <= 0) {
    return {
      ok: false,
      error: "This project isn't priced yet. The change order will be sent for signature once Sueep prices it.",
      status: 400,
    };
  }

  const supervisorCount = deriveChangeOrderSupervisorCount(cleanerCount);
  const pricing = await loadPricingSettings();
  const rates = getChangeOrderLaborRates(project.laborRateCard, pricing.coPriceRates);
  // One day of labor per day of the range; only today/tomorrow days get the next day upcharge, same as the form showed
  const price = clientChangeOrderPrice({ cleanerCount, supervisorCount }, rates, {
    startKey: input.coEstimatedStartDate,
    endKey: input.coEstimatedEndDate,
    coDayHours: pricing.coDayHours,
    nextDayPct: pricing.nextDayPct,
  });
  const upchargeNote =
    price.upchargeCents > 0
      ? `Total includes a ${pricing.nextDayPct}% next day upcharge (${formatAmount(price.upchargeCents)})${price.days > 1 ? ` on ${price.upchargeDays} of ${price.days} days (today or tomorrow)` : ""}.`
      : "";
  const scopeDescription = [input.coDescription ?? "", upchargeNote].filter(Boolean).join("\n\n");

  const today = new Date();
  const expires = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    const pdfBytes = await fillChangeOrderContractPdf({
      changeOrderTitle: input.coTitle,
      referenceNumber: Date.now().toString(36).toUpperCase(),
      projectName: project.jobTitle,
      clientCompany: input.clientCompany,
      clientAddress: input.clientAddress,
      requesterName: input.requesterName,
      requesterEmail: input.requesterEmail,
      dateCreated: formatDate(today),
      dateExpires: formatDate(expires),
      startDate: input.coEstimatedStartDate,
      scopeDescription,
      numCleaners: String(cleanerCount),
      numForemen: String(supervisorCount),
      // One flat day (PricingSettings.coDayHours) per day of the range
      numDays: String(price.days),
      cleanerRate: formatAmount(rates.cleanerHourlyRateCents),
      foremanRate: formatAmount(rates.foremanHourlyRateCents),
      subtotal: formatAmount(price.subtotalCents),
      total: formatAmount(price.totalCents),
      purchaseTerms: DEFAULT_PURCHASE_TERMS,
    });
    return { ok: true, pdfBytes };
  } catch (e) {
    console.error("Failed to fill change order contract PDF:", e);
    return { ok: false, error: "Contract could not be prepared. Please try again.", status: 500 };
  }
}

export type ManualChangeOrderContractInput = {
  projectId: string;
  coTitle: string;
  scopeDescription: string;
  /** YYYY-MM-DD */
  startDateKey?: string;
  /** YYYY-MM-DD, last day of the work; with "rates" it sets the number of days */
  endDateKey?: string;
  clientCompany: string;
  clientAddress: string;
  recipientName: string;
  recipientEmail: string;
  /**
   * "rates": priced like the request page (cleaners and foremen x the
   * project's rates x one day per date in the range, plus the next day
   * surcharge); cleaners are required. "price": totalCents as typed, and the
   * crew lines only when filled in. "hourly": no total, just the hourly
   * rate(s) (cleanerRateCents required, foremanRateCents optional), billed
   * for the hours actually worked; crew lines only when filled in.
   */
  mode: "rates" | "price" | "hourly";
  totalCents?: number | null;
  cleaners?: number | null;
  foremen?: number | null;
  days?: number | null;
  /** "rates": hourly rates typed on the form for this contract (else the project's, else the company's). "hourly": the rates billed. */
  cleanerRateCents?: number | null;
  foremanRateCents?: number | null;
  referenceNumber: string;
  /** Purchase Terms as edited on the form; blank uses the default terms */
  purchaseTerms?: string;
};

export type ManualChangeOrderContractResult =
  | { ok: true; pdfBytes: Uint8Array; totalCents: number | null; rateSummary: string | null }
  | { ok: false; error: string; status: number };

/**
 * A contract a PM makes on the change order itself (Create contract), not
 * through the client's request link. Same PDF as generateChangeOrderContractPdf,
 * priced either by the project's rates (same math as the request page) or by
 * a price the PM types. Fields other than the signature ones are locked.
 */
export async function generateManualChangeOrderContractPdf(input: ManualChangeOrderContractInput): Promise<ManualChangeOrderContractResult> {
  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { jobTitle: true, laborRateCard: true } });
  if (!project) return { ok: false, error: "Project not found", status: 404 };
  const count = (n: number | null | undefined) => (n && n > 0 ? String(Math.round(n)) : "");

  let crew: { numCleaners: string; numForemen: string; numDays: string; cleanerRate: string; foremanRate: string; subtotal: string; total: string };
  let totalCents: number | null;
  let rateSummary: string | null = null;
  let scopeDescription = input.scopeDescription;
  if (input.mode === "rates") {
    const cleaners = Math.max(0, Math.round(Number(input.cleaners) || 0));
    if (cleaners <= 0) return { ok: false, error: "Enter the number of cleaners to price by rates.", status: 400 };
    const foremen =
      input.foremen !== null && input.foremen !== undefined && Number.isFinite(Number(input.foremen))
        ? Math.max(0, Math.round(Number(input.foremen)))
        : deriveChangeOrderSupervisorCount(cleaners);
    const pricing = await loadPricingSettings();
    const base = getChangeOrderLaborRates(project.laborRateCard, pricing.coPriceRates);
    const typed = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
    // Rates typed on the form win for this contract only; nothing is saved to the project.
    const rates = {
      cleanerHourlyRateCents: typed(input.cleanerRateCents) ?? base.cleanerHourlyRateCents,
      foremanHourlyRateCents: typed(input.foremanRateCents) ?? base.foremanHourlyRateCents,
    };
    const price = clientChangeOrderPrice({ cleanerCount: cleaners, supervisorCount: foremen }, rates, {
      startKey: input.startDateKey,
      endKey: input.endDateKey,
      coDayHours: pricing.coDayHours,
      nextDayPct: pricing.nextDayPct,
    });
    if (price.upchargeCents > 0) {
      scopeDescription = [
        scopeDescription,
        `Total includes a ${pricing.nextDayPct}% next day upcharge (${formatAmount(price.upchargeCents)})${price.days > 1 ? ` on ${price.upchargeDays} of ${price.days} days (today or tomorrow)` : ""}.`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    totalCents = price.totalCents;
    crew = {
      numCleaners: String(cleaners),
      numForemen: String(foremen),
      numDays: String(price.days),
      cleanerRate: formatAmount(rates.cleanerHourlyRateCents),
      foremanRate: formatAmount(rates.foremanHourlyRateCents),
      subtotal: formatAmount(price.subtotalCents),
      total: formatAmount(price.totalCents),
    };
  } else if (input.mode === "hourly") {
    const rate = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
    const cleanerRate = rate(input.cleanerRateCents);
    const foremanRate = rate(input.foremanRateCents);
    if (!cleanerRate) return { ok: false, error: "Enter the hourly rate.", status: 400 };
    totalCents = null;
    rateSummary = foremanRate
      ? `$${formatAmount(cleanerRate)}/hr per cleaner and $${formatAmount(foremanRate)}/hr per foreman`
      : `$${formatAmount(cleanerRate)}/hr`;
    scopeDescription = [scopeDescription, `Billed at ${rateSummary} for the hours actually worked.`].filter(Boolean).join("\n\n");
    crew = {
      numCleaners: count(input.cleaners),
      numForemen: count(input.foremen),
      numDays: count(input.days),
      cleanerRate: formatAmount(cleanerRate),
      foremanRate: foremanRate ? formatAmount(foremanRate) : "",
      subtotal: "Billed hourly",
      total: "Billed hourly",
    };
  } else {
    totalCents = Math.round(Number(input.totalCents));
    if (!Number.isFinite(totalCents) || totalCents <= 0) return { ok: false, error: "Enter the contract price.", status: 400 };
    crew = {
      numCleaners: count(input.cleaners),
      numForemen: count(input.foremen),
      numDays: count(input.days),
      cleanerRate: "",
      foremanRate: "",
      subtotal: formatAmount(totalCents),
      total: formatAmount(totalCents),
    };
  }

  const today = new Date();
  const expires = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  try {
    const pdfBytes = await fillChangeOrderContractPdf({
      changeOrderTitle: input.coTitle,
      referenceNumber: input.referenceNumber,
      projectName: project.jobTitle,
      clientCompany: input.clientCompany,
      clientAddress: input.clientAddress,
      requesterName: input.recipientName,
      requesterEmail: input.recipientEmail,
      dateCreated: formatDate(today),
      dateExpires: formatDate(expires),
      startDate: input.startDateKey ? formatDate(new Date(`${input.startDateKey}T12:00:00Z`)) : undefined,
      scopeDescription,
      ...crew,
      purchaseTerms: input.purchaseTerms?.trim() || DEFAULT_PURCHASE_TERMS,
    });
    // Emailed to sign in their own PDF app: only signature, printed name and date stay editable.
    return { ok: true, pdfBytes: await lockContractFieldsExceptSigning(pdfBytes), totalCents, rateSummary };
  } catch (e) {
    console.error("Failed to fill manual change order contract PDF:", e);
    return { ok: false, error: "Contract could not be prepared. Please try again.", status: 500 };
  }
}
