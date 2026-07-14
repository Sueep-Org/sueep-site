import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; unitId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { unitId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.active !== undefined) data.active = Boolean(body.active);
  if (body.fullClean !== undefined) data.fullClean = Boolean(body.fullClean);
  if (body.carpetCleaning !== undefined) data.carpetCleaning = Boolean(body.carpetCleaning);
  if (body.unitNumber !== undefined) {
    const v = String(body.unitNumber).trim();
    if (!v) return NextResponse.json({ error: "unitNumber cannot be empty" }, { status: 400 });
    data.unitNumber = v;
  }

  try {
    const unit = await prisma.recurringContractUnit.update({ where: { id: unitId }, data });
    return NextResponse.json(unit);
  } catch (e) {
    console.error("PATCH .../units/[unitId]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

// Soft-remove only (sets active: false) — keeps past generated periods' unit history intact.
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { unitId } = await ctx.params;

  try {
    const unit = await prisma.recurringContractUnit.update({ where: { id: unitId }, data: { active: false } });
    return NextResponse.json(unit);
  } catch (e) {
    console.error("DELETE .../units/[unitId]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
