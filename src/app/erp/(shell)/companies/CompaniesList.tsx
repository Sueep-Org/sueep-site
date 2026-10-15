"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, inputClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { CompanyForm } from "@/app/erp/components/companies/CompanyForm";
import { BILLING_METHOD_LABELS, COMPANY_TYPES, COMPANY_TYPE_LABELS, companyMatchesQuery, type CompanyListRow } from "@/lib/erp/clientCompanies";

export function CompaniesList({ rows, canEdit }: { rows: CompanyListRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const visible = useMemo(
    () => rows.filter((r) => (showArchived || !r.archived) && (!type || r.type === type) && companyMatchesQuery(r, query)),
    [rows, query, type, showArchived],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or other names…"
          aria-label="Search companies"
          className={`${inputClass.xs} w-72`}
        />
        <SearchableSelect
          value={type}
          onChange={setType}
          options={COMPANY_TYPES.map((t) => ({ value: t, label: COMPANY_TYPE_LABELS[t] }))}
          allLabel="All types"
          className="w-52"
        />
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
        {canEdit && (
          <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
            + New company
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {rows.length === 0 ? "No companies yet." : "No companies match."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Billing</th>
                <th className="px-3 py-2 text-right font-medium">Buildings</th>
                <th className="px-3 py-2 text-right font-medium">Projects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/erp/companies/${r.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                      {r.name}
                    </Link>
                    {r.aliases.length > 0 && <span className="ml-2 text-xs text-gray-500">{r.aliases.join(", ")}</span>}
                    {r.archived && <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">Archived</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{COMPANY_TYPE_LABELS[r.type]}</td>
                  <td className="px-3 py-2 text-gray-700">{r.billingMethod ? BILLING_METHOD_LABELS[r.billingMethod] : <span className="text-gray-400">Not set</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.buildingCount || ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">{r.projectCount || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && <CompanyForm company={null} onClose={() => setAdding(false)} />}
    </div>
  );
}
