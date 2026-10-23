import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseOfferValues } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";
import { applyIncluded, loadTemplateForLetter, requireOfferCandidate, signByDateOf } from "@/lib/erp/offerLetterServer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST: save a new draft letter. Body: { templateId, values, included, commission }. The template's wording is copied onto the letter. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { auth, error } = await requireOfferCandidate(id);
  if (error) return error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const template = await loadTemplateForLetter(body.templateId);
  if (!template) return NextResponse.json({ error: "Pick a template" }, { status: 400 });

  const values = parseOfferValues(body.values);
  const letter = await prisma.offerLetter.create({
    data: {
      candidateId: id,
      templateId: template.id,
      values: values as Prisma.InputJsonValue,
      sections: applyIncluded(template.sections, body.included) as unknown as Prisma.InputJsonValue,
      commission: body.commission ? (parseCommission(body.commission) as unknown as Prisma.InputJsonValue) : undefined,
      signByDate: signByDateOf(values),
      createdBy: auth.email,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: letter.id }, { status: 201 });
}
