import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";
import { Prisma } from "@prisma/client";

const DRAWINGS_VALUES = ["YES", "NO", "ASKED"];

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Prisma.SalesBidEntryUpdateInput = {};

  if (body.date !== undefined) {
    if (body.date === null || body.date === "") data.date = null;
    else {
      const d = new Date(String(body.date));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      data.date = d;
    }
  }
  if (body.projectStartDate !== undefined) {
    if (body.projectStartDate === null || body.projectStartDate === "") data.projectStartDate = null;
    else {
      const d = new Date(String(body.projectStartDate));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid projectStartDate" }, { status: 400 });
      data.projectStartDate = d;
    }
  }
  if (body.company !== undefined) {
    const v = String(body.company).trim();
    if (!v) return NextResponse.json({ error: "company cannot be empty" }, { status: 400 });
    data.company = v;
  }
  if (body.deal !== undefined) data.deal = body.deal ? String(body.deal).trim() : null;
  if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
  if (body.drawings !== undefined) {
    const drawings = body.drawings ? String(body.drawings).toUpperCase() : null;
    if (drawings && !DRAWINGS_VALUES.includes(drawings)) {
      return NextResponse.json({ error: "drawings must be YES, NO, or ASKED" }, { status: 400 });
    }
    data.drawings = drawings;
  }
  if (body.payout !== undefined) data.payoutCents = inputToCents(body.payout);
  if (body.sent !== undefined) data.sent = Boolean(body.sent);

  try {
    const updated = await prisma.salesBidEntry.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/erp/sales-bids/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    await prisma.salesBidEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/sales-bids/[id]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
