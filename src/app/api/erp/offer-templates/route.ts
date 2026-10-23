import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditOfferTemplates } from "@/lib/erpAuth";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";
import { DEFAULT_SIGNER, STARTER_TEMPLATES, emptyTemplateSections } from "@/lib/erp/offerLetterStarters";

export const runtime = "nodejs";

/**
 * POST /api/erp/offer-templates
 *   { starters: true }    creates the starter templates that don't exist yet (by name)
 *   { duplicateOf: id }   copies a template as "<name> (copy)"
 *   { name }              new template with a starting section
 */
export async function POST(req: Request) {
  const { auth, error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  if (!canEditOfferTemplates(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if (body.starters === true) {
    const existing = await prisma.offerLetterTemplate.findMany({ select: { name: true } });
    const names = new Set(existing.map((t) => t.name.toLowerCase()));
    const missing = STARTER_TEMPLATES.filter((t) => !names.has(t.name.toLowerCase()));
    for (const t of missing) {
      await prisma.offerLetterTemplate.create({
        data: {
          name: t.name,
          description: t.description,
          sections: t.sections as unknown as Prisma.InputJsonValue,
          signerName: DEFAULT_SIGNER.name,
          signerTitle: DEFAULT_SIGNER.title,
          createdBy: auth.email,
          updatedBy: auth.email,
        },
      });
    }
    return NextResponse.json({ created: missing.length }, { status: 201 });
  }

  if (typeof body.duplicateOf === "string") {
    const src = await prisma.offerLetterTemplate.findUnique({ where: { id: body.duplicateOf } });
    if (!src) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const copy = await prisma.offerLetterTemplate.create({
      data: {
        name: `${src.name} (copy)`,
        description: src.description,
        sections: src.sections as Prisma.InputJsonValue,
        commissionDefaults: (src.commissionDefaults ?? undefined) as Prisma.InputJsonValue | undefined,
        signerName: src.signerName,
        signerTitle: src.signerTitle,
        createdBy: auth.email,
        updatedBy: auth.email,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: copy.id }, { status: 201 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const created = await prisma.offerLetterTemplate.create({
    data: {
      name,
      sections: emptyTemplateSections() as unknown as Prisma.InputJsonValue,
      signerName: DEFAULT_SIGNER.name,
      signerTitle: DEFAULT_SIGNER.title,
      createdBy: auth.email,
      updatedBy: auth.email,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
