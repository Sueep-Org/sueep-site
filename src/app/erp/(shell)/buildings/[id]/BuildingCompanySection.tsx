"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InfoTip, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { SearchableSelect, type SearchableSelectOption } from "@/app/erp/components/SearchableSelect";
import { BillingOverrideForm } from "@/app/erp/components/companies/BillingOverrideForm";
import { InvoiceDestinationCard } from "@/app/erp/components/companies/InvoiceDestinationCard";
import type { BillingOverride } from "@/lib/erp/clientCompanies";
import type { InvoiceDestination } from "@/lib/erp/invoiceDestination";

export type ManagementPeriodRow = { id: string; companyId: string; companyName: string; from: string | null; to: string | null };

function fmt(key: string | null): string {
  if (!key) return "start unknown";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Building Details tab: who manages and owns it, history, and where its invoices go. */
export function BuildingCompanySection({
  buildingId,
  managedByCompanyId,
  ownedByCompanyId,
  history,
  options,
  canEditBilling,
  override,
  destination,
}: {
  buildingId: string;
  managedByCompanyId: string | null;
  ownedByCompanyId: string | null;
  /** Every management period, newest first */
  history: ManagementPeriodRow[];
  options: SearchableSelectOption[];
  canEditBilling: boolean;
  override: BillingOverride;
  destination: InvoiceDestination;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pendingManager, setPendingManager] = useState<string | null>(null);
  const [asOf, setAsOf] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingOverride, setEditingOverride] = useState(false);
  const endpoint = `/api/erp/buildings/${buildingId}/company`;

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      toast(data.error ?? "Could not save.");
      return false;
    }
    router.refresh();
    return true;
  }

  function pickManager(v: string) {
    if ((v || null) === managedByCompanyId) {
      setPendingManager(null);
      return;
    }
    setPendingManager(v);
    setAsOf(managedByCompanyId ? todayKey() : "");
  }

  async function saveManager() {
    if (pendingManager == null) return;
    if (await patch({ managedByCompanyId: pendingManager || null, asOf: asOf || null })) setPendingManager(null);
  }

  const past = history.filter((h) => h.to);
  const currentName = options.find((o) => o.value === managedByCompanyId)?.label;
  const pendingName = pendingManager ? options.find((o) => o.value === pendingManager)?.label : "no company";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Client &amp; billing
        <InfoTip text="The managing company is the client for every job here unless a project picks its own. Manage companies on the Companies page." />
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass.default}>
            <span className="inline-flex items-center gap-1">
              Managed by
              <InfoTip text="Changing it keeps the old company in the history below with an end date." />
            </span>
          </span>
          <SearchableSelect
            value={pendingManager ?? managedByCompanyId ?? ""}
            onChange={pickManager}
            options={options}
            allLabel="No company"
            className="mt-1"
            disabled={saving}
          />
        </div>
        <div>
          <span className={labelClass.default}>
            <span className="inline-flex items-center gap-1">
              Owned by
              <InfoTip text="Optional. The property owner, used for liens." />
            </span>
          </span>
          <SearchableSelect
            value={ownedByCompanyId ?? ""}
            onChange={(v) => void patch({ ownedByCompanyId: v || null })}
            options={options}
            allLabel="Not set"
            className="mt-1"
            disabled={saving}
          />
        </div>
      </div>

      {pendingManager != null && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <span className="self-center">
            {managedByCompanyId ? `Change from ${currentName} to ${pendingName}` : `Set to ${pendingName}`}
          </span>
          <label className={labelClass.compact}>
            {managedByCompanyId ? "As of" : "Since (optional)"}
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={`${inputClass.xs} mt-0.5 block`} />
          </label>
          <Button size="sm" onClick={saveManager} disabled={saving}>
            Save
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setPendingManager(null)} disabled={saving}>
            Cancel
          </Button>
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500">Past management</p>
          <ul className="mt-1 text-sm text-gray-600">
            {past.map((h) => (
              <li key={h.id}>
                <Link href={`/erp/companies/${h.companyId}`} className="hover:text-pink-600">
                  {h.companyName}
                </Link>
                <span className="ml-2 text-xs text-gray-500">
                  {fmt(h.from)} to {fmt(h.to)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <InvoiceDestinationCard destination={destination} />
        {canEditBilling && (
          <Button variant="ghost" size="xs" className="mt-1" onClick={() => setEditingOverride(true)}>
            Edit billing override for this building
          </Button>
        )}
      </div>
      {editingOverride && <BillingOverrideForm endpoint={endpoint} initial={override} levelLabel="building" onClose={() => setEditingOverride(false)} />}
    </section>
  );
}
