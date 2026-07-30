import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditPricing, canAddTurnoverUnit } from "@/lib/erpAuth";
import { BuildingTabs } from "../BuildingTabs";
import type { BuildingUnit } from "./BuildingUnitsSection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function BuildingDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const auth = await getErpAuth();
  const isSupervisor = auth?.role === "SUPERVISOR";
  const isEmployee = auth?.role === "EMPLOYEE";
  const [building, employees, unitProjects] = await Promise.all([
    prisma.building.findUnique({ where: { id } }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.project.findMany({
      where: { buildingId: id, turnoverRequestId: { not: null } },
      select: {
        id: true,
        status: true,
        turnoverRequest: {
          select: {
            unitNumber: true,
            bedrooms: true,
            bathrooms: true,
            sqft: true,
            unitQuality: true,
            fullClean: true,
            fullPaint: true,
            touchUpPaint: true,
            carpetCleaning: true,
            materialsAdditional: true,
            ceilingPaint: true,
            otherWork: true,
            otherDescription: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!building) notFound();

  const units: BuildingUnit[] = unitProjects
    .filter((p) => p.turnoverRequest)
    .map((p) => ({
      projectId: p.id,
      status: p.status,
      unitNumber: p.turnoverRequest!.unitNumber,
      bedrooms: p.turnoverRequest!.bedrooms,
      bathrooms: p.turnoverRequest!.bathrooms,
      sqft: p.turnoverRequest!.sqft,
      unitQuality: p.turnoverRequest!.unitQuality,
      fullClean: p.turnoverRequest!.fullClean,
      fullPaint: p.turnoverRequest!.fullPaint,
      touchUpPaint: p.turnoverRequest!.touchUpPaint,
      carpetCleaning: p.turnoverRequest!.carpetCleaning,
      materialsAdditional: p.turnoverRequest!.materialsAdditional,
      ceilingPaint: p.turnoverRequest!.ceilingPaint,
      otherWork: p.turnoverRequest!.otherWork,
      otherDescription: p.turnoverRequest!.otherDescription,
    }));

  const backHref = from === "projects" ? "/erp/projects" : "/erp/buildings";
  const backLabel = from === "projects" ? "Back to projects" : "Back to buildings";

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-pink-600 hover:underline">
          {backLabel}
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-semibold text-gray-900">{building.name}</h1>
        </div>
      </div>

      <BuildingTabs
        buildingId={building.id}
        buildingName={building.name}
        isSupervisor={isSupervisor || isEmployee}
        canEditPricing={auth ? canEditPricing(auth.role) : false}
        canAddUnit={auth ? canAddTurnoverUnit(auth.role) : false}
        units={units}
        initial={{
          name: building.name,
          builder: building.builder,
          address: building.address,
          pmName: building.pmName,
          pmEmail: building.pmEmail,
          pmPhone: building.pmPhone,
          hubspotDealId: building.hubspotDealId,
        }}
        initialPackage={building.pricingPackage}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
        commissionEmployeeId={building.commissionEmployeeId}
      />
    </div>
  );
}
