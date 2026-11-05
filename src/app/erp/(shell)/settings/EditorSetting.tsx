"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip } from "@/app/erp/components/ui";
import type { EmployeeOption } from "@/app/erp/components/EmployeeCombobox";
import type { EditorSettingId } from "@/lib/erp/settingsRegistry";
import type { TurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import type { CoPricingPackage } from "@/lib/coPricingPackage";
import { EmployerTaxRatesModal } from "../payroll/EmployerTaxRatesModal";
import { HealthInsuranceModal } from "../payroll/HealthInsuranceModal";
import { BuildingPricingPackageEditor } from "../buildings/BuildingPricingPackageEditor";
import { BuildingCoPricingPackageEditor } from "../buildings/BuildingCoPricingPackageEditor";
import { CommissionTiersEditor } from "./CommissionTiersEditor";
import type { Dated } from "@/lib/erp/datedSettings";
import type { MarginTier } from "@/lib/erp/payrollRules";

export type StandardLists = {
  turnover: { pkg: TurnoverPricingPackage; saved: boolean };
  co: { pkg: CoPricingPackage; saved: boolean };
};

export type CommissionTiersData = { history: Dated<MarginTier[]>; saved: boolean };

/** A setting with a bigger editor: the Payroll page's windows, or a price table shown below the row. */
export function EditorSetting({
  id,
  label,
  info,
  employees,
  standards,
  tiers,
}: {
  id: EditorSettingId;
  label: string;
  info: string;
  employees: EmployeeOption[];
  standards: StandardLists | null;
  tiers: CommissionTiersData | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const saved = () => router.refresh();
  const inline = id === "turnoverPrices" || id === "coIssues" || id === "commissionTiers";

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-[14rem] flex-1 items-center gap-1.5 text-sm font-medium text-gray-900">
          {label}
          <InfoTip text={info} />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={inline ? open : undefined}>
          {inline && open ? "Close" : "Open"}
        </Button>
      </div>
      {id === "employerTax" && <EmployerTaxRatesModal open={open} onClose={close} onSaved={saved} />}
      {id === "health" && <HealthInsuranceModal open={open} onClose={close} onSaved={saved} employees={employees} />}
      {open && id === "turnoverPrices" && standards && (
        <div className="mt-4">
          <BuildingPricingPackageEditor initialPackage={standards.turnover.pkg} canEdit standard={{ saved: standards.turnover.saved }} />
        </div>
      )}
      {open && id === "commissionTiers" && tiers && (
        <div className="mt-4">
          <CommissionTiersEditor history={tiers.history} saved={tiers.saved} />
        </div>
      )}
      {open && id === "coIssues" && standards && (
        <div className="mt-4">
          <BuildingCoPricingPackageEditor initialPackage={standards.co.pkg} canEdit standardSaved={standards.co.saved} />
        </div>
      )}
    </div>
  );
}
