"use client";

import { useState } from "react";
import { EmployeeCombobox, type EmployeeOption } from "@/app/erp/components/EmployeeCombobox";

export type BidRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string | null;
  projectStartDate: string | null;
  company: string;
  deal: string | null;
  description: string | null;
  drawings: "YES" | "NO" | "ASKED" | null;
  payoutCents: number | null;
  sent: boolean;
};

const inputClass =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

const DRAWINGS_LABEL: Record<string, string> = { YES: "Yes", NO: "No", ASKED: "Asked" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function sortByDateDesc(rows: BidRow[]): BidRow[] {
  return [...rows].sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : 0;
    const bt = b.date ? new Date(b.date).getTime() : 0;
    return bt - at;
  });
}

export function BidsView({ employees, rows: initialRows }: { employees: EmployeeOption[]; rows: BidRow[] }) {
  const [rows, setRows] = useState(() => sortByDateDesc(initialRows));
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [savingSentId, setSavingSentId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [formDate, setFormDate] = useState("");
  const [formProjectStartDate, setFormProjectStartDate] = useState("");
  const [formEmployeeId, setFormEmployeeId] = useState(employees[0]?.id ?? "");
  const [formCompany, setFormCompany] = useState("");
  const [formDeal, setFormDeal] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDrawings, setFormDrawings] = useState("");
  const [formPayout, setFormPayout] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const visibleRows = rows.filter((r) => employeeFilter === "all" || r.employeeId === employeeFilter);

  async function toggleSent(row: BidRow) {
    const nextSent = !row.sent;
    setSavingSentId(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, sent: nextSent } : r)));
    try {
      const res = await fetch(`/api/erp/sales-bids/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sent: nextSent }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    } finally {
      setSavingSentId(null);
    }
  }

  async function removeRow(id: string) {
    const prevRows = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/erp/sales-bids/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setRows(prevRows);
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!formEmployeeId) return setFormError("Select an employee.");
    if (!formCompany.trim()) return setFormError("Company is required.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/erp/sales-bids", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: formEmployeeId,
          date: formDate || null,
          projectStartDate: formProjectStartDate || null,
          company: formCompany.trim(),
          deal: formDeal.trim() || null,
          description: formDescription.trim() || null,
          drawings: formDrawings || null,
          payout: formPayout || null,
          sent: false,
        }),
      });
      const data = (await res.json()) as BidRow & { error?: string };
      if (!res.ok || !data.id) {
        setFormError((data as { error?: string }).error ?? "Failed to save.");
        return;
      }

      const employeeName = employees.find((e) => e.id === formEmployeeId)?.name ?? "Unknown";
      const newRow: BidRow = {
        id: data.id,
        employeeId: formEmployeeId,
        employeeName,
        date: formDate ? new Date(formDate).toISOString() : null,
        projectStartDate: formProjectStartDate ? new Date(formProjectStartDate).toISOString() : null,
        company: formCompany.trim(),
        deal: formDeal.trim() || null,
        description: formDescription.trim() || null,
        drawings: (formDrawings || null) as BidRow["drawings"],
        payoutCents: data.payoutCents ?? null,
        sent: false,
      };
      setRows((prev) => sortByDateDesc([newRow, ...prev]));

      setFormDate("");
      setFormProjectStartDate("");
      setFormCompany("");
      setFormDeal("");
      setFormDescription("");
      setFormDrawings("");
      setFormPayout("");
      setShowAddForm(false);
    } catch {
      setFormError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        >
          <option value="all">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          aria-label={showAddForm ? "Cancel adding bid" : "Add bid"}
          title={showAddForm ? "Cancel" : "Add bid"}
          className={`ml-auto flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
            showAddForm ? "border-pink-300 bg-pink-50 text-pink-600" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 transition-transform ${showAddForm ? "rotate-45" : ""}`}>
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={submitForm} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-employee">Employee</label>
              <EmployeeCombobox employees={employees} value={formEmployeeId} onChange={setFormEmployeeId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-date">Date</label>
              <input id="sb-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-start">Project start date</label>
              <input
                id="sb-start"
                type="date"
                value={formProjectStartDate}
                onChange={(e) => setFormProjectStartDate(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-company">Company</label>
              <input id="sb-company" type="text" value={formCompany} onChange={(e) => setFormCompany(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-deal">Deal</label>
              <input id="sb-deal" type="text" value={formDeal} onChange={(e) => setFormDeal(e.target.value)} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-description">Description</label>
              <input
                id="sb-description"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-drawings">Drawings</label>
              <select id="sb-drawings" value={formDrawings} onChange={(e) => setFormDrawings(e.target.value)} className={inputClass}>
                <option value="">—</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
                <option value="ASKED">Asked</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="sb-payout">Payout</label>
              <input id="sb-payout" type="text" placeholder="$0.00" value={formPayout} onChange={(e) => setFormPayout(e.target.value)} className={inputClass} />
            </div>
          </div>
          <p className="text-xs text-gray-500">New bids start as &quot;Not sent&quot; — mark sent from the table once submitted, and it&apos;ll count toward that week&apos;s bid bonus.</p>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save bid"}
          </button>
        </form>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Project start date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Deal</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Drawings</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No bids logged yet.</td>
                </tr>
              ) : (
                visibleRows.map((row, i) => (
                  <tr key={row.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatDate(row.date)}</td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatDate(row.projectStartDate)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.employeeName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.company}</td>
                    <td className="px-4 py-3 text-gray-700">{row.deal ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.description ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{row.drawings ? DRAWINGS_LABEL[row.drawings] : "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSent(row)}
                        disabled={savingSentId === row.id}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                          row.sent
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-gray-300 bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.sent ? "Sent" : "Not sent"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label="Delete bid"
                        className="text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
