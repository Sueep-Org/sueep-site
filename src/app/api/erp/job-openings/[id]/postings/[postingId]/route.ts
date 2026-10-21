import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePostingInput } from "@/lib/erp/officeHiring";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; postingId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  const { id, postingId } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { data, error } = parsePostingInput(body, false);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const result = await prisma.jobPosting.updateMany({ where: { id: postingId, jobOpeningId: id }, data });
  if (result.count === 0) return NextResponse.json({ error: "Posting not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  const { id, postingId } = await ctx.params;
  await prisma.jobPosting.deleteMany({ where: { id: postingId, jobOpeningId: id } });
  return new NextResponse(null, { status: 204 });
}
