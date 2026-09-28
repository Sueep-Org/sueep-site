"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";

type Option = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelClass = "block text-xs font-medium text-gray-600";

export function NewContractForm({ buildings, employees }: { buildings: Option[]; employees: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("existing");
  const [buildingId, setBuildingId] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingAddress, setNewBuildingAddress] = useState("");
  const [pmName, setPmName] = useState("");
  const [pmEmail, setPmEmail] = useState("");
  const [pmPhone, setPmPhone] = useState("");
  const [rate, setRate] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [serviceAreas, setServiceAreas] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/erp/janitorial/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(buildingMode === "new"
            ? { newBuilding: { name: newBuildingName, address: newBuildingAddress, pmName, pmEmail, pmPhone } }
            : { buildingId }),
          monthlyRate: rate,
          billingDayOfMonth: Number(billingDay),
          startDate,
          serviceAreas,
          commissionEmployeeId: salespersonId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create contract");
        return;
      }
      router.push(`/erp/janitorial/contracts/${data.id}`);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        + New contract
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-semibold text-gray-900">New janitorial contract</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <div className="flex items-center gap-4 text-sm">
            <span className={labelClass}>Building</span>
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="radio" name="nc-building-mode" checked={buildingMode === "existing"} onChange={() => setBuildingMode("existing")} />
              Existing building
            </label>
            <label className="flex items-center gap-1.5 text-gray-700">
              <input type="radio" name="nc-building-mode" checked={buildingMode === "new"} onChange={() => setBuildingMode("new")} />
              New building
            </label>
          </div>
          {buildingMode === "existing" ? (
            <div className="sm:max-w-md">
              <SearchableSelect
                id="nc-building"
                value={buildingId}
                onChange={setBuildingId}
                options={buildings.map((b) => ({ value: b.id, label: b.name }))}
                placeholder="Search buildings…"
                allLabel="Pick a building"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500">Only buildings without a contract are listed.</p>
            </div>
          ) : (
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className={labelClass} htmlFor="nc-new-name">Building name</label>
                <input id="nc-new-name" type="text" value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} className={inputClass} />
              </div>
              <div className="lg:col-span-2">
                <label className={labelClass} htmlFor="nc-new-address">Address</label>
                <input id="nc-new-address" type="text" value={newBuildingAddress} onChange={(e) => setNewBuildingAddress(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="nc-pm-name">Property manager (optional)</label>
                <input id="nc-pm-name" type="text" value={pmName} onChange={(e) => setPmName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="nc-pm-email">PM email (optional)</label>
                <input id="nc-pm-email" type="email" value={pmEmail} onChange={(e) => setPmEmail(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="nc-pm-phone">PM phone (optional)</label>
                <input id="nc-pm-phone" type="tel" value={pmPhone} onChange={(e) => setPmPhone(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor="nc-rate">Monthly rate</label>
          <input id="nc-rate" type="text" placeholder="$0.00" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="nc-day">Billing day of month</label>
          <input id="nc-day" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="nc-start">Start date</label>
          <input id="nc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="nc-salesperson">Salesperson (for commission)</label>
          <SearchableSelect
            id="nc-salesperson"
            value={salespersonId}
            onChange={setSalespersonId}
            options={employees.map((e) => ({ value: e.id, label: e.name }))}
            placeholder="Search employees…"
            allLabel="Unassigned"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="nc-areas">Service areas</label>
          <input
            id="nc-areas"
            type="text"
            placeholder="e.g. Lobby, hallways, gym, 3 common bathrooms"
            value={serviceAreas}
            onChange={(e) => setServiceAreas(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
          {saving ? "Saving…" : "Create contract"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
