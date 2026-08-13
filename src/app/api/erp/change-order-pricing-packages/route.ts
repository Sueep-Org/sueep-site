import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditPricing } from "@/lib/erpAuth";
import { parseChangeOrderPricingPackageInput } from "@/lib/changeOrderPricingPackages";

export async function GET() {
  const packages = await prisma.changeOrderPricingPackage.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(packages);
}

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canEditPricing(auth.role)) {
    return NextResponse.json(
      { error: "Only Admin, Project Manager, Sales, or Estimation roles can create pricing packages" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let input;
  try {
    input = parseChangeOrderPricingPackageInput(body);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid package" }, { status: 400 });
  }

  // auth.uid is the Firebase UID, not ErpUser.id — resolve the actual row for attribution.
  const erpUser = await prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } });

  try {
    const pkg = await prisma.changeOrderPricingPackage.create({
      data: { ...input, createdByUserId: erpUser?.id },
    });
    return NextResponse.json(pkg);
  } catch (e) {
    console.error("POST /api/erp/change-order-pricing-packages", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
