import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dollarsToCents } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

const CATEGORIES = ["CLEANING_PRODUCTS", "PAINT"] as const;

export async function GET(_req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const co = await prisma.projectChangeOrder.findFirst({ where: { id: changeOrderId, projectId: id } });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const entries = await prisma.changeOrderMaterialEntry.findMany({
    where: { changeOrderId },
    orderBy: { usedOn: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const co = await prisma.projectChangeOrder.findFirst({ where: { id: changeOrderId, projectId: id } });
  if (!co) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const itemName = String(body.itemName || "").trim();
  if (!itemName) return NextResponse.json({ error: "itemName is required" }, { status: 400 });

  const categoryRaw = String(body.category || "").toUpperCase();
  if (!CATEGORIES.includes(categoryRaw as (typeof CATEGORIES)[number]))
    return NextResponse.json({ error: "category must be CLEANING_PRODUCTS or PAINT" }, { status: 400 });

  const usedOnRaw = body.usedOn;
  if (typeof usedOnRaw !== "string" || !usedOnRaw)
    return NextResponse.json({ error: "usedOn is required" }, { status: 400 });
  const usedOn = new Date(usedOnRaw);
  if (Number.isNaN(usedOn.getTime())) return NextResponse.json({ error: "Invalid usedOn" }, { status: 400 });

  let costCents: number;
  if (typeof body.costCents === "number" && Number.isFinite(body.costCents)) {
    costCents = Math.round(body.costCents);
  } else if (typeof body.cost === "number" && Number.isFinite(body.cost)) {
    costCents = dollarsToCents(body.cost);
  } else if (typeof body.cost === "string") {
    const n = Number(body.cost.replace(/[$,]/g, ""));
    if (!Number.isFinite(n)) return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
    costCents = dollarsToCents(n);
  } else {
    return NextResponse.json({ error: "cost or costCents required" }, { status: 400 });
  }

  const quantity = body.quantity === undefined || body.quantity === null || body.quantity === ""
    ? null : Number(body.quantity);

  const entry = await prisma.changeOrderMaterialEntry.create({
    data: {
      changeOrderId,
      usedOn,
      category: categoryRaw,
      itemName,
      quantity,
      unit: body.unit != null ? String(body.unit).trim() || null : null,
      costCents,
      notes: body.notes != null ? String(body.notes).trim() || null : null,
    },
  });

  return NextResponse.json({
    id: entry.id,
    usedOn: entry.usedOn.toISOString(),
    category: entry.category,
    itemName: entry.itemName,
    quantity: entry.quantity,
    unit: entry.unit,
    costCents: entry.costCents,
    notes: entry.notes,
  });
}
