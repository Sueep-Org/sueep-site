import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { defaultSueepContact, propertyManagerLinkUrl } from "@/lib/erp/propertyManagers";
import { PropertyManagersHeader } from "./PropertyManagersHeader";
import { PropertyManagersTable, type BuildingOption, type PropertyManagerRow } from "./PropertyManagersTable";

export const metadata: Metadata = {
  title: "Property Managers",
};

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ add?: string; open?: string }> };

/** `?add=<buildingId>` opens Add with that building picked; `?open=<id>` opens that property manager. Both come from the building page. */
export default async function PropertyManagersPage({ searchParams }: PageProps) {
  const { add, open } = await searchParams;
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) redirect("/erp");

  const [managers, buildings, openRequests, openChanges, defaultContact] = await Promise.all([
    prisma.propertyManager.findMany({
      orderBy: { name: "asc" },
      include: { buildings: { select: { buildingId: true } } },
    }),
    prisma.building.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, pmName: true, pmEmail: true, pmPhone: true },
    }),
    prisma.propertyManagerRequest.count({ where: { status: "REQUESTED" } }),
    prisma.propertyManagerChange.count({ where: { status: "OPEN" } }),
    defaultSueepContact(auth.email),
  ]);

  const rows: PropertyManagerRow[] = managers.map((m) => ({
    id: m.id,
    name: m.name,
    company: m.company,
    email: m.email,
    phone: m.phone,
    notes: m.notes,
    active: m.active,
    url: propertyManagerLinkUrl(m.token),
    lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    buildingIds: m.buildings.map((b) => b.buildingId),
    weeklyEmail: m.weeklyEmail,
    sueepContactName: m.sueepContactName,
    sueepContactPhone: m.sueepContactPhone,
    sueepContactEmail: m.sueepContactEmail,
  }));
  const buildingOptions: BuildingOption[] = buildings;

  return (
    <div className="space-y-6">
      <PropertyManagersHeader active="managers" requestCount={openRequests + openChanges} />
      <PropertyManagersTable
        managers={rows}
        buildings={buildingOptions}
        defaultContact={defaultContact}
        initialAddBuildingId={add ?? null}
        initialOpenId={open ?? null}
      />
    </div>
  );
}
