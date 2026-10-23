import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadLetter, requireOfferCandidate } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

/** POST: cancel a sent letter (wrong numbers, offer changed). It stays on file, marked Void. */
export async function POST(_req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { error } = await requireOfferCandidate(id);
  if (error) return error;
  const letter = await loadLetter(id, letterId);
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 });
  if (letter.status !== "SENT") return NextResponse.json({ error: "Only a sent letter can be voided" }, { status: 409 });
  await prisma.offerLetter.update({ where: { id: letter.id }, data: { status: "VOID" } });
  return NextResponse.json({ ok: true });
}
