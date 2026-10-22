import { revalidateTag } from "next/cache";
import { SUB_SCORES_TAG } from "@/lib/erp/subBidStats";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canSeeProposals, parseSubBidBody } from "@/lib/erp/subBids";
import { serializeSubBid, subBidInclude, checkSubBidRefs } from "@/lib/erp/subBidRows";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const bids = await prisma.subBid.findMany({ where: { projectId: id }, orderBy: { amountCents: "asc" }, include: subBidInclude });
  return NextResponse.json(bids.map(serializeSubBid));
}

/** Log a sub's bid on this project. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = parseSubBidBody(body, false);
  if ("error" in parsed) return NextResponse.json(parsed, { status: 400 });
  const { sovItemIds = [], ...data } = parsed.data;
  const refError = await checkSubBidRefs(id, data.contractorId, sovItemIds);
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

  const bid = await prisma.subBid.create({
    data: {
      projectId: id,
      contractorId: data.contractorId ?? null,
      bidderName: data.bidderName ?? null,
      bidderCompany: data.bidderCompany ?? null,
      bidderEmail: data.bidderEmail ?? null,
      bidderPhone: data.bidderPhone ?? null,
      amountCents: data.amountCents!,
      receivedOn: data.receivedOn ?? null,
      status: data.status ?? "RECEIVED",
      notes: data.notes ?? null,
      createdBy: auth.email,
      sovItems: sovItemIds.length > 0 ? { connect: sovItemIds.map((sid) => ({ id: sid })) } : undefined,
    },
    include: subBidInclude,
  });
  revalidateTag(SUB_SCORES_TAG);
  return NextResponse.json(serializeSubBid(bid));
}
