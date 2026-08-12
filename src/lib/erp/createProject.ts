import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { createTurnoverRequestsFromPayload } from "@/lib/erp/createTurnoverRequests";
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
      result.requests.map(async (request) => {
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

        const project = await prisma.project.create({
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

        // Paint/clean dates given on the creation form actually put those
        // days on the calendar now, instead of only folding into the
        // project's overall start/end span (see unitDateRange in
        // createTurnoverRequestsFromPayload) with no day-level marker of
        // their own. Same ProjectDayAssignment + scopeItems vocabulary the
        // calendar's own day-assignment modal writes (see
        // /api/erp/schedule/day-assignments) — no supervisor yet, that's
        // assigned later from the calendar same as any other planned day.
        // Same day for both collapses into one row (the model only allows
        // one ProjectDayAssignment per project per day).
        const paintCleanSameDay =
          request.paintDate && request.cleanDate && request.paintDate.getTime() === request.cleanDate.getTime();
        const scopeDayAssignments: { date: Date; scopeItems: string[] }[] = paintCleanSameDay
          ? [{ date: request.paintDate!, scopeItems: ["PAINT", "CLEAN"] }]
          : [
              ...(request.paintDate ? [{ date: request.paintDate, scopeItems: ["PAINT"] }] : []),
              ...(request.cleanDate ? [{ date: request.cleanDate, scopeItems: ["CLEAN"] }] : []),
            ];
        if (scopeDayAssignments.length > 0) {
          await prisma.projectDayAssignment.createMany({
            data: scopeDayAssignments.map((a) => ({ projectId: project.id, date: a.date, scopeItems: a.scopeItems })),
          });
        }

        return project;
      })
    );

    return { turnoverRequests: result.requests, building: result.building, projects } as const;
  }

  const jobTitle = stringValue(body.jobTitle);
  if (!jobTitle) {
    return { error: "jobTitle is required", status: 400 } as const;
  }

  if (!stringValue(body.projectDate)) {
    return { error: "projectDate (start date) is required", status: 400 } as const;
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
