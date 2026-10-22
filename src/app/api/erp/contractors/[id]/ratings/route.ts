import { revalidateTag } from "next/cache";
import { SUB_SCORES_TAG } from "@/lib/erp/subBidStats";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals } from "@/lib/erp/subBids";
import { RATING_KEYS, isValidScore } from "@/lib/erp/subScores";

type Ctx = { params: Promise<{ id: string }> };

/** Rate a sub 1-5 on quality, reliability and communication, optionally about one job. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { id: true } });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  for (const k of RATING_KEYS) {
    if (!isValidScore(body[k])) return NextResponse.json({ error: "Rate all three, 1 to 5" }, { status: 400 });
  }
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  if (projectId && !(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Project not found" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const employee = await prisma.employee.findFirst({ where: { email: { equals: auth.email, mode: "insensitive" } }, select: { firstName: true, lastName: true } });
  const rating = await prisma.contractorRating.create({
    data: {
      contractorId: id,
      projectId,
      quality: body.quality as number,
      reliability: body.reliability as number,
      communication: body.communication as number,
      note,
      ratedBy: auth.email,
      ratedByName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : null,
    },
  });
  revalidateTag(SUB_SCORES_TAG);
  return NextResponse.json({ id: rating.id });
}
