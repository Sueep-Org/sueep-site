import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { createTurnoverRequestsFromPayload } from "@/lib/erp/createTurnoverRequests";
import { createHubSpotDeal } from "@/lib/hubspot/createDeal";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";

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

export async function createProjectFromPayload(
  body: Record<string, unknown>,
  options?: { createdByEmployeeId?: string | null }
) {
  const createdByEmployeeId = options?.createdByEmployeeId ?? null;
  const segment = normalizeProjectSegment(String(body.segment || "COMMERCIAL_CLEANING"));

  if (segment === "JANITORIAL_TURNOVER_REQUESTS") {
    const result = await createTurnoverRequestsFromPayload(body);
    const supervisor = stringValue(body.sueepPmName) || stringValue(body.supervisor) || null;
    const hubspotPipelineId = stringValue(body.hubspotPipelineId) || null;

    // Extract pricing lines from the submission payload description to store per project
    const bodyDesc = stringValue(body.description);
    const pricePackageLine = bodyDesc
      .split(/\r?\n/)
      .find((l) => l.trim().toLowerCase().startsWith("price package:"))
      ?.trim() ?? null;
    const bodyDescLines = bodyDesc.split(/\r?\n/);
    const commentsStart = bodyDescLines.findIndex((l) => l.trim().toLowerCase().startsWith("comments:"));
    const commentsLine = commentsStart === -1 ? null : bodyDescLines.slice(commentsStart).join("\n").trim();

    // One project per unit so each unit has its own checklist, labor, and materials
    const projects = await Promise.all(
      result.requests.map((request) => {
        const unitTotal = request.priceCents != null && request.priceCents > 0
          ? `Estimated Unit Total: $${(request.priceCents / 100).toFixed(0)}`
          : null;
        const descLines = [
          `Property: ${result.building.name}`,
          `Units: ${request.unitNumber}${request.bedrooms === null ? " (Common Area)" : ""}`,
          pricePackageLine,
          unitTotal,
          commentsLine,
        ].filter(Boolean);

        return prisma.project.create({
          data: {
            segment,
            jobTitle: `${result.building.name} - ${formatUnitDisplay(request.unitNumber)}`,
            buildingId: result.building.id,
            turnoverRequestId: request.id,
            description: descLines.join("\n"),
            supervisor,
            projectDate: request.startDate,
            projectEndDate: request.endDate,
            percentDone: 0,
            percentInvoiced: 0,
            contractValueCents: request.priceCents ?? undefined,
            hubspotPipelineId,
            createdByEmployeeId,
            commissionEmployeeId: result.building.commissionEmployeeId,
          },
        });
      })
    );

    return { turnoverRequests: result.requests, building: result.building, projects } as const;
  }

  const jobTitle = stringValue(body.jobTitle);
  if (!jobTitle) {
    return { error: "jobTitle is required", status: 400 } as const;
  }

  const projectDate = parseProjectDate(body.projectDate);
  const projectEndDate = parseProjectDate(body.projectEndDate);
  const percentInvoiced = percentValue(body.percentInvoiced) ?? 0;

  const project = await prisma.project.create({
    data: {
      segment,
      jobTitle,
      supervisor: body.supervisor != null ? String(body.supervisor).trim() || null : null,
      description: body.description != null ? String(body.description).trim() || null : null,
      projectDate,
      projectEndDate,
      percentDone: percentValue(body.percentDone) ?? 0,
      percentInvoiced,
      contractValueCents: inputToCents(body.contractValue) ?? undefined,
      estMaterialCents: inputToCents(body.estMaterial) ?? undefined,
      estTravelCents: inputToCents(body.estTravel) ?? undefined,
      estLaborCents: inputToCents(body.estLabor) ?? undefined,
      actualLaborCents: inputToCents(body.actualLabor) ?? undefined,
      actualMaterialCents: inputToCents(body.actualMaterial) ?? undefined,
      estHours: body.estHours != null && body.estHours !== "" ? Number(body.estHours) : undefined,
      actualHours: body.actualHours != null && body.actualHours !== "" ? Number(body.actualHours) : undefined,
      hubspotPipelineId: body.hubspotPipelineId != null ? String(body.hubspotPipelineId).trim() || null : null,
      createdByEmployeeId,
    },
  });

  return { project } as const;
}
