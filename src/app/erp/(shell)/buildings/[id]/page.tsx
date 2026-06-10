import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BuildingTabs } from "../BuildingTabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function BuildingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const building = await prisma.building.findUnique({ where: { id } });
  if (!building) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/buildings" className="text-xs text-pink-600 hover:underline">
          Back to buildings
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl font-semibold text-gray-900">{building.name}</h1>
        </div>
      </div>

      <BuildingTabs
        buildingId={building.id}
        buildingName={building.name}
        initial={{
          name: building.name,
          builder: building.builder,
          address: building.address,
          pmName: building.pmName,
          pmEmail: building.pmEmail,
          pmPhone: building.pmPhone,
        }}
        initialPackage={building.pricingPackage}
      />
    </div>
  );
}
