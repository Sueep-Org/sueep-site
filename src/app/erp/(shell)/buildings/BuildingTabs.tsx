"use client";

import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { BuildingProfileEditor } from "./BuildingProfileEditor";
import { BuildingPricingPackageEditor } from "./BuildingPricingPackageEditor";
import { RecurringContractEditor } from "./RecurringContractEditor";

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
  isSupervisor?: boolean;
  canEditPricing?: boolean;
};

export function BuildingTabs({ buildingId, buildingName, initial, initialPackage, isSupervisor, canEditPricing = false }: Props) {
  const allTabs = [
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
            canEdit={canEditPricing}
          />
        </div>
      ),
    },
    {
      label: "Recurring Contract",
      content: <RecurringContractEditor buildingId={buildingId} canEdit={canEditPricing} />,
    },
  ];

  const tabs = isSupervisor ? allTabs.filter((t) => t.label === "Details") : allTabs;

  return <DetailTabs tabs={tabs} />;
}
