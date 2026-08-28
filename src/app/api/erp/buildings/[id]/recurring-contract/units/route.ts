import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const contract = await prisma.recurringContract.findUnique({ where: { buildingId: id }, select: { id: true } });
  if (!contract) return NextResponse.json({ error: "No recurring contract for this building" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const unitNumber = String(body.unitNumber || "").trim();
  if (!unitNumber) return NextResponse.json({ error: "unitNumber is required" }, { status: 400 });

  const isCommonArea = Boolean(body.isCommonArea);
  const bedrooms = body.bedrooms != null && body.bedrooms !== "" ? Number(body.bedrooms) : null;
  const bathrooms = body.bathrooms != null && body.bathrooms !== "" ? Number(body.bathrooms) : null;

  const unit = await prisma.recurringContractUnit.create({
    data: {
      recurringContractId: contract.id,
      unitNumber,
      bedrooms: isCommonArea ? null : bedrooms,
      bathrooms: isCommonArea ? null : bathrooms,
      isCommonArea,
      fullClean: body.fullClean !== undefined ? Boolean(body.fullClean) : true,
      carpetCleaning: Boolean(body.carpetCleaning),
    },
  });
  return NextResponse.json(unit);
}
