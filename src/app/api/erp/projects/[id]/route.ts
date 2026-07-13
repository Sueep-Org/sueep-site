import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { PROJECT_SEGMENTS, normalizeProjectSegment } from "@/lib/erp/projectSegments";

const STATUSES = ["ACTIVE", "UPCOMING", "ON_HOLD", "COMPLETE", "ARCHIVED"] as const;
const BILLING_STATUSES = ["BILLING", "INACTIVE", "INVOICE_PAID", "NOT_BILLED", "BILLED", "PAID"] as const;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      laborEntries: { orderBy: { workDate: "desc" } },
    },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
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

  const data: Record<string, unknown> = {};

  if (body.jobTitle !== undefined) data.jobTitle = String(body.jobTitle || "").trim() || existing.jobTitle;
  if (body.supervisor !== undefined) {
    const supervisor = String(body.supervisor || "").trim();
    if (!supervisor) return NextResponse.json({ error: "supervisor (PM) is required" }, { status: 400 });
    data.supervisor = supervisor;
  }
  if (body.supervisorUserId !== undefined) {
    data.supervisorUserId = body.supervisorUserId ? String(body.supervisorUserId).trim() : null;
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
  if (body.turnoverRequestId !== undefined) {
    data.turnoverRequestId = body.turnoverRequestId ? String(body.turnoverRequestId).trim() : null;
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

  if (body.pricingPackage !== undefined) data.pricingPackage = body.pricingPackage ?? null;
  if (body.contractValue !== undefined) data.contractValueCents = cents(body.contractValue);
  if (body.estMaterial !== undefined) data.estMaterialCents = cents(body.estMaterial);
  if (body.estTravel !== undefined) data.estTravelCents = cents(body.estTravel);
  if (body.estLabor !== undefined) data.estLaborCents = cents(body.estLabor);
  if (body.actualLabor !== undefined) data.actualLaborCents = cents(body.actualLabor);
  if (body.actualMaterial !== undefined) data.actualMaterialCents = cents(body.actualMaterial);
  if (body.actualTravel !== undefined) data.actualTravelCents = cents(body.actualTravel);
  if (body.estHours !== undefined) {
    data.estHours =
      body.estHours === null || body.estHours === "" ? null : Number(body.estHours);
  }
  if (body.actualHours !== undefined) {
    data.actualHours =
      body.actualHours === null || body.actualHours === "" ? null : Number(body.actualHours);
  }
  if (body.estimatedDays !== undefined) {
    data.estimatedDays =
      body.estimatedDays === null || body.estimatedDays === "" ? null : Math.round(Number(body.estimatedDays));
  }
  if (body.commissionPaid !== undefined) {
    data.commissionPaidAt = body.commissionPaid ? new Date() : null;
  }
  if (body.commissionEmployeeId !== undefined) {
    data.commissionEmployeeId = body.commissionEmployeeId ? String(body.commissionEmployeeId).trim() : null;
  }

  try {
    const project = await prisma.project.update({ where: { id }, data: data as object });
    return NextResponse.json(project);
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