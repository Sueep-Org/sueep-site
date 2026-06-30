import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditPricing } from "@/lib/erpAuth";
import { sanitizeTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import type { ErpRole } from "@/lib/erpSession";

export async function GET() {
  const buildings = await prisma.building.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(buildings);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const address = String(body.address || "").trim();
  if (!name || !address) {
    return NextResponse.json({ error: "name and address are required" }, { status: 400 });
  }
  if (body.pricingPackage !== undefined && !canEditPricing((req.headers.get("x-erp-role") as ErpRole) ?? "EMPLOYEE")) {
    return NextResponse.json({ error: "Only Admin, Project Manager, or Estimation roles can edit pricing packages" }, { status: 403 });
  }

  try {
    const building = await prisma.building.create({
      data: {
        name,
        builder:
          body.builder != null && String(body.builder).trim() !== ""
            ? String(body.builder).trim()
            : null,
        address,
        pmName:
          body.pmName != null && String(body.pmName).trim() !== ""
            ? String(body.pmName).trim()
            : null,
        pmEmail:
          body.pmEmail != null && String(body.pmEmail).trim() !== ""
            ? String(body.pmEmail).trim()
            : null,
        pmPhone:
          body.pmPhone != null && String(body.pmPhone).trim() !== ""
            ? String(body.pmPhone).trim()
            : null,
        pricingPackage:
          body.pricingPackage != null ? sanitizeTurnoverPricingPackage(body.pricingPackage) : undefined,
      },
    });
    return NextResponse.json(building);
  } catch (e) {
    console.error("POST /api/erp/buildings", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
