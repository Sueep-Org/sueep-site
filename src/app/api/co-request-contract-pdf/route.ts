import { prisma } from "@/lib/prisma";
import {
  computeChangeOrderLaborEstimate,
  deriveChangeOrderSupervisorCount,
  getChangeOrderLaborRates,
  hasCustomChangeOrderLaborRate,
  CHANGE_ORDER_ESTIMATE_DAY_HOURS,
} from "@/lib/changeOrderLaborRates";
import { fillChangeOrderContractPdf } from "@/lib/contracts/fillChangeOrderPdf";

export const runtime = "nodejs";

type Body = {
  projectId?: string;
  coTitle?: string;
  coDescription?: string;
  coEstimatedStartDate?: string;
  coCleanerCount?: string;
  clientCompany?: string;
  clientAddress?: string;
  requesterName?: string;
  requesterEmail?: string;
};

const DEFAULT_PURCHASE_TERMS =
  "Payment due within 30 days of invoice date. This change order is governed by the terms of the original service agreement between Sueep LLC and the client.";

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requesterName = body.requesterName?.trim();
  const requesterEmail = body.requesterEmail?.trim();
  const coTitle = body.coTitle?.trim();
  if (!body.projectId) return Response.json({ error: "projectId is required" }, { status: 400 });
  if (!coTitle) return Response.json({ error: "coTitle is required" }, { status: 400 });
  if (!requesterName) return Response.json({ error: "Requester name is required" }, { status: 400 });
  if (!requesterEmail) return Response.json({ error: "Requester email is required" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: body.projectId },
    select: { jobTitle: true, laborRateCard: true },
  });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // Same "is this project priced at all" gate the request form itself uses
  // (see hasCustomChangeOrderLaborRate). This endpoint only makes sense
  // once a real price is on screen, so refuse rather than generate a $0
  // contract.
  const cleanerCount = Math.max(0, Math.round(Number(body.coCleanerCount) || 0));
  if (!hasCustomChangeOrderLaborRate(project.laborRateCard) || cleanerCount <= 0) {
    return Response.json({ error: "This project isn't priced yet. The change order will be sent for signature once Sueep prices it." }, { status: 400 });
  }

  const supervisorCount = deriveChangeOrderSupervisorCount(cleanerCount);
  const rates = getChangeOrderLaborRates(project.laborRateCard);
  const estimate = computeChangeOrderLaborEstimate(
    { cleanerCount, supervisorCount, hours: CHANGE_ORDER_ESTIMATE_DAY_HOURS },
    rates,
  );

  const today = new Date();
  const expires = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillChangeOrderContractPdf({
      changeOrderTitle: coTitle,
      referenceNumber: Date.now().toString(36).toUpperCase(),
      projectName: project.jobTitle,
      clientCompany: body.clientCompany?.trim() ?? "",
      clientAddress: body.clientAddress?.trim() ?? "",
      requesterName,
      requesterEmail,
      dateCreated: formatDate(today),
      dateExpires: formatDate(expires),
      startDate: body.coEstimatedStartDate,
      scopeDescription: body.coDescription?.trim() ?? "",
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
  } catch (e) {
    console.error("Failed to fill change order contract PDF:", e);
    return Response.json({ error: "Contract could not be prepared. Please try again." }, { status: 500 });
  }

  const filename = `${coTitle.replace(/[^\w\- ]+/g, "").trim() || "change-order"}.pdf`;
  return new Response(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
