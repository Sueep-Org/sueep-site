"use client";

import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { BuildingProfileEditor } from "./BuildingProfileEditor";
import { BuildingReadOnlySummary } from "./[id]/BuildingReadOnlySummary";
import { BuildingPricingPackageEditor } from "./BuildingPricingPackageEditor";
import { RecurringContractEditor } from "./RecurringContractEditor";
import { BuildingUnitsSection, type BuildingUnit } from "./[id]/BuildingUnitsSection";
import { BuildingLaborSection, type LaborEmployeeOption } from "./[id]/BuildingLaborSection";
import { BuildingNotesSection, type BuildingNoteRow } from "./[id]/BuildingNotesSection";

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
  canLogHours?: boolean;
  units: BuildingUnit[];
  /** Unit numbers enrolled on this building's active recurring contract —
   * see BuildingUnitsSection's own doc comment for why these need folding
   * into the duplicate-identifier warning alongside `units`. */
  activeRecurringContractUnitNumbers?: string[];
  employees: { id: string; name: string }[];
  laborEmployees?: LaborEmployeeOption[];
  commissionEmployeeId?: string | null;
  initialNotes: BuildingNoteRow[];
  currentUserId: string | null;
};

export function BuildingTabs({
  buildingId,
  buildingName,
  initial,
  initialPackage,
  isSupervisor,
  canEditPricing = false,
  canAddUnit = false,
  canLogHours = false,
  units,
  activeRecurringContractUnitNumbers = [],
  employees,
  laborEmployees = [],
  commissionEmployeeId = null,
  initialNotes,
  currentUserId,
}: Props) {
  const allTabs = [
    {
      label: "Details",
      content: (
        <>
          {isSupervisor ? (
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
          )}
          <div className="mt-4">
            <BuildingNotesSection buildingId={buildingId} initialNotes={initialNotes} currentUserId={currentUserId} />
          </div>
        </>
      ),
    },
    {
      label: "Units",
      content: (
        <BuildingUnitsSection
          buildingId={buildingId}
          units={units}
          canAdd={canAddUnit}
          activeRecurringContractUnitNumbers={activeRecurringContractUnitNumbers}
        />
      ),
    },
    ...(canLogHours
      ? [
          {
            label: "Log Hours",
            content: <BuildingLaborSection buildingId={buildingId} units={units} employees={laborEmployees} />,
          },
        ]
      : []),
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

  const tabs = isSupervisor
    ? allTabs.filter((t) => t.label === "Details" || t.label === "Units" || t.label === "Log Hours")
    : allTabs;

  return <DetailTabs tabs={tabs} />;
}
