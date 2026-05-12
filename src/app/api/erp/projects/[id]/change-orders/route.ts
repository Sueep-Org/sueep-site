import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID"] as const;

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.projectChangeOrder.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const statusRaw = String(body.status || "DRAFT").toUpperCase();
  const status = STATUSES.includes(statusRaw as (typeof STATUSES)[number]) ? statusRaw : "DRAFT";

  const estimatedDays =
    body.estimatedDays === undefined || body.estimatedDays === null || body.estimatedDays === ""
      ? null
      : Number(body.estimatedDays);
  if (estimatedDays != null && (!Number.isFinite(estimatedDays) || estimatedDays < 0)) {
    return NextResponse.json({ error: "estimatedDays must be a non-negative number" }, { status: 400 });
  }

  try {
    const entry = await prisma.projectChangeOrder.create({
      data: {
        projectId: id,
        title,
        status,
        description: body.description != null ? String(body.description).trim() || null : null,
        requestedBy: body.requestedBy != null ? String(body.requestedBy).trim() || null : null,
        estimatedCostCents: inputToCents(body.estimatedCost) ?? undefined,
        estimatedDays: estimatedDays == null ? undefined : Math.round(estimatedDays),
        reason: body.reason != null ? String(body.reason).trim() || null : null,
        resolutionNotes: body.resolutionNotes != null ? String(body.resolutionNotes).trim() || null : null,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST project change order", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}