import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { normalizeProjectSegment } from "@/lib/erp/projectSegments";
import { buildJanitorialTurnoverProjectEmailHtml, formatUsd, sendEmail } from "@/lib/email";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateLabel(date: Date | null) {
  return date ? date.toISOString().split("T")[0] : null;
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

export async function createProjectFromPayload(body: Record<string, unknown>, req: Request) {
  const jobTitle = stringValue(body.jobTitle);
  if (!jobTitle) {
    return { error: "jobTitle is required", status: 400 } as const;
  }

  const segment = normalizeProjectSegment(String(body.segment || "COMMERCIAL_CLEANING"));
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

  if (segment === "JANITORIAL_TURNOVER_REQUESTS") {
    const sueepPmEmail = stringValue(body.sueepPmEmail);
    if (sueepPmEmail) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(req.url).origin;
      const projectUrl = `${siteUrl}/erp/projects/${project.id}`;
      try {
        await sendEmail({
          to: sueepPmEmail,
          subject: `New Janitorial Turnover Submitted - ${project.jobTitle}`,
          html: buildJanitorialTurnoverProjectEmailHtml({
            projectTitle: project.jobTitle,
            propertyName: stringValue(body.buildingName),
            propertyAddress: stringValue(body.buildingAddress),
            managerName: stringValue(body.pmName),
            sueepPmName: stringValue(body.sueepPmName),
            unitNumbers: stringValue(body.unitNumbers),
            startDate: dateLabel(project.projectDate),
            endDate: dateLabel(project.projectEndDate),
            estimatedTotal: project.contractValueCents != null ? formatUsd(project.contractValueCents) : null,
            details: project.description,
            projectUrl,
          }),
        });
      } catch (emailError) {
        console.error("Janitorial turnover PM notification failed", emailError);
      }
    }
  }

  return { project } as const;
}
