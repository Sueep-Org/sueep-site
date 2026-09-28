"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { centsToDollars } from "@/lib/erp/money";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { ContractStatusBadge } from "../../badges";

type Contract = {
  id: string;
  monthlyRateCents: number;
  billingDayOfMonth: number;
  status: string;
  startDate: string;
  endDate: string | null;
  serviceAreas: string | null;
  notes: string | null;
  commissionEmployeeId: string | null;
};

type EmployeeOption = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelClass = "block text-xs font-medium text-gray-600";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ContractDetailsCard({ contract, employees }: { contract: Contract; employees: EmployeeOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [serviceAreas, setServiceAreas] = useState("");
  const [notes, setNotes] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError("");
    const res = await fetch(`/api/erp/janitorial/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Update failed");
      return false;
    }
    router.refresh();
    return true;
  }

  function startEdit() {
    setRate((contract.monthlyRateCents / 100).toFixed(2));
    setBillingDay(String(contract.billingDayOfMonth));
    setStartDate(contract.startDate.slice(0, 10));
    setEndDate(contract.endDate ? contract.endDate.slice(0, 10) : "");
    setServiceAreas(contract.serviceAreas ?? "");
    setNotes(contract.notes ?? "");
    setSalespersonId(contract.commissionEmployeeId ?? "");
    setError("");
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await patch({
        monthlyRate: rate,
        billingDayOfMonth: Number(billingDay),
        startDate,
        endDate: endDate || null,
        serviceAreas,
        notes,
        commissionEmployeeId: salespersonId || null,
      });
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function setStatus(status: string) {
    if (status === "ENDED" && !confirm("End this contract? No more months will be generated.")) return;
    void patch({ status });
  }

  const salespersonName = employees.find((e) => e.id === contract.commissionEmployeeId)?.name ?? "Unassigned";

  if (editing) {
    return (
      <form onSubmit={save} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="cd-rate">Monthly rate</label>
            <input id="cd-rate" type="text" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
            <p className="mt-1 text-xs text-gray-500">Applies to months generated from now on.</p>
          </div>
          <div>
            <label className={labelClass} htmlFor="cd-day">Billing day of month</label>
            <input id="cd-day" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cd-start">Start date</label>
            <input id="cd-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cd-end">End date (optional)</label>
            <input id="cd-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="cd-areas">Service areas</label>
            <input id="cd-areas" type="text" value={serviceAreas} onChange={(e) => setServiceAreas(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="cd-salesperson">Salesperson (for commission)</label>
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
            <label className={labelClass} htmlFor="cd-notes">Notes</label>
            <input id="cd-notes" type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500">Status</dt>
            <dd className="mt-0.5"><ContractStatusBadge status={contract.status} /></dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Monthly rate</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{centsToDollars(contract.monthlyRateCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Billing day</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">{contract.billingDayOfMonth}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Term</dt>
            <dd className="mt-0.5 text-gray-900">
              {formatDate(contract.startDate)} to {contract.endDate ? formatDate(contract.endDate) : "ongoing"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Salesperson</dt>
            <dd className="mt-0.5 text-gray-900">{salespersonName}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-gray-500">Service areas</dt>
            <dd className="mt-0.5 text-gray-900">{contract.serviceAreas || "Not set"}</dd>
          </div>
          {contract.notes && (
            <div className="col-span-2">
              <dt className="text-xs text-gray-500">Notes</dt>
              <dd className="mt-0.5 text-gray-900">{contract.notes}</dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startEdit} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Edit
          </button>
          {contract.status === "ACTIVE" && (
            <button type="button" onClick={() => setStatus("PAUSED")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              Pause
            </button>
          )}
          {contract.status !== "ACTIVE" && (
            <button type="button" onClick={() => setStatus("ACTIVE")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              {contract.status === "ENDED" ? "Reactivate" : "Resume"}
            </button>
          )}
          {contract.status !== "ENDED" && (
            <button type="button" onClick={() => setStatus("ENDED")} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              End contract
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}
