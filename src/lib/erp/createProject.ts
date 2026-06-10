import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { createTurnoverRequestsFromPayload } from "@/lib/erp/createTurnoverRequests";
import { createHubSpotDeal } from "@/lib/hubspot/createDeal";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseProjectDate(value: unknown) {
  return typeof value === "string" && value ? new Date(value) : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? Number(value) : NaN;
}

function percentValue(value: unknown) {
  const n = numberValue(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
}

function minDateValue(values: (Date | null | undefined)[]) {
  return values.filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

function maxDateValue(values: (Date | null | undefined)[]) {
  const sorted = values.filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime());
  return sorted[sorted.length - 1] ?? null;
}

export async function createProjectFromPayload(body: Record<string, unknown>) {
  const segment = normalizeProjectSegment(String(body.segment || "COMMERCIAL_CLEANING"));

  if (segment === "JANITORIAL_TURNOVER_REQUESTS") {
    const result = await createTurnoverRequestsFromPayload(body);
    const projectDate = parseProjectDate(body.projectDate) ?? minDateValue(result.requests.map((request) => request.startDate));
    const projectEndDate =
      parseProjectDate(body.projectEndDate) ?? maxDateValue(result.requests.map((request) => request.endDate));
    const jobTitle = stringValue(body.jobTitle) || `${result.building.name} - Janitorial turnover`;
    const hubspotPipelineId = stringValue(body.hubspotPipelineId) || null;
    
    // Create HubSpot deal if pipeline is configured
    let hubspotDealId: string | null = null;
    if (hubspotPipelineId) {
      const totalCents = result.requests.reduce((sum, req) => sum + (req.priceCents ?? 0), 0);
      const dealAmount = totalCents > 0 ? totalCents / 100 : undefined;
      const dealDate = projectEndDate?.toISOString().split("T")[0] ?? projectDate?.toISOString().split("T")[0];
      
      hubspotDealId = await createHubSpotDeal({
        pipelineId: hubspotPipelineId,
        dealName: jobTitle,
        amount: dealAmount,
        closeDate: dealDate ?? undefined,
      });
    }

    const project = await prisma.project.create({
      data: {
        segment,
        jobTitle,
        buildingId: result.building.id,
        supervisor: stringValue(body.supervisor) || stringValue(body.pmName) || null,
        description: stringValue(body.description) || null,
        projectDate,
        projectEndDate,
        percentDone: percentValue(body.percentDone) ?? 0,
        percentInvoiced: percentValue(body.percentInvoiced) ?? 0,
        contractValueCents: inputToCents(body.contractValue) ?? undefined,
        estMaterialCents: inputToCents(body.estMaterial) ?? undefined,
        estTravelCents: inputToCents(body.estTravel) ?? undefined,
        estLaborCents: inputToCents(body.estLabor) ?? undefined,
        actualLaborCents: inputToCents(body.actualLabor) ?? undefined,
        actualMaterialCents: inputToCents(body.actualMaterial) ?? undefined,
        estHours: body.estHours != null && body.estHours !== "" ? Number(body.estHours) : undefined,
        actualHours: body.actualHours != null && body.actualHours !== "" ? Number(body.actualHours) : undefined,
        hubspotPipelineId,
        hubspotDealId: hubspotDealId ?? undefined,
      },
    });

    return { turnoverRequests: result.requests, building: result.building, project } as const;
  }

  const jobTitle = stringValue(body.jobTitle);
  if (!jobTitle) {
    return { error: "jobTitle is required", status: 400 } as const;
  }

  const projectDate = parseProjectDate(body.projectDate);
  const projectEndDate = parseProjectDate(body.projectEndDate);

  const project = await prisma.project.create({
    data: {
      segment,
      jobTitle,
      supervisor: body.supervisor != null ? String(body.supervisor).trim() || null : null,
      description: body.description != null ? String(body.description).trim() || null : null,
      projectDate,
      projectEndDate,
      percentDone: percentValue(body.percentDone) ?? 0,
      percentInvoiced: percentValue(body.percentInvoiced) ?? 0,
      contractValueCents: inputToCents(body.contractValue) ?? undefined,
      estMaterialCents: inputToCents(body.estMaterial) ?? undefined,
      estTravelCents: inputToCents(body.estTravel) ?? undefined,
      estLaborCents: inputToCents(body.estLabor) ?? undefined,
      actualLaborCents: inputToCents(body.actualLabor) ?? undefined,
      actualMaterialCents: inputToCents(body.actualMaterial) ?? undefined,
      estHours: body.estHours != null && body.estHours !== "" ? Number(body.estHours) : undefined,
      actualHours: body.actualHours != null && body.actualHours !== "" ? Number(body.actualHours) : undefined,
      hubspotPipelineId: body.hubspotPipelineId != null ? String(body.hubspotPipelineId).trim() || null : null,
    },
  });

  return { project } as const;
}
