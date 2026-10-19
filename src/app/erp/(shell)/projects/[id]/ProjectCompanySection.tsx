"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
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
  cutoffDay,
  companyCutoffDay,
}: {
  projectId: string;
  /** This job's own billing cutoff day, and the client company's (shown as the default) */
  cutoffDay: number | null;
  companyCutoffDay: number | null;
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
  const [cutoff, setCutoff] = useState(cutoffDay?.toString() ?? "");
  const endpoint = `/api/erp/projects/${projectId}/company`;

  async function saveCutoff() {
    if (cutoff === (cutoffDay?.toString() ?? "")) return;
    setSaving(true);
    const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billingCutoffDay: cutoff === "" ? null : Number(cutoff) }) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      setCutoff(cutoffDay?.toString() ?? "");
      return;
    }
    router.refresh();
  }

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
      {canEditBilling && (
        <label className={`${labelClass.default} mt-3 block max-w-xs`}>
          <span className="inline-flex items-center gap-1">
            Billing cutoff day
            <InfoTip text="Day of the month this job's pay app or invoice is due to the GC. Leave blank to use the client company's. The job's PM gets a reminder 5 days before." />
          </span>
          <input
            type="number"
            min={1}
            max={31}
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            onBlur={() => void saveCutoff()}
            placeholder={companyCutoffDay ? `Company's: ${companyCutoffDay}` : "Not set"}
            className={`${inputClass.md} w-40`}
            disabled={saving}
          />
        </label>
      )}
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
