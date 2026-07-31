import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { PROJECT_SEGMENTS, normalizeProjectSegment } from "@/lib/erp/projectSegments";

const STATUSES = ["ACTIVE", "UPCOMING", "ON_HOLD", "COMPLETE", "ARCHIVED"] as const;
const BILLING_STATUSES = ["BILLING", "INACTIVE", "INVOICE_PAID"] as const;

type Ctx = { params: Promise<{ id: string }> };

async function getProjectRecord(id: string) {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT
      "id",
      "createdAt",
      "updatedAt",
      "segment",
      "status",
      "projectDate",
      "projectEndDate",
      "jobTitle",
      "supervisor",
      "description",
      "percentDone",
      "percentInvoiced",
      "billingStatus",
      "contractValueCents",
      "estMaterialCents",
      "estTravelCents",
      "estLaborCents",
      "actualLaborCents",
      "actualMaterialCents",
      "estHours",
      "actualHours",
      "hubspotDealId",
      "hubspotPipelineId",
      "hubspotStageId",
      "estimatorWallMeasurements",
      "paintingBreakdown"
    FROM "Project"
    WHERE "id" = $1
    LIMIT 1`,
    id,
  );

  if (!rows[0]) return null;

  const laborEntries = await prisma.laborEntry.findMany({
    where: { projectId: id },
    orderBy: { workDate: "desc" },
  });

  return { ...rows[0], laborEntries };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await getProjectRecord(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...project,
    painting_breakdown: project.paintingBreakdown ?? null,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pct = (v: unknown) => {
    if (v === undefined) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(100, Math.max(0, n));
  };

  const cents = (v: unknown) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return inputToCents(v);
  };

  const parseJsonObject = (value: unknown, fieldName: string) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === "object") return parsed;
        return undefined;
      } catch {
        throw new Error(`${fieldName} must be valid JSON`);
      }
    }
    if (typeof value === "object") return value;
    return undefined;
  };

  const data: Record<string, unknown> = {};

  if (body.jobTitle !== undefined) data.jobTitle = String(body.jobTitle || "").trim() || existing.jobTitle;
  if (body.supervisor !== undefined) {
    const supervisor = String(body.supervisor || "").trim();
    if (!supervisor) return NextResponse.json({ error: "supervisor (PM) is required" }, { status: 400 });
    data.supervisor = supervisor;
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (body.projectDate !== undefined) {
    data.projectDate =
      body.projectDate === null || body.projectDate === ""
        ? null
        : new Date(String(body.projectDate));
  }
  if (body.projectEndDate !== undefined) {
    data.projectEndDate =
      body.projectEndDate === null || body.projectEndDate === ""
        ? null
        : new Date(String(body.projectEndDate));
  }
  if (body.percentDone !== undefined) data.percentDone = pct(body.percentDone) ?? 0;
  if (body.percentInvoiced !== undefined) data.percentInvoiced = pct(body.percentInvoiced) ?? 0;
  if (body.segment !== undefined) {
    const normalized = normalizeProjectSegment(String(body.segment));
    if (PROJECT_SEGMENTS.includes(normalized)) data.segment = normalized;
  }
  if (body.hubspotPipelineId !== undefined) {
    data.hubspotPipelineId = body.hubspotPipelineId ? String(body.hubspotPipelineId).trim() : null;
  }
  if (body.status !== undefined) {
    const s = String(body.status).toUpperCase();
    if (STATUSES.includes(s as (typeof STATUSES)[number])) data.status = s;
  }
  if (body.billingStatus !== undefined) {
    if (body.billingStatus === null || body.billingStatus === "") {
      data.billingStatus = null;
    } else {
      const b = String(body.billingStatus).toUpperCase();
      if (BILLING_STATUSES.includes(b as (typeof BILLING_STATUSES)[number])) data.billingStatus = b;
    }
  }
  if (body.percentInvoiced !== undefined) data.percentInvoiced = pct(body.percentInvoiced) ?? 0;

  if (body.estimatorWallMeasurements !== undefined) {
    if (body.estimatorWallMeasurements === null || body.estimatorWallMeasurements === "") {
      data.estimatorWallMeasurements = null;
    } else {
      const parsed = parseJsonObject(body.estimatorWallMeasurements, "estimatorWallMeasurements");
      if (parsed === undefined) {
        return NextResponse.json({ error: "estimatorWallMeasurements must be valid JSON" }, { status: 400 });
      }
      data.estimatorWallMeasurements = parsed;
    }
  }

  if (body.painting_breakdown !== undefined) {
    if (body.painting_breakdown === null || body.painting_breakdown === "") {
      data.paintingBreakdown = null;
    } else {
      const parsed = parseJsonObject(body.painting_breakdown, "painting_breakdown");
      if (parsed === undefined) {
        return NextResponse.json({ error: "painting_breakdown must be valid JSON" }, { status: 400 });
      }
      data.paintingBreakdown = parsed;
    }
  }

  if (body.contractValue !== undefined) data.contractValueCents = cents(body.contractValue);
  if (body.estMaterial !== undefined) data.estMaterialCents = cents(body.estMaterial);
  if (body.estTravel !== undefined) data.estTravelCents = cents(body.estTravel);
  if (body.estLabor !== undefined) data.estLaborCents = cents(body.estLabor);
  if (body.actualLabor !== undefined) data.actualLaborCents = cents(body.actualLabor);
  if (body.actualMaterial !== undefined) data.actualMaterialCents = cents(body.actualMaterial);
  if (body.estHours !== undefined) {
    data.estHours =
      body.estHours === null || body.estHours === "" ? null : Number(body.estHours);
  }
  if (body.actualHours !== undefined) {
    data.actualHours =
      body.actualHours === null || body.actualHours === "" ? null : Number(body.actualHours);
  }

  try {
    if (Object.keys(data).length > 0) {
      await prisma.project.update({ where: { id }, data: data as object });
    }

    if (body.estimatorWallMeasurements !== undefined) {
      const payload =
        body.estimatorWallMeasurements === null || body.estimatorWallMeasurements === ""
          ? null
          : typeof body.estimatorWallMeasurements === "string"
            ? body.estimatorWallMeasurements
            : JSON.stringify(body.estimatorWallMeasurements);

      await prisma.$executeRawUnsafe(
        `UPDATE "Project" SET "estimatorWallMeasurements" = CAST($2 AS jsonb) WHERE "id" = $1`,
        id,
        payload,
      );
    }

    const project = await getProjectRecord(id);
    return NextResponse.json({
      ...project,
      painting_breakdown: project.paintingBreakdown ?? null,
    });
  } catch (e) {
    console.error("PATCH /api/erp/projects/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}