"use client";

import { useState } from "react";
import { centsToDollars } from "@/lib/erp/money";
import { EmployeeCombobox, type EmployeeOption } from "@/app/erp/components/EmployeeCombobox";

export type ReimbursementRow = {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  companyOrTeam: string;
  description: string;
  amountCents: number;
  receiptUrl: string | null;
  paidAt: string | null;
};

type PaidFilter = "all" | "paid" | "unpaid";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function sortByDateDesc(rows: ReimbursementRow[]): ReimbursementRow[] {
  return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function ReimbursementsView({ employees, reimbursements }: { employees: EmployeeOption[]; reimbursements: ReimbursementRow[] }) {
  const [rows, setRows] = useState(() => sortByDateDesc(reimbursements));
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [formDate, setFormDate] = useState(todayISO());
  const [formEmployeeId, setFormEmployeeId] = useState(employees[0]?.id ?? "");
  const [formCompanyOrTeam, setFormCompanyOrTeam] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const visibleRows = rows
    .filter((r) => employeeFilter === "all" || r.employeeId === employeeFilter)
    .filter((r) => paidFilter === "all" || (paidFilter === "paid" ? !!r.paidAt : !r.paidAt));

  async function togglePaid(row: ReimbursementRow) {
    const nextPaid = !row.paidAt;
    setSavingId(row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, paidAt: nextPaid ? new Date().toISOString() : null } : r)));
    try {
      const res = await fetch(`/api/erp/reimbursements/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paid: nextPaid }),
      });
      if (!res.ok) throw new Error("Failed to update");
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    } finally {
      setSavingId(null);
    }
  }

  async function removeRow(id: string) {
    const prevRows = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/erp/reimbursements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    } catch {
      setRows(prevRows);
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!formEmployeeId) return setFormError("Select an employee.");
    if (!formCompanyOrTeam.trim()) return setFormError("Company/Team is required.");
    if (!formDescription.trim()) return setFormError("Description is required.");
    if (!formAmount.trim() || Number(formAmount.replace(/[$,]/g, "")) <= 0) return setFormError("Enter a valid amount.");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("date", formDate);
      fd.set("employeeId", formEmployeeId);
      fd.set("companyOrTeam", formCompanyOrTeam.trim());
      fd.set("description", formDescription.trim());
      fd.set("amount", formAmount);
      if (formFile) fd.set("receipt", formFile);

      const res = await fetch("/api/erp/reimbursements", { method: "POST", body: fd });
      const data = (await res.json()) as { error?: string; id?: string; date?: string; amountCents?: number; receiptUrl?: string | null };
      if (!res.ok || !data.id) {
        setFormError(data.error ?? "Failed to save reimbursement.");
        return;
      }

      const employeeName = employees.find((e) => e.id === formEmployeeId)?.name ?? "Unknown";
      const newRow: ReimbursementRow = {
        id: data.id,
        date: data.date ?? formDate,
        employeeId: formEmployeeId,
        employeeName,
        companyOrTeam: formCompanyOrTeam.trim(),
        description: formDescription.trim(),
        amountCents: data.amountCents ?? 0,
        receiptUrl: data.receiptUrl ?? null,
        paidAt: null,
      };
      setRows((prev) => sortByDateDesc([newRow, ...prev]));

      setFormDate(todayISO());
      setFormCompanyOrTeam("");
      setFormDescription("");
      setFormAmount("");
      setFormFile(null);
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
        <div className="flex rounded-md border border-gray-300 overflow-hidden text-xs font-medium">
          {([["all", "All"], ["unpaid", "Unpaid"], ["paid", "Paid"]] as [PaidFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setPaidFilter(f)}
              className={`px-3 py-1.5 transition-colors ${paidFilter === f ? "bg-pink-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          aria-label={showAddForm ? "Cancel adding reimbursement" : "Add reimbursement"}
          title={showAddForm ? "Cancel" : "Add reimbursement"}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-date">Date</label>
              <input
                id="reimb-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-employee">Employee</label>
              <EmployeeCombobox employees={employees} value={formEmployeeId} onChange={setFormEmployeeId} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-amount">Amount</label>
              <input
                id="reimb-amount"
                type="text"
                placeholder="$0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-company">Company/Team</label>
              <input
                id="reimb-company"
                type="text"
                placeholder="e.g. J Centra - Miyanna Nelson"
                value={formCompanyOrTeam}
                onChange={(e) => setFormCompanyOrTeam(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-description">Description</label>
              <input
                id="reimb-description"
                type="text"
                placeholder="e.g. Bought pizza for the team"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600" htmlFor="reimb-receipt">Receipt (optional)</label>
              <input
                id="reimb-receipt"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                className="mt-1 w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-200 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-300"
              />
            </div>
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save reimbursement"}
          </button>
        </form>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Company/Team</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No reimbursements match the current filters.</td>
                </tr>
              ) : (
                visibleRows.map((row, i) => (
                  <tr key={row.id} className={`${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100`}>
                    <td className="px-4 py-3 tabular-nums text-gray-700">{formatDate(row.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.employeeName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.companyOrTeam}</td>
                    <td className="px-4 py-3 text-gray-700">{row.description}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{centsToDollars(row.amountCents)}</td>
                    <td className="px-4 py-3">
                      {row.receiptUrl ? (
                        <a href={row.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
                          View
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => togglePaid(row)}
                        disabled={savingId === row.id}
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold disabled:opacity-50 ${
                          row.paidAt
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-gray-300 bg-gray-100 text-gray-600"
                        }`}
                      >
                        {row.paidAt ? "Paid" : "Not paid"}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        aria-label="Delete reimbursement"
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
