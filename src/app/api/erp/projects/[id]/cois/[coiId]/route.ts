import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string; coiId: string }> };

/** Updates whether/when it was sent and notes. The PDF and policies are fixed; add a new COI to replace them. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, coiId } = await ctx.params;
  let body: { sentOn?: unknown; sentTo?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let sentOn: Date | null = null;
  if (typeof body.sentOn === "string" && body.sentOn.trim()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.sentOn.trim())) return NextResponse.json({ error: "Sent date is not a valid date" }, { status: 400 });
    sentOn = new Date(`${body.sentOn.trim()}T00:00:00.000Z`);
  }
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const result = await prisma.projectCoi.updateMany({
    where: { id: coiId, projectId: id },
    data: { sentOn, sentTo: sentOn ? text(body.sentTo) : null, notes: text(body.notes) },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id, coiId } = await ctx.params;
  const result = await prisma.projectCoi.deleteMany({ where: { id: coiId, projectId: id } });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
