"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, labelClass, useToast } from "@/app/erp/components/ui";
import { SearchableSelect, type SearchableSelectOption } from "@/app/erp/components/SearchableSelect";
import { BillingOverrideForm } from "@/app/erp/components/companies/BillingOverrideForm";
import { InvoiceDestinationCard } from "@/app/erp/components/companies/InvoiceDestinationCard";
import type { BillingOverride } from "@/lib/erp/clientCompanies";
import type { InvoiceDestination } from "@/lib/erp/invoiceDestination";

/** Project Overview: who we bill for this job and where its invoices go. */
export function ProjectCompanySection({
  projectId,
  clientCompanyId,
  hasBuilding,
  options,
  canEditBilling,
  override,
  destination,
}: {
  projectId: string;
  clientCompanyId: string | null;
  hasBuilding: boolean;
  options: SearchableSelectOption[];
  canEditBilling: boolean;
  override: BillingOverride;
  destination: InvoiceDestination;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [editingOverride, setEditingOverride] = useState(false);
  const endpoint = `/api/erp/projects/${projectId}/company`;

  async function pick(v: string) {
    setSaving(true);
    const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientCompanyId: v || null }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return;
    }
    router.refresh();
  }

  // When nothing is picked here, the building's managing company is the client.
  const buildingCompany = !clientCompanyId && destination.company?.via === "building" ? destination.company.name : null;
  const blankLabel = buildingCompany ? `Same as building (${buildingCompany})` : hasBuilding ? "Same as building (none set)" : "Not set";

  return (
    <div>
      <div className="max-w-md">
        <span className={labelClass.default}>
          <span className="inline-flex items-center gap-1">
            Client company
            <InfoTip text="Who we bill for this job. Leave it on the building's company unless this job bills someone else, like a GC." />
          </span>
        </span>
        <SearchableSelect value={clientCompanyId ?? ""} onChange={(v) => void pick(v)} options={options} allLabel={blankLabel} className="mt-1" disabled={saving} />
      </div>
      <div className="mt-3">
        <InvoiceDestinationCard destination={destination} />
        {canEditBilling && (
          <Button variant="ghost" size="xs" className="mt-1" onClick={() => setEditingOverride(true)}>
            Edit billing override for this project
          </Button>
        )}
      </div>
      {editingOverride && <BillingOverrideForm endpoint={endpoint} initial={override} levelLabel="project" onClose={() => setEditingOverride(false)} />}
    </div>
  );
}
