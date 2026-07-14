import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";
import { Prisma } from "@prisma/client";

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

  const data: Prisma.ReimbursementUpdateInput = {};

  if (body.paid !== undefined) {
    data.paidAt = body.paid ? new Date() : null;
  }
  if (body.date !== undefined) {
    const d = new Date(String(body.date));
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    data.date = d;
  }
  if (body.companyOrTeam !== undefined) {
    const v = String(body.companyOrTeam).trim();
    if (!v) return NextResponse.json({ error: "companyOrTeam cannot be empty" }, { status: 400 });
    data.companyOrTeam = v;
  }
  if (body.description !== undefined) {
    const v = String(body.description).trim();
    if (!v) return NextResponse.json({ error: "description cannot be empty" }, { status: 400 });
    data.description = v;
  }
  if (body.amount !== undefined) {
    const cents = inputToCents(body.amount);
    if (cents === null || cents <= 0) return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    data.amountCents = cents;
  }

  try {
    const updated = await prisma.reimbursement.update({
      where: { id },
      data,
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/erp/reimbursements/[id]", e);
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
    await prisma.reimbursement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/reimbursements/[id]", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
