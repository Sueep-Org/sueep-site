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
  employees: { id: string; name: string }[];
  commissionEmployeeId?: string | null;
};

export function BuildingTabs({ buildingId, buildingName, initial, initialPackage, isSupervisor, canEditPricing = false, employees, commissionEmployeeId = null }: Props) {
  const allTabs = [
    {
      label: "Details",
      content: (
        <BuildingProfileEditor
          buildingId={buildingId}
          initial={{ ...initial, address: initial.address ?? "" }}
          commissionEmployeeId={commissionEmployeeId}
          employees={employees}
          canEditCommissionOwner={canEditPricing}
        />
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
      content: <RecurringContractEditor buildingId={buildingId} canEdit={canEditPricing} employees={employees} />,
    },
  ];

  const tabs = isSupervisor ? allTabs.filter((t) => t.label === "Details") : allTabs;

  return <DetailTabs tabs={tabs} />;
}
