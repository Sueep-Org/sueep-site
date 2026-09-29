"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";

const input = inputClass.md;
const label = labelClass.default;

type Contract = {
  id: string;
  monthlyRateCents: number;
  billingDayOfMonth: number;
  startDate: string;
  endDate: string | null;
  serviceAreas: string | null;
  notes: string | null;
  commissionEmployeeId: string | null;
};

type Building = { id: string; pmName: string | null; pmEmail: string | null; pmPhone: string | null };

/** Contract terms, always editable with one Save, same pattern as the
 * Building and Employee profile forms. */
export function ContractDetailsForm({
  contract,
  building,
  employees,
}: {
  contract: Contract;
  building: Building;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [billingDay, setBillingDay] = useState(String(contract.billingDayOfMonth));
  const [startDate, setStartDate] = useState(contract.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(contract.endDate ? contract.endDate.slice(0, 10) : "");
  const [serviceAreas, setServiceAreas] = useState(contract.serviceAreas ?? "");
  const [notes, setNotes] = useState(contract.notes ?? "");
  const [salespersonId, setSalespersonId] = useState(contract.commissionEmployeeId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/janitorial/contracts/${contract.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          billingDayOfMonth: Number(billingDay),
          startDate,
          endDate: endDate || null,
          serviceAreas,
          notes,
          commissionEmployeeId: salespersonId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      toast("Contract saved", "success");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const pm = [building.pmName, building.pmEmail, building.pmPhone].filter(Boolean).join(" · ");

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={label}>Monthly rate</span>
          <p className="mt-1 py-2 text-sm font-semibold text-gray-900">
            {centsToDollars(contract.monthlyRateCents)}{" "}
            <span className="text-xs font-normal text-gray-500">set on the Pricing tab</span>
          </p>
        </div>
        <div>
          <label className={label} htmlFor="cd-day">Billing day of month *</label>
          <input id="cd-day" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} required className={input} />
          <p className="mt-1 text-xs text-gray-500">1 to 28. The month is added on this day.</p>
        </div>
        <div>
          <label className={label} htmlFor="cd-start">Start date *</label>
          <input id="cd-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={input} />
        </div>
        <div>
          <label className={label} htmlFor="cd-end">End date</label>
          <input id="cd-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="cd-areas">Service areas</label>
          <input
            id="cd-areas"
            type="text"
            placeholder="e.g. Lobby, hallways, gym, 3 common bathrooms"
            value={serviceAreas}
            onChange={(e) => setServiceAreas(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="cd-salesperson">Salesperson (for commission)</label>
          <SearchableSelect
            id="cd-salesperson"
            value={salespersonId}
            onChange={setSalespersonId}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="Search employees…"
            allLabel="Unassigned"
            className="mt-1"
          />
        </div>
        <div>
          <span className={label}>Property manager</span>
          <p className="mt-1 py-2 text-sm text-gray-700">
            {pm || <span className="text-gray-400">None on file</span>}{" "}
            <Link href={`/erp/buildings/${building.id}`} className="text-xs text-pink-600 hover:underline">
              Edit on building
            </Link>
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={label} htmlFor="cd-notes">Notes</label>
          <textarea id="cd-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
