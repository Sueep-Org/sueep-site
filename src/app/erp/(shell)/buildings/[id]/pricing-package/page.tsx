import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canEditPricing } from "@/lib/erpAuth";
import { BuildingPricingPackageEditor } from "../../BuildingPricingPackageEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

export default async function BuildingPricingPackagePage({ params }: PageProps) {
  const { id } = await params;
  const auth = await getErpAuth();
  if (auth?.role === "EMPLOYEE" || auth?.role === "SUPERVISOR") notFound();
  const building = await prisma.building.findUnique({ where: { id } });
  if (!building) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/erp/buildings/${building.id}`} className="text-xs text-pink-600 hover:underline">
          Back to building
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Price package</h1>
            <p className="mt-1 text-sm text-gray-600">
              {building.name} rates for unit cleaning and painting turnover requests.
            </p>
          </div>
          <Link
            href="/erp/buildings"
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            All buildings
          </Link>
        </div>
      </div>

      <div className="max-w-4xl">
        <BuildingPricingPackageEditor
          buildingId={building.id}
          buildingName={building.name}
          initialPackage={building.pricingPackage}
          canEdit={auth ? canEditPricing(auth.role) : false}
        />
      </div>
    </div>
  );
}
