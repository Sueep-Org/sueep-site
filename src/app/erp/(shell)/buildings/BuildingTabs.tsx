"use client";

import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { BuildingProfileEditor } from "./BuildingProfileEditor";
import { BuildingPricingPackageEditor } from "./BuildingPricingPackageEditor";

type Props = {
  buildingId: string;
  buildingName: string;
  initial: {
    name: string;
    builder: string | null;
    address: string | null;
    pmName: string | null;
    pmEmail: string | null;
    pmPhone: string | null;
  };
  initialPackage: unknown;
};

export function BuildingTabs({ buildingId, buildingName, initial, initialPackage }: Props) {
  const tabs = [
    {
      label: "Details",
      content: (
        <BuildingProfileEditor buildingId={buildingId} initial={{ ...initial, address: initial.address ?? "" }} />
      ),
    },
    {
      label: "Pricing Package",
      content: (
        <div className="max-w-4xl">
          <BuildingPricingPackageEditor
            buildingId={buildingId}
            buildingName={buildingName}
            initialPackage={initialPackage}
          />
        </div>
      ),
    },
  ];

  return <DetailTabs tabs={tabs} />;
}
