import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseOfferValues, readSections } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";
import { applyIncluded, requireOfferCandidate, signByDateOf } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; letterId: string }> };

async function loadDraft(id: string, letterId: string) {
  const letter = await prisma.offerLetter.findFirst({ where: { id: letterId, candidateId: id }, select: { id: true, status: true, sections: true } });
  if (!letter) return { letter: null, error: NextResponse.json({ error: "Letter not found" }, { status: 404 }) };
  if (letter.status !== "DRAFT") return { letter: null, error: NextResponse.json({ error: "Only drafts can be changed" }, { status: 409 }) };
  return { letter, error: null };
}

/** PATCH: update a draft's blanks, which sections are in and the commission numbers. Body: { values, included, commission }. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { error: authError } = await requireOfferCandidate(id);
  if (authError) return authError;
  const { letter, error } = await loadDraft(id, letterId);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const values = parseOfferValues(body.values);
  await prisma.offerLetter.update({
    where: { id: letter.id },
    data: {
      values: values as Prisma.InputJsonValue,
      sections: applyIncluded(readSections(letter.sections), body.included) as unknown as Prisma.InputJsonValue,
      ...(body.commission ? { commission: parseCommission(body.commission) as unknown as Prisma.InputJsonValue } : {}),
      signByDate: signByDateOf(values),
    },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE: drafts only. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, letterId } = await ctx.params;
  const { error: authError } = await requireOfferCandidate(id);
  if (authError) return authError;
  const { letter, error } = await loadDraft(id, letterId);
  if (error) return error;
  await prisma.offerLetter.delete({ where: { id: letter.id } });
  return NextResponse.json({ ok: true });
}
