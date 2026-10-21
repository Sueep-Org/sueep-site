import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePostingInput } from "@/lib/erp/officeHiring";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST: add a job ad (LinkedIn, Indeed, ...) with its cost and applicant count. */
export async function POST(req: Request, ctx: Ctx) {
  const { error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { data, error } = parsePostingInput(body, true);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const opening = await prisma.jobOpening.findUnique({ where: { id }, select: { id: true } });
  if (!opening) return NextResponse.json({ error: "Opening not found" }, { status: 404 });

  const posting = await prisma.jobPosting.create({
    data: { ...data, source: data.source!, jobOpeningId: id },
    select: { id: true },
  });
  return NextResponse.json({ id: posting.id }, { status: 201 });
}
