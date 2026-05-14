import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const check = await prisma.qualityCheck.findUnique({
    where: { id },
    include: { turnoverRequest: { include: { building: true } } },
  });
  if (!check) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(check);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.qualityCheck.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.turnoverRequestId !== undefined) {
    const turnoverRequestId = String(body.turnoverRequestId || "").trim();
    if (!turnoverRequestId) {
      return NextResponse.json({ error: "turnoverRequestId is required" }, { status: 400 });
    }
    data.turnoverRequestId = turnoverRequestId;
  }
  if (body.supervisorName !== undefined) {
    const supervisorName = String(body.supervisorName || "").trim();
    if (!supervisorName) {
      return NextResponse.json({ error: "supervisorName is required" }, { status: 400 });
    }
    data.supervisorName = supervisorName;
  }
  if (body.supervisorSignatureUrl !== undefined) {
    const supervisorSignatureUrl = String(body.supervisorSignatureUrl || "").trim();
    data.supervisorSignatureUrl = supervisorSignatureUrl || null;
  }
  if (body.pmApproval !== undefined) {
    data.pmApproval = Boolean(body.pmApproval);
  }
  if (body.evidencePhotos !== undefined) {
    const evidencePhotos = parseStringArray(body.evidencePhotos);
    data.evidencePhotos = evidencePhotos.length > 0 ? evidencePhotos : null;
  }
  if (body.notes !== undefined) {
    data.notes = String(body.notes || "").trim() || null;
  }

  try {
    const check = await prisma.qualityCheck.update({ where: { id }, data: data as object });
    return NextResponse.json(check);
  } catch (e) {
    console.error("PATCH /api/erp/quality-checks/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.qualityCheck.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/quality-checks/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
