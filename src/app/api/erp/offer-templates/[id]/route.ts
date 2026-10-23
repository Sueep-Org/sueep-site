import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditOfferTemplates } from "@/lib/erpAuth";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";
import { parseSections, unknownBlanks } from "@/lib/erp/offerLetters";
import { parseCommission } from "@/lib/erp/offerCommission";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function editor() {
  const { auth, error } = await requireOfficeHiring();
  if (error) return { auth: null, error };
  if (!canEditOfferTemplates(auth.role)) {
    return { auth: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { auth, error: null };
}

const optText = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

/** PATCH: save the editor (name, description, signer, sections) or archive / restore. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { auth, error: authError } = await editor();
  if (authError) return authError;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const data: Prisma.OfferLetterTemplateUpdateInput = { updatedBy: auth.email };
  if ("name" in body) {
    const name = optText(body.name, 120);
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = name;
  }
  if ("description" in body) data.description = optText(body.description, 500);
  if ("signerName" in body) data.signerName = optText(body.signerName, 120);
  if ("signerTitle" in body) data.signerTitle = optText(body.signerTitle, 120);
  if ("archived" in body) data.archived = body.archived === true;
  if ("commissionDefaults" in body) data.commissionDefaults = parseCommission(body.commissionDefaults) as unknown as Prisma.InputJsonValue;
  if ("sections" in body) {
    const { sections, error } = parseSections(body.sections);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const typos = unknownBlanks(sections.map((s) => `${s.title}\n${s.body}\n${s.acceptBody ?? ""}`).join("\n"));
    if (typos.length) {
      return NextResponse.json({ error: `Unknown blank${typos.length > 1 ? "s" : ""}: ${typos.map((t) => `{${t}}`).join(", ")}` }, { status: 400 });
    }
    data.sections = sections as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.offerLetterTemplate.update({ where: { id }, data, select: { id: true } }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE: only for templates never used for a letter. Used ones get archived instead. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { error: authError } = await editor();
  if (authError) return authError;
  const { id } = await ctx.params;

  const used = await prisma.offerLetter.count({ where: { templateId: id } });
  if (used > 0) return NextResponse.json({ error: "This template has letters. Archive it instead." }, { status: 409 });
  const deleted = await prisma.offerLetterTemplate.delete({ where: { id } }).catch(() => null);
  if (!deleted) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
