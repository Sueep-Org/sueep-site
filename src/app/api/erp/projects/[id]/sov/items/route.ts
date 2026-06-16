import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSovPercentDone } from "@/lib/sovSync";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const description = String(body.description || "").trim();
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

  const scheduledValueCents = Math.max(0, Math.round(Number(body.scheduledValueCents) || 0));

  const sov = await prisma.projectSOV.upsert({
    where: { projectId: id },
    create: { projectId: id },
    update: {},
    select: { id: true },
  });

  const VALID_BILLING = ["NOT_BILLED", "BILLED", "PAID"];
  const billingStatus = VALID_BILLING.includes(String(body.billingStatus ?? ""))
    ? String(body.billingStatus)
    : "NOT_BILLED";

  const item = await prisma.projectSOVItem.create({
    data: {
      sovId: sov.id,
      order: Math.round(Number(body.order) || 0),
      description,
      scheduledValueCents,
      completed: false,
      billingStatus,
    },
  });

  await syncSovPercentDone(id);
  return NextResponse.json(item, { status: 201 });
}
