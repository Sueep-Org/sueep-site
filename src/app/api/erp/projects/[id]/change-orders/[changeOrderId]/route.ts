import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID"] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const existing = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    data.title = title;
  }
  if (body.description !== undefined) data.description = body.description != null ? String(body.description).trim() || null : null;
  if (body.requestedBy !== undefined) data.requestedBy = body.requestedBy != null ? String(body.requestedBy).trim() || null : null;
  if (body.reason !== undefined) data.reason = body.reason != null ? String(body.reason).trim() || null : null;
  if (body.resolutionNotes !== undefined) {
    data.resolutionNotes = body.resolutionNotes != null ? String(body.resolutionNotes).trim() || null : null;
  }
  if (body.status !== undefined) {
    const statusRaw = String(body.status || "").toUpperCase();
    if (!STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = statusRaw;
  }
  if (body.estimatedCost !== undefined) data.estimatedCostCents = inputToCents(body.estimatedCost);
  if (body.estimatedDays !== undefined) {
    if (body.estimatedDays === null || body.estimatedDays === "") {
      data.estimatedDays = null;
    } else {
      const n = Number(body.estimatedDays);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "estimatedDays must be a non-negative number" }, { status: 400 });
      }
      data.estimatedDays = Math.round(n);
    }
  }

  try {
    const updated = await prisma.projectChangeOrder.update({
      where: { id: changeOrderId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH project change order", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}