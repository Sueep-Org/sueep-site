"use client";

import { useEffect, useState } from "react";
import { centsToDollars } from "@/lib/erp/money";

type Unit = {
  id: string;
  unitNumber: string;
  bedrooms: number | null;
  bathrooms: number | null;
  isCommonArea: boolean;
  fullClean: boolean;
  carpetCleaning: boolean;
  active: boolean;
};

type Contract = {
  id: string;
  monthlyRateCents: number;
  billingDayOfMonth: number;
  status: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  commissionEmployeeId: string | null;
  units: Unit[];
};

type EmployeeOption = { id: string; name: string };

type Period = {
  id: string;
  periodStart: string;
  unitCount: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
};

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelClass = "block text-xs font-medium text-gray-600";

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function RecurringContractEditor({
  buildingId,
  canEdit,
  employees,
}: {
  buildingId: string;
  canEdit: boolean;
  employees: EmployeeOption[];
}) {
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState("");

  const [rateInput, setRateInput] = useState("");
  const [dayInput, setDayInput] = useState("5");
  const [startInput, setStartInput] = useState(new Date().toISOString().slice(0, 10));
  const [salespersonInput, setSalespersonInput] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingContract, setEditingContract] = useState(false);
  const [editRateInput, setEditRateInput] = useState("");
  const [editDayInput, setEditDayInput] = useState("");
  const [editEndDateInput, setEditEndDateInput] = useState("");
  const [editNotesInput, setEditNotesInput] = useState("");
  const [savingContract, setSavingContract] = useState(false);
  const [contractError, setContractError] = useState("");

  const [unitNumber, setUnitNumber] = useState("");
  const [unitBedrooms, setUnitBedrooms] = useState("");
  const [unitBathrooms, setUnitBathrooms] = useState("");
  const [unitCommonArea, setUnitCommonArea] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);

  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitBedrooms, setEditUnitBedrooms] = useState("");
  const [editUnitBathrooms, setEditUnitBathrooms] = useState("");
  const [editUnitFullClean, setEditUnitFullClean] = useState(true);
  const [editUnitCarpetCleaning, setEditUnitCarpetCleaning] = useState(false);
  const [savingUnit, setSavingUnit] = useState(false);

  useEffect(() => {
    fetch(`/api/erp/buildings/${buildingId}/recurring-contract`)
      .then((r) => r.json())
      .then((data: Contract | null) => setContract(data ?? null))
      .catch(() => setContract(null));
  }, [buildingId]);

  useEffect(() => {
    if (!contract) return;
    fetch(`/api/erp/buildings/${buildingId}/recurring-contract/periods`)
      .then((r) => r.json())
      .then((data: Period[]) => setPeriods(data))
      .catch(() => {});
  }, [buildingId, contract]);

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthlyRate: rateInput,
          billingDayOfMonth: Number(dayInput),
          startDate: startInput,
          commissionEmployeeId: salespersonInput || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create contract");
        return;
      }
      setContract(data);
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(status: string) {
    if (!contract) return;
    const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) setContract(data);
  }

  async function updateSalesperson(employeeId: string) {
    if (!contract) return;
    const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commissionEmployeeId: employeeId || null }),
    });
    const data = await res.json();
    if (res.ok) setContract(data);
  }

  function startEditContract() {
    if (!contract) return;
    setEditRateInput((contract.monthlyRateCents / 100).toFixed(2));
    setEditDayInput(String(contract.billingDayOfMonth));
    setEditEndDateInput(contract.endDate ? contract.endDate.slice(0, 10) : "");
    setEditNotesInput(contract.notes ?? "");
    setContractError("");
    setEditingContract(true);
  }

  async function saveContractEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    setContractError("");
    setSavingContract(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          monthlyRate: editRateInput,
          billingDayOfMonth: Number(editDayInput),
          endDate: editEndDateInput || null,
          notes: editNotesInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContractError(data.error ?? "Failed to update contract");
        return;
      }
      setContract(data);
      setEditingContract(false);
    } catch {
      setContractError("Network error");
    } finally {
      setSavingContract(false);
    }
  }

  async function addUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    setError("");
    if (!unitNumber.trim()) return setError("Unit number is required.");
    setAddingUnit(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract/units`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          unitNumber: unitNumber.trim(),
          bedrooms: unitBedrooms || null,
          bathrooms: unitBathrooms || null,
          isCommonArea: unitCommonArea,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add unit");
        return;
      }
      setContract((prev) => (prev ? { ...prev, units: [...prev.units, data] } : prev));
      setUnitNumber("");
      setUnitBedrooms("");
      setUnitBathrooms("");
      setUnitCommonArea(false);
    } catch {
      setError("Network error");
    } finally {
      setAddingUnit(false);
    }
  }

  async function toggleUnitActive(unit: Unit) {
    if (!contract) return;
    const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract/units/${unit.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !unit.active }),
    });
    const data = await res.json();
    if (res.ok) {
      setContract((prev) =>
        prev ? { ...prev, units: prev.units.map((u) => (u.id === unit.id ? data : u)) } : prev
      );
    }
  }

  function startEditUnit(unit: Unit) {
    setEditingUnitId(unit.id);
    setEditUnitBedrooms(unit.bedrooms != null ? String(unit.bedrooms) : "");
    setEditUnitBathrooms(unit.bathrooms != null ? String(unit.bathrooms) : "");
    setEditUnitFullClean(unit.fullClean);
    setEditUnitCarpetCleaning(unit.carpetCleaning);
  }

  async function saveUnitEdit(unit: Unit) {
    setSavingUnit(true);
    try {
      const res = await fetch(`/api/erp/buildings/${buildingId}/recurring-contract/units/${unit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bedrooms: unit.isCommonArea ? null : editUnitBedrooms || null,
          bathrooms: unit.isCommonArea ? null : editUnitBathrooms || null,
          fullClean: editUnitFullClean,
          carpetCleaning: editUnitCarpetCleaning,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setContract((prev) =>
          prev ? { ...prev, units: prev.units.map((u) => (u.id === unit.id ? data : u)) } : prev
        );
        setEditingUnitId(null);
      }
    } finally {
      setSavingUnit(false);
    }
  }

  if (contract === undefined) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }

  if (!contract) {
    if (!canEdit) return <p className="text-sm text-gray-400">This building has no recurring contract.</p>;
    return (
      <form onSubmit={createContract} className="max-w-lg space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-900">Set up a recurring monthly contract</p>
        <div>
          <label className={labelClass} htmlFor="rc-rate">Monthly rate</label>
          <input id="rc-rate" type="text" placeholder="$0.00" value={rateInput} onChange={(e) => setRateInput(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rc-day">Billing day of month</label>
          <input id="rc-day" type="number" min={1} max={28} value={dayInput} onChange={(e) => setDayInput(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rc-start">Start date</label>
          <input id="rc-start" type="date" value={startInput} onChange={(e) => setStartInput(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="rc-salesperson">Salesperson (for commission)</label>
          <select id="rc-salesperson" value={salespersonInput} onChange={(e) => setSalespersonInput(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="submit" disabled={creating} className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
          {creating ? "Saving…" : "Create contract"}
        </button>
      </form>
    );
  }

  const totalRevenue = periods.reduce((s, p) => s + p.revenueCents, 0);
  const totalCost = periods.reduce((s, p) => s + p.costCents, 0);
  const totalMargin = totalRevenue - totalCost;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        {editingContract ? (
          <form onSubmit={saveContractEdit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClass} htmlFor="edit-rc-rate">Monthly rate</label>
                <input id="edit-rc-rate" type="text" value={editRateInput} onChange={(e) => setEditRateInput(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-rc-day">Billing day of month</label>
                <input id="edit-rc-day" type="number" min={1} max={28} value={editDayInput} onChange={(e) => setEditDayInput(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-rc-end">End date (optional)</label>
                <input id="edit-rc-end" type="date" value={editEndDateInput} onChange={(e) => setEditEndDateInput(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="edit-rc-notes">Notes</label>
                <input id="edit-rc-notes" type="text" value={editNotesInput} onChange={(e) => setEditNotesInput(e.target.value)} className={inputClass} />
              </div>
            </div>
            {contractError && <p className="text-xs text-red-500">{contractError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={savingContract} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
                {savingContract ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setEditingContract(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-700">
              <p>Monthly rate: <span className="font-semibold text-gray-900">{centsToDollars(contract.monthlyRateCents)}</span></p>
              <p>Billing day: <span className="font-semibold text-gray-900">{contract.billingDayOfMonth}</span></p>
              <p>Status: <span className="font-semibold text-gray-900">{contract.status}</span></p>
              {contract.endDate && <p>End date: <span className="font-semibold text-gray-900">{contract.endDate.slice(0, 10)}</span></p>}
              {contract.notes && <p>Notes: <span className="font-semibold text-gray-900">{contract.notes}</span></p>}
              {canEdit ? (
                <label className="flex items-center gap-1.5">
                  Salesperson:
                  <select
                    value={contract.commissionEmployeeId ?? ""}
                    onChange={(e) => updateSalesperson(e.target.value)}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  >
                    <option value="">Unassigned</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>
                  Salesperson: <span className="font-semibold text-gray-900">
                    {employees.find((e) => e.id === contract.commissionEmployeeId)?.name ?? "Unassigned"}
                  </span>
                </p>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <button type="button" onClick={startEditContract} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Edit</button>
                {contract.status !== "PAUSED" && (
                  <button type="button" onClick={() => updateStatus("PAUSED")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Pause</button>
                )}
                {contract.status !== "ACTIVE" && (
                  <button type="button" onClick={() => updateStatus("ACTIVE")} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Resume</button>
                )}
                {contract.status !== "ENDED" && (
                  <button type="button" onClick={() => updateStatus("ENDED")} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">End contract</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">Enrolled units</p>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Beds/Baths</th>
                <th className="px-4 py-2">Services</th>
                <th className="px-4 py-2">Active</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {contract.units.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No units enrolled yet.</td></tr>
              ) : (
                contract.units.map((u) =>
                  editingUnitId === u.id ? (
                    <tr key={u.id} className="border-t border-gray-100 bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{u.unitNumber}{u.isCommonArea ? " (Common Area)" : ""}</td>
                      <td className="px-4 py-2">
                        {u.isCommonArea ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} value={editUnitBedrooms} onChange={(e) => setEditUnitBedrooms(e.target.value)} className="w-14 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-sm" />
                            bd
                            <input type="number" min={0} value={editUnitBathrooms} onChange={(e) => setEditUnitBathrooms(e.target.value)} className="w-14 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-sm" />
                            ba
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1 text-xs text-gray-600">
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={editUnitFullClean} onChange={(e) => setEditUnitFullClean(e.target.checked)} />
                            Full clean
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={editUnitCarpetCleaning} onChange={(e) => setEditUnitCarpetCleaning(e.target.checked)} />
                            Carpet cleaning
                          </label>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                          {u.active ? "Active" : "Removed"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => saveUnitEdit(u)} disabled={savingUnit} className="text-xs font-medium text-pink-600 hover:underline disabled:opacity-50">
                            {savingUnit ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingUnitId(null)} className="text-xs text-gray-500 hover:underline">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium text-gray-900">{u.unitNumber}{u.isCommonArea ? " (Common Area)" : ""}</td>
                      <td className="px-4 py-2 text-gray-600">{u.isCommonArea ? "—" : `${u.bedrooms ?? "?"}bd / ${u.bathrooms ?? "?"}ba`}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {[u.fullClean ? "Full clean" : null, u.carpetCleaning ? "Carpet" : null].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                          {u.active ? "Active" : "Removed"}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => startEditUnit(u)} className="text-xs text-pink-600 hover:underline">
                              Edit
                            </button>
                            <button type="button" onClick={() => toggleUnitActive(u)} className="text-xs text-pink-600 hover:underline">
                              {u.active ? "Remove" : "Re-enroll"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <form onSubmit={addUnit} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div>
              <label className={labelClass} htmlFor="unit-number">Unit #</label>
              <input id="unit-number" type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className="mt-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm w-28" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
              <input type="checkbox" checked={unitCommonArea} onChange={(e) => setUnitCommonArea(e.target.checked)} />
              Common area
            </label>
            {!unitCommonArea && (
              <>
                <div>
                  <label className={labelClass} htmlFor="unit-beds">Beds</label>
                  <input id="unit-beds" type="number" min={0} value={unitBedrooms} onChange={(e) => setUnitBedrooms(e.target.value)} className="mt-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm w-20" />
                </div>
                <div>
                  <label className={labelClass} htmlFor="unit-baths">Baths</label>
                  <input id="unit-baths" type="number" min={0} value={unitBathrooms} onChange={(e) => setUnitBathrooms(e.target.value)} className="mt-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm w-20" />
                </div>
              </>
            )}
            <button type="submit" disabled={addingUnit} className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50">
              {addingUnit ? "Adding…" : "+ Add unit"}
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">Period history</p>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2">Period</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {periods.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No periods generated yet.</td></tr>
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-900">{formatMonth(p.periodStart)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{p.unitCount}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{centsToDollars(p.revenueCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{centsToDollars(p.costCents)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${p.marginCents < 0 ? "text-red-600" : "text-gray-900"}`}>{centsToDollars(p.marginCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {periods.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Totals</td>
                  <td className="px-4 py-3 text-right tabular-nums">{centsToDollars(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{centsToDollars(totalCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{centsToDollars(totalMargin)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
