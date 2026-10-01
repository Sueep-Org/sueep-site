import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { requestHolders } from "@/lib/erp/coiRequests";
import { findDuplicateHolder } from "@/lib/erp/coiHolders";

type Ctx = { params: Promise<{ id: string }> };

/** Saves one of a request's holders to Certificate Holders, with the request's requirements. Body: { index } */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { index?: unknown };
  const r = await prisma.coiRequest.findUnique({ where: { id } });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const h = requestHolders(r.holders)[typeof body.index === "number" ? body.index : -1];
  if (!h) return NextResponse.json({ error: "Holder not found" }, { status: 400 });

  const existing = await findDuplicateHolder([h.name]);
  if (existing) return NextResponse.json({ id: existing.id, name: existing.name, existed: true });

  const holder = await prisma.coiHolder.create({
    data: {
      name: h.name,
      address: h.address,
      contactName: r.requesterName,
      contactEmail: r.requesterEmail,
      contactPhone: r.requesterPhone,
      reqGlOccurrenceCents: r.reqGlOccurrenceCents,
      reqGlAggregateCents: r.reqGlAggregateCents,
      reqAutoCents: r.reqAutoCents,
      reqUmbrellaCents: r.reqUmbrellaCents,
      reqWcEmployersLiabilityCents: r.reqWcEmployersLiabilityCents,
      requiresAdditionalInsured: r.requiresAdditionalInsured,
      requiresWaiverOfSubrogation: r.requiresWaiverOfSubrogation,
      requiresPrimaryNoncontributory: r.requiresPrimaryNoncontributory,
      additionalInsureds: r.additionalInsureds,
      specialWording: r.specialWording,
    },
    select: { id: true, name: true },
  });
  return NextResponse.json({ id: holder.id, name: holder.name, existed: false });
}
