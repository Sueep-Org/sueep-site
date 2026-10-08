"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";
import type { CompanyDocKind, CompanyDocumentRow, FinancialYearRow } from "@/lib/erp/companyInfo";
import { centsToDollars } from "@/lib/erp/money";
import { AddDocumentModal, DocLink } from "./documents";

/** Annual volume plus each year's P&L and balance sheet, newest year first. */
export function FinancialYears({ years, docs }: { years: FinancialYearRow[]; docs: CompanyDocumentRow[] }) {
  const [editing, setEditing] = useState<FinancialYearRow | "new" | null>(null);
  const [adding, setAdding] = useState<{ kind: CompanyDocKind; year: number } | null>(null);

  function docCell(kind: CompanyDocKind, year: number) {
    const doc = docs.find((d) => d.kind === kind && d.year === year);
    if (doc) return <DocLink doc={doc} />;
    return (
      <Button variant="ghost" size="xs" onClick={() => setAdding({ kind, year })}>
        + Add
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          By year
          <InfoTip text="Annual volume, P&L, and balance sheet for each year. Upload the file or paste a Drive link." />
        </h2>
        <Button variant="ghost" size="xs" onClick={() => setEditing("new")}>
          + Add year
        </Button>
      </div>
      {years.length === 0 ? (
        <p className="px-4 py-3 text-xs text-gray-400">No years yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">Annual volume</th>
                <th className="px-3 py-2 font-medium">P&amp;L</th>
                <th className="px-3 py-2 font-medium">Balance sheet</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {years.map((y) => (
                <tr key={y.id} className="group">
                  <td className="px-4 py-2 font-medium text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {y.year}
                      {y.comment && <InfoTip text={y.comment} />}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-900">
                    {y.annualVolumeCents == null ? <span className="text-gray-400">Not set</span> : centsToDollars(y.annualVolumeCents).replace(/\.00$/, "")}
                  </td>
                  <td className="max-w-[10rem] px-3 py-2">{docCell("PROFIT_LOSS", y.year)}</td>
                  <td className="max-w-[10rem] px-3 py-2">{docCell("BALANCE_SHEET", y.year)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditing(y)}
                      className="sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <YearForm year={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {adding && <AddDocumentModal kind={adding.kind} year={adding.year} onClose={() => setAdding(null)} />}
    </div>
  );
}

function YearForm({ year, onClose }: { year: FinancialYearRow | null; onClose: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    year: year ? String(year.year) : String(new Date().getFullYear() - 1),
    annualVolume: year?.annualVolumeCents == null ? "" : String(year.annualVolumeCents / 100),
    comment: year?.comment ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(year ? `/api/erp/company-info/years/${year.id}` : "/api/erp/company-info/years", {
      method: year ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save.");
      return;
    }
    toast(year ? `${year.year} saved.` : `${form.year} added.`);
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!year) return;
    const ok = await confirm({
      title: `Delete ${year.year}?`,
      message: "This also removes that year's P&L and balance sheet. It can't be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/erp/company-info/years/${year.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not delete.");
      return;
    }
    toast(`${year.year} deleted.`);
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} dismissible={!saving} size="sm">
      <h3 className="text-base font-semibold text-gray-900">{year ? `Edit ${year.year}` : "Add a year"}</h3>
      <div className="mt-4 space-y-3">
        {!year && (
          <label className={labelClass.default}>
            Year
            <input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} className={inputClass.md} autoFocus />
          </label>
        )}
        <label className={labelClass.default}>
          Annual volume ($)
          <input
            inputMode="decimal"
            value={form.annualVolume}
            onChange={(e) => setForm((f) => ({ ...f, annualVolume: e.target.value }))}
            placeholder="e.g. 2,500,000"
            className={inputClass.md}
            autoFocus={!!year}
          />
        </label>
        <label className={labelClass.default}>
          Comment
          <textarea value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} rows={2} className={inputClass.md} />
        </label>
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <div>
          {year && (
            <Button variant="ghost" size="sm" onClick={remove} className="text-red-600 hover:text-red-700">
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
