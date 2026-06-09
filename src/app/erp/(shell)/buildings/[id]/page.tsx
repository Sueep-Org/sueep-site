import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BuildingProfileEditor } from "../BuildingProfileEditor";

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
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{building.name}</h1>
            <p className="mt-1 text-sm text-gray-600">Edit building information and property manager contact details.</p>
          </div>
          <Link
            href={`/erp/buildings/${building.id}/pricing-package`}
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700"
          >
            Price package
          </Link>
        </div>
      </div>

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
    </div>
  );
}
