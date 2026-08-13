import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditPricing, canAddTurnoverUnit, canAddLaborLogs } from "@/lib/erpAuth";
import { BuildingTabs } from "../BuildingTabs";
import { ProjectsBackLink } from "@/app/erp/components/ProjectsBackLink";
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
  const [building, employees, unitProjects, currentErpUser] = await Promise.all([
    prisma.building.findUnique({
      where: { id },
      include: {
        notes: {
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true, authorName: true, authorUserId: true },
        },
      },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, hourlyPayCents: true, role: true, status: true },
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
            isPartialTurn: true,
            partialTurnLayout: true,
            sqft: true,
            unitQuality: true,
            fullClean: true,
            fullPaint: true,
            touchUpPaint: true,
            carpetCleaning: true,
            materialsAdditional: true,
            ceilingPaint: true,
            compounding: true,
            otherWork: true,
            otherDescription: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    auth ? prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } }) : null,
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
      isPartialTurn: p.turnoverRequest!.isPartialTurn,
      partialTurnLayout: p.turnoverRequest!.partialTurnLayout,
      sqft: p.turnoverRequest!.sqft,
      unitQuality: p.turnoverRequest!.unitQuality,
      fullClean: p.turnoverRequest!.fullClean,
      fullPaint: p.turnoverRequest!.fullPaint,
      touchUpPaint: p.turnoverRequest!.touchUpPaint,
      carpetCleaning: p.turnoverRequest!.carpetCleaning,
      materialsAdditional: p.turnoverRequest!.materialsAdditional,
      ceilingPaint: p.turnoverRequest!.ceilingPaint,
      compounding: p.turnoverRequest!.compounding,
      otherWork: p.turnoverRequest!.otherWork,
      otherDescription: p.turnoverRequest!.otherDescription,
    }));

  return (
    <div className="space-y-6">
      <div>
        {from === "projects" ? (
          // Reads the tab/status filter ProjectsTabs last persisted, so this
          // lands back on whatever the user had selected instead of always
          // resetting to "All" — same mechanism the project detail page's
          // "← Projects" link uses.
          <ProjectsBackLink label="Back to projects" />
        ) : (
          <Link href="/erp/buildings" className="text-xs text-pink-600 hover:underline">
            Back to buildings
          </Link>
        )}
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
        laborEmployees={employees}
        canLogHours={auth ? canAddLaborLogs(auth.role) : false}
        commissionEmployeeId={building.commissionEmployeeId}
        initialNotes={building.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        currentUserId={currentErpUser?.id ?? null}
      />
    </div>
  );
}
