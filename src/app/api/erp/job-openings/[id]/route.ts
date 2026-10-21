import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOpeningInput } from "@/lib/erp/officeHiring";
import { requireOfficeHiring } from "@/lib/erp/officeHiringAccess";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { data, error } = parseOpeningInput(body, false);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const current = await prisma.jobOpening.findUnique({ where: { id }, select: { status: true, closedAt: true } });
  if (!current) return NextResponse.json({ error: "Opening not found" }, { status: 404 });

  // closedAt marks when it stopped being open (Filled or Closed), for days-open stats.
  let closedAt: Date | null | undefined;
  if (data.status) {
    const ended = data.status === "FILLED" || data.status === "CLOSED";
    if (ended && !current.closedAt) closedAt = new Date();
    if (!ended) closedAt = null;
  }

  await prisma.jobOpening.update({
    where: { id },
    data: { ...data, ...(closedAt !== undefined ? { closedAt } : {}) },
  });
  return NextResponse.json({ ok: true });
}

/** Only an opening with no candidates can be deleted; otherwise close it instead. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { error: authError } = await requireOfficeHiring();
  if (authError) return authError;
  const { id } = await ctx.params;

  const count = await prisma.candidateApplication.count({ where: { jobOpeningId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This opening has ${count} candidate${count === 1 ? "" : "s"}. Set it to Closed instead.` },
      { status: 409 },
    );
  }
  await prisma.jobOpening.delete({ where: { id } }).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
