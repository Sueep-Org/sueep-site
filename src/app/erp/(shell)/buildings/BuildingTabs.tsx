"use client";

import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { BuildingProfileEditor } from "./BuildingProfileEditor";
import { BuildingReadOnlySummary } from "./[id]/BuildingReadOnlySummary";
import { BuildingPricingPackageEditor } from "./BuildingPricingPackageEditor";
import { RecurringContractEditor } from "./RecurringContractEditor";
import { BuildingUnitsSection, type BuildingUnit } from "./[id]/BuildingUnitsSection";

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
    hubspotDealId: string | null;
  };
  initialPackage: unknown;
  isSupervisor?: boolean;
  canEditPricing?: boolean;
  canAddUnit?: boolean;
  units: BuildingUnit[];
  employees: { id: string; name: string }[];
  commissionEmployeeId?: string | null;
};

export function BuildingTabs({
  buildingId,
  buildingName,
  initial,
  initialPackage,
  isSupervisor,
  canEditPricing = false,
  canAddUnit = false,
  units,
  employees,
  commissionEmployeeId = null,
}: Props) {
  const allTabs = [
    {
      label: "Details",
      content: isSupervisor ? (
        <BuildingReadOnlySummary
          name={initial.name}
          address={initial.address ?? ""}
          builder={initial.builder}
          pmName={initial.pmName}
          pmEmail={initial.pmEmail}
          pmPhone={initial.pmPhone}
        />
      ) : (
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
      label: "Units",
      content: <BuildingUnitsSection buildingId={buildingId} units={units} canAdd={canAddUnit} />,
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

  const tabs = isSupervisor ? allTabs.filter((t) => t.label === "Details" || t.label === "Units") : allTabs;

  return <DetailTabs tabs={tabs} />;
}
