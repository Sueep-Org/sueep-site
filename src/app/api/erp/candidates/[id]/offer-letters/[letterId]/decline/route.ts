import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadLetter, requireOfferCandidate, stageData } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

/** POST: the candidate turned the offer down. The letter is marked Declined and they move to Withdrew. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { error } = await requireOfferCandidate(id);
  if (error) return error;
  const letter = await loadLetter(id, letterId);
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });
  if (letter.status !== "SENT") return NextResponse.json({ error: "Only a sent letter can be declined" }, { status: 409 });
  await prisma.$transaction([
    prisma.offerLetter.update({ where: { id: letter.id }, data: { status: "DECLINED" } }),
    prisma.candidateApplication.update({ where: { id }, data: stageData("WITHDREW") }),
  ]);
  return NextResponse.json({ ok: true });
}
