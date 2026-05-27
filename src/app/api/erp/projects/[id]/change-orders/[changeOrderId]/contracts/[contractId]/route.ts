import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string; contractId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { changeOrderId, contractId } = await ctx.params;

  const contract = await prisma.changeOrderContract.findFirst({
    where: { id: contractId, changeOrderId },
    select: { id: true, signingStatus: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (contract.signingStatus === "SIGNED") {
    return NextResponse.json({ error: "Cannot remove a signed contract" }, { status: 409 });
  }

  await prisma.changeOrderContract.delete({ where: { id: contractId } });

  return NextResponse.json({ ok: true });
}
