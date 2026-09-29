"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { emptyPricing, type ContractPricing } from "@/lib/erp/janitorialPricing";
import { PricingCalculator } from "./PricingCalculator";

type Option = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelClass = "block text-xs font-medium text-gray-600";

export function NewContractForm({ buildings, employees }: { buildings: Option[]; employees: Option[] }) {
  const router = useRouter();
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("existing");
  const [buildingId, setBuildingId] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingAddress, setNewBuildingAddress] = useState("");
  const [pmName, setPmName] = useState("");
  const [pmEmail, setPmEmail] = useState("");
  const [pmPhone, setPmPhone] = useState("");
  // The calculator is optional: a plain monthly rate works too, and pricing
  // can be built later on the contract's Pricing tab.
  const [useCalculator, setUseCalculator] = useState(false);
  const [rate, setRate] = useState("");
  const [pricing, setPricing] = useState<ContractPricing>(emptyPricing);
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
          ...(useCalculator ? { pricing } : { monthlyRate: rate }),
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

  const card = "space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm";
  const cardTitle = "text-sm font-semibold text-gray-900";

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={cardTitle}>Building</h2>
          <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-sm">
            {(
              [
                ["existing", "Existing building"],
                ["new", "New building"],
              ] as const
            ).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setBuildingMode(mode)}
                aria-pressed={buildingMode === mode}
                className={`px-3 py-1.5 font-medium ${buildingMode === mode ? "bg-pink-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        {buildingMode === "existing" ? (
          <div className="sm:max-w-md">
            <label className={labelClass} htmlFor="nc-building">Building *</label>
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="nc-new-name">Building name *</label>
              <input id="nc-new-name" type="text" value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="nc-new-address">Address *</label>
              <input id="nc-new-address" type="text" value={newBuildingAddress} onChange={(e) => setNewBuildingAddress(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="nc-pm-name">Property manager</label>
              <input id="nc-pm-name" type="text" value={pmName} onChange={(e) => setPmName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="nc-pm-email">Property manager email</label>
              <input id="nc-pm-email" type="email" value={pmEmail} onChange={(e) => setPmEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="nc-pm-phone">Property manager phone</label>
              <input id="nc-pm-phone" type="tel" value={pmPhone} onChange={(e) => setPmPhone(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className={cardTitle}>Contract terms</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="nc-start">Start date *</label>
            <input id="nc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="nc-day">Billing day of month *</label>
            <input id="nc-day" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className={inputClass} />
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
          <div className="sm:col-span-2 lg:col-span-3">
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
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={cardTitle}>Pricing</h2>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={useCalculator} onChange={(e) => setUseCalculator(e.target.checked)} className="h-4 w-4 text-pink-600" />
            Calculate the price from roles, hours, and rates
          </label>
        </div>
        {useCalculator ? (
          <>
            <p className="text-xs text-gray-500">
              Add a line per role. The monthly price is calculated from people, hours, and bill rate. Override any line or the total
              if you&apos;re quoting a round number.
            </p>
            <PricingCalculator value={pricing} onChange={setPricing} />
          </>
        ) : (
          <div className="max-w-xs">
            <label className={labelClass} htmlFor="nc-rate">Monthly rate *</label>
            <input id="nc-rate" type="text" inputMode="decimal" placeholder="$0.00" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
            <p className="mt-1 text-xs text-gray-500">You can build the pricing breakdown later on the contract&apos;s Pricing tab.</p>
          </div>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Link href="/erp/janitorial" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </Link>
        <button type="submit" disabled={saving} className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
          {saving ? "Saving…" : "Create contract"}
        </button>
      </div>
    </form>
  );
}
