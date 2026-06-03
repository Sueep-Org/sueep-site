import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BuildingProfileEditor } from "../BuildingProfileEditor";
import { BuildingPricingPackageEditor } from "../BuildingPricingPackageEditor";

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
          ← Buildings
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{building.name}</h1>
        <p className="mt-1 text-sm text-gray-600">Edit building information and property manager contact details.</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <BuildingProfileEditor
          buildingId={building.id}
          initial={{
            name: building.name,
            builder: building.builder,
            address: building.address,
            pmName: building.pmName,
            pmEmail: building.pmEmail,
            pmPhone: building.pmPhone,
          }}
        />
        <BuildingPricingPackageEditor
          buildingId={building.id}
          buildingName={building.name}
          initialPackage={building.pricingPackage}
        />
      </div>
    </div>
  );
}
