import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { lienPatchData } from "@/lib/erp/lienPatch";

type Ctx = { params: Promise<{ id: string }> };

/** Saves the building's lien fields (its Liens tab). Same fields and rules as a project's. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const existing = await prisma.building.findUnique({ where: { id }, select: { lienDecision: true, lienDecisionNote: true, lienSteps: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const lien = lienPatchData(body, existing, auth.email ?? null);
  if ("error" in lien) return NextResponse.json({ error: lien.error }, { status: 400 });
  await prisma.building.update({ where: { id }, data: lien.data });
  return NextResponse.json({ ok: true });
}
