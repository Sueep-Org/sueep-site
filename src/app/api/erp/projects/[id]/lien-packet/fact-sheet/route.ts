import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { buildLienFactSheetPdf, loadLienFactSheet, type LienFactSheetOverrides } from "@/lib/erp/lienFactSheet";
import { parseLienManualSteps } from "@/lib/erp/lienDeadline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Builds the fact sheet as a PDF with the reviewed values and returns it.
 * Also ticks the "fact sheet prepared" lien step, since making it is that
 * step. Nothing is sent to anyone.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const amount = Number(body.amount);
  const overrides: LienFactSheetOverrides = {
    sueepAddress: str(body.sueepAddress),
    propertyDescription: str(body.propertyDescription),
    workDescription: str(body.workDescription),
    amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined,
  };

  const result = await loadLienFactSheet(id, overrides);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const pdf = await buildLienFactSheetPdf(result.data);

  const project = await prisma.project.findUnique({ where: { id }, select: { lienSteps: true } });
  const steps = parseLienManualSteps(project?.lienSteps);
  if (!steps.letterPrepared) {
    steps.letterPrepared = { at: new Date().toISOString(), by: auth.email };
    await prisma.project.update({ where: { id }, data: { lienSteps: steps } });
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="lien-fact-sheet-${result.data.preparedKey}.pdf"`, "cache-control": "private, no-store" },
  });
}
