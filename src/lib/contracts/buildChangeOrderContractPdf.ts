import { prisma } from "@/lib/prisma";
import {
  computeChangeOrderLaborEstimate,
  deriveChangeOrderSupervisorCount,
  getChangeOrderLaborRates,
  hasCustomChangeOrderLaborRate,
  CHANGE_ORDER_ESTIMATE_DAY_HOURS,
} from "@/lib/changeOrderLaborRates";
import { fillChangeOrderContractPdf } from "@/lib/contracts/fillChangeOrderPdf";

const DEFAULT_PURCHASE_TERMS =
  "Payment due within 30 days of invoice date. This change order is governed by the terms of the original service agreement between Sueep LLC and the client.";

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
  const rates = getChangeOrderLaborRates(project.laborRateCard);
  const estimate = computeChangeOrderLaborEstimate(
    { cleanerCount, supervisorCount, hours: CHANGE_ORDER_ESTIMATE_DAY_HOURS },
    rates,
  );

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
      scopeDescription: input.coDescription ?? "",
      numCleaners: String(cleanerCount),
      numForemen: String(supervisorCount),
      // Every change order priced through this flow is a flat one-day
      // estimate (see CHANGE_ORDER_ESTIMATE_DAY_HOURS /
      // computeChangeOrderLaborEstimate). There's no separate "days on
      // site" input to reflect here.
      numDays: "1",
      cleanerRate: formatAmount(rates.cleanerHourlyRateCents),
      foremanRate: formatAmount(rates.foremanHourlyRateCents),
      subtotal: formatAmount(estimate.totalCents),
      total: formatAmount(estimate.totalCents),
      purchaseTerms: DEFAULT_PURCHASE_TERMS,
    });
    return { ok: true, pdfBytes };
  } catch (e) {
    console.error("Failed to fill change order contract PDF:", e);
    return { ok: false, error: "Contract could not be prepared. Please try again.", status: 500 };
  }
}
