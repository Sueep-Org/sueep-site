import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { normalizeProjectSegment, PROJECT_SEGMENTS } from "@/lib/erp/projectSegments";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { buildJanitorialTurnoverProjectEmailHtml, formatUsd, sendEmail } from "@/lib/email";

const STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETE", "ARCHIVED"] as const;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function dateLabel(date: Date | null) {
  return date ? date.toISOString().split("T")[0] : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment");
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const cfg = parseHubSpotPipelineStageMap();
  const normalizedSegment = segment ? normalizeProjectSegment(segment) : null;
  const janitorialSegments = cfg?.janitorial.pipelineId
    ? ["JANITORIAL_TURNOVER_REQUESTS"]
    : ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];
  const isJanitorialCategory = category === "active-janitorial" || category === "schedule-janitorial";

  const projects = await prisma.project.findMany({
    where: {
      ...(isJanitorialCategory
        ? {
            ...(category === "active-janitorial"
              ? { status: "ACTIVE" }
              : { status: { notIn: ["COMPLETE", "ARCHIVED"] } }),
            OR: [
              { segment: { in: janitorialSegments } },
              ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
            ],
          }
        : {}),
      ...(normalizedSegment && PROJECT_SEGMENTS.includes(normalizedSegment) ? { segment: normalizedSegment } : {}),
      ...(status && STATUSES.includes(status as (typeof STATUSES)[number]) ? { status } : {}),
    },
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { laborEntries: true } },
    },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobTitle = String(body.jobTitle || "").trim();
  if (!jobTitle) {
    return NextResponse.json({ error: "jobTitle is required" }, { status: 400 });
  }

  const segment = normalizeProjectSegment(String(body.segment || "COMMERCIAL_CLEANING"));

  const projectDate =
    typeof body.projectDate === "string" && body.projectDate
      ? new Date(body.projectDate)
      : body.projectDate === null
        ? null
        : null;

  const projectEndDate =
    typeof body.projectEndDate === "string" && body.projectEndDate
      ? new Date(body.projectEndDate)
      : body.projectEndDate === null || body.projectEndDate === ""
        ? null
        : null;

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? Number(v) : NaN);
  const pct = (v: unknown) => {
    const n = num(v);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : undefined;
  };

  try {
    const project = await prisma.project.create({
      data: {
        segment,
        jobTitle,
        supervisor: body.supervisor != null ? String(body.supervisor).trim() || null : null,
        description: body.description != null ? String(body.description).trim() || null : null,
        projectDate,
        projectEndDate,
        percentDone: pct(body.percentDone) ?? 0,
        percentInvoiced: pct(body.percentInvoiced) ?? 0,
        contractValueCents: inputToCents(body.contractValue) ?? undefined,
        estMaterialCents: inputToCents(body.estMaterial) ?? undefined,
        estTravelCents: inputToCents(body.estTravel) ?? undefined,
        estLaborCents: inputToCents(body.estLabor) ?? undefined,
        actualLaborCents: inputToCents(body.actualLabor) ?? undefined,
        actualMaterialCents: inputToCents(body.actualMaterial) ?? undefined,
        estHours:
          body.estHours != null && body.estHours !== ""
            ? Number(body.estHours)
            : undefined,
        actualHours:
          body.actualHours != null && body.actualHours !== ""
            ? Number(body.actualHours)
            : undefined,
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
              estimatedTotal:
                project.contractValueCents != null ? formatUsd(project.contractValueCents) : null,
              details: project.description,
              projectUrl,
            }),
          });
        } catch (emailError) {
          console.error("Janitorial turnover PM notification failed", emailError);
        }
      }
    }

    return NextResponse.json(project);
  } catch (e) {
    console.error("POST /api/erp/projects", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
