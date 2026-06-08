import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string; materialId: string }> };

const CATEGORIES = ["CLEANING_PRODUCTS", "PAINT"] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, changeOrderId, materialId } = await ctx.params;
  const entry = await prisma.changeOrderMaterialEntry.findFirst({
    where: { id: materialId, changeOrderId, changeOrder: { projectId: id } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: Record<string, unknown> = {};

  if (body.usedOn !== undefined) {
    const d = new Date(String(body.usedOn));
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid usedOn" }, { status: 400 });
    data.usedOn = d;
  }
  if (body.category !== undefined) {
    const cat = String(body.category).toUpperCase();
    if (!CATEGORIES.includes(cat as (typeof CATEGORIES)[number]))
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    data.category = cat;
  }
  if (body.itemName !== undefined) {
    const name = String(body.itemName).trim();
    if (!name) return NextResponse.json({ error: "itemName is required" }, { status: 400 });
    data.itemName = name;
  }
  if (body.cost !== undefined) {
    const n = Number(String(body.cost).replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
    data.costCents = dollarsToCents(n);
  }
  if (body.quantity !== undefined)
    data.quantity = body.quantity === "" || body.quantity === null ? null : Number(body.quantity);
  if (body.unit !== undefined)
    data.unit = body.unit ? String(body.unit).trim() || null : null;
  if (body.notes !== undefined)
    data.notes = body.notes ? String(body.notes).trim() || null : null;

  const updated = await prisma.changeOrderMaterialEntry.update({ where: { id: materialId }, data });
  return NextResponse.json({
    id: updated.id,
    usedOn: updated.usedOn.toISOString(),
    category: updated.category,
    itemName: updated.itemName,
    quantity: updated.quantity,
    unit: updated.unit,
    costCents: updated.costCents,
    notes: updated.notes,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, changeOrderId, materialId } = await ctx.params;
  const entry = await prisma.changeOrderMaterialEntry.findFirst({
    where: { id: materialId, changeOrderId, changeOrder: { projectId: id } },
  });
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.changeOrderMaterialEntry.delete({ where: { id: materialId } });
  return NextResponse.json({ ok: true });
}
