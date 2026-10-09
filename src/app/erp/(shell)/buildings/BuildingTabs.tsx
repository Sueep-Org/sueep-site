"use client";

import Link from "next/link";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { centsToDollars } from "@/lib/erp/money";
import { BuildingProfileEditor } from "./BuildingProfileEditor";
import { BuildingReadOnlySummary } from "./[id]/BuildingReadOnlySummary";
import { BuildingPricingPackageEditor } from "./BuildingPricingPackageEditor";
import { BuildingUnitsSection, type BuildingUnit } from "./[id]/BuildingUnitsSection";
import { BuildingLaborSection, type LaborEmployeeOption } from "./[id]/BuildingLaborSection";
import { BuildingNotesSection, type BuildingNoteRow } from "./[id]/BuildingNotesSection";
import { BuildingPropertyManagersSection, type BuildingPropertyManager } from "./[id]/BuildingPropertyManagersSection";
import { HubSpotDocumentsSection } from "@/app/erp/components/HubSpotDocumentsSection";

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
  /** HubSpot invoices/quotes tab, financial roles only */
  canSeeInvoices?: boolean;
  units: BuildingUnit[];
  /** This building's janitorial (recurring) contract, managed on the Janitorial Contracts page. */
  janitorialContract?: { id: string; status: string; monthlyRateCents: number } | null;
  canManageJanitorial?: boolean;
  employees: { id: string; name: string }[];
  laborEmployees?: LaborEmployeeOption[];
  commissionEmployeeId?: string | null;
  initialNotes: BuildingNoteRow[];
  currentUserId: string | null;
  /** Null for roles that can't manage property managers */
  propertyManagers?: BuildingPropertyManager[] | null;
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
  canSeeInvoices = false,
  units,
  janitorialContract = null,
  canManageJanitorial = false,
  employees,
  laborEmployees = [],
  commissionEmployeeId = null,
  initialNotes,
  currentUserId,
  propertyManagers = null,
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
          {propertyManagers && (
            <div className="mt-4">
              <BuildingPropertyManagersSection
                buildingId={buildingId}
                managers={propertyManagers}
                contactEmail={initial.pmEmail}
                contactName={initial.pmName}
              />
            </div>
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
    ...(canSeeInvoices
      ? [
          {
            label: "Invoices & Quotes",
            content: (
              <HubSpotDocumentsSection
                endpoint={`/api/erp/buildings/${buildingId}/hubspot-documents`}
                noDealMessage="No HubSpot deal is linked to this building. Link one on the Details tab."
                invoicesInfo="Read live from this building's HubSpot deal. Opening this tab also refreshes the invoice shown on each unit."
              />
            ),
          },
        ]
      : []),
    {
      label: "Janitorial Contract",
      content: (
        <div className="max-w-lg rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
          {janitorialContract ? (
            <>
              <p>
                {janitorialContract.status === "ACTIVE" ? "Active" : janitorialContract.status === "PAUSED" ? "Paused" : "Ended"} contract,{" "}
                <span className="font-semibold text-gray-900">{centsToDollars(janitorialContract.monthlyRateCents)}</span>/month.
              </p>
              {canManageJanitorial && (
                <Link href={`/erp/janitorial/contracts/${janitorialContract.id}`} className="mt-2 inline-block text-pink-600 hover:underline">
                  Open contract
                </Link>
              )}
            </>
          ) : (
            <>
              <p>This building has no janitorial contract.</p>
              {canManageJanitorial && (
                <Link href="/erp/janitorial" className="mt-2 inline-block text-pink-600 hover:underline">
                  Set one up on the Janitorial Contracts page
                </Link>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const tabs = isSupervisor
    ? allTabs.filter((t) => t.label === "Details" || t.label === "Units" || t.label === "Log Hours")
    : allTabs;

  return <DetailTabs tabs={tabs} />;
}
