import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { BuildingTabs } from "../BuildingTabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export default async function BuildingDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { from } = await searchParams;
  const auth = await getErpAuth();
  const isSupervisor = auth?.role === "SUPERVISOR";
  const building = await prisma.building.findUnique({ where: { id } });
  if (!building) notFound();

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
        isSupervisor={isSupervisor}
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
