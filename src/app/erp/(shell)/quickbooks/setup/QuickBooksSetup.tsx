"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InfoTip } from "@/app/erp/components/ui";
import { OptionCombobox } from "@/app/erp/components/OptionCombobox";
import type { MappingGroup, QboMapping } from "@/lib/erp/qboMapping";

const thCls = "px-3 py-2 text-left text-xs font-medium text-gray-500";
const tdCls = "px-3 py-2 align-middle";

function Chip({ tone, children }: { tone: "green" | "amber" | "red" | "gray"; children: React.ReactNode }) {
  const cls = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-gray-100 text-gray-600",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function groupChip(g: MappingGroup) {
  if (!g.companyId) return <Chip tone="red">No client company</Chip>;
  if (g.existing) return <Chip tone="green">Already in QuickBooks</Chip>;
  if (g.nameTaken) return <Chip tone="amber">Name already used</Chip>;
  return <Chip tone="gray">New on first invoice</Chip>;
}

/** Invoice setup: client companies to QuickBooks customers, jobs to sub-customers, lines to products. */
export function QuickBooksSetup({ mapping }: { mapping: QboMapping }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);

  async function patch(body: Record<string, unknown>, key: string) {
    setSaving(key);
    setError("");
    try {
      const res = await fetch("/api/erp/quickbooks/mapping", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(null);
    }
  }

  const customerOptions = mapping.customers.map((c) => ({ value: c.qboId, label: c.label }));
  const itemOptions = mapping.items.map((i) => ({ value: i.qboId, label: i.label }));
  const companiesDone = mapping.companies.filter((c) => c.confirmed).length;
  const linesDone = mapping.lines.filter((l) => l.confirmed).length;
  const noCompany = mapping.groups.filter((g) => !g.companyId).length;
  const taken = mapping.groups.filter((g) => g.nameTaken).length;
  const isProblem = (g: MappingGroup) => !g.companyId || g.nameTaken;
  const shownGroups = problemsOnly ? mapping.groups.filter(isProblem) : mapping.groups;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-500">Companies confirmed</div>
          <div className="text-lg font-semibold text-gray-900">
            {companiesDone} of {mapping.companies.length}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-500">Products set</div>
          <div className="text-lg font-semibold text-gray-900">
            {linesDone} of {mapping.lines.length}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="text-xs text-gray-500">Jobs to fix</div>
          <div className={`text-lg font-semibold ${noCompany + taken ? "text-red-700" : "text-gray-900"}`}>{noCompany + taken}</div>
        </div>
      </div>

      {!mapping.synced && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          QuickBooks customers and products show after the next nightly sync.
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="flex items-center gap-1 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
          Companies
          <InfoTip text="The QuickBooks customer each company's invoices go under. Suggestions come from the name; Confirm to keep one, or pick another. New customer on first invoice means QuickBooks gets a new one with the company's name the first time one of its invoices is approved." />
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={thCls}>Company</th>
                <th className={`${thCls} text-right`}>Jobs</th>
                <th className={thCls}>QuickBooks customer</th>
                <th className={thCls}>Status</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mapping.companies.map((c) => (
                <tr key={c.id}>
                  <td className={tdCls}>
                    <Link href={`/erp/companies/${c.id}`} className="text-gray-900 hover:text-pink-700">
                      {c.name}
                    </Link>
                  </td>
                  <td className={`${tdCls} text-right text-gray-600`}>{c.jobs}</td>
                  <td className={`${tdCls} w-[320px]`}>
                    <OptionCombobox
                      options={customerOptions}
                      value={c.qboCustomerId ?? ""}
                      allLabel="New customer on first invoice"
                      onChange={(v) => patch({ companyId: c.id, qboCustomerId: v || null }, c.id)}
                    />
                  </td>
                  <td className={tdCls}>
                    {c.confirmed ? (
                      <span title={c.confirmedBy ?? undefined}>
                        <Chip tone="green">Confirmed</Chip>
                      </span>
                    ) : c.suggested ? (
                      <Chip tone="amber">Suggested</Chip>
                    ) : (
                      <Chip tone="gray">No match</Chip>
                    )}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {c.confirmed ? (
                      <button type="button" disabled={saving === c.id} onClick={() => patch({ companyId: c.id, clear: true }, c.id)} className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50">
                        Undo
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={saving === c.id || !mapping.synced}
                        onClick={() => patch({ companyId: c.id, qboCustomerId: c.qboCustomerId }, c.id)}
                        className="rounded-md bg-pink-600 px-3 py-1 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="flex items-center gap-1 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
          Products
          <InfoTip text="The QuickBooks product or service each kind of invoice line uses." />
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={thCls}>Invoice line</th>
                <th className={thCls}>QuickBooks product</th>
                <th className={thCls}>Status</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mapping.lines.map((l) => (
                <tr key={l.key}>
                  <td className={tdCls}>
                    <div className="text-gray-900">{l.label}</div>
                    <div className="text-xs text-gray-500">{l.example}</div>
                  </td>
                  <td className={`${tdCls} w-[320px]`}>
                    <OptionCombobox options={itemOptions} value={l.qboItemId ?? ""} allLabel="Not set" onChange={(v) => patch({ lineKind: l.key, qboItemId: v || null }, l.key)} />
                  </td>
                  <td className={tdCls}>
                    {l.confirmed ? <Chip tone="green">Confirmed</Chip> : l.suggested ? <Chip tone="amber">Suggested</Chip> : <Chip tone="red">Not set</Chip>}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {!l.confirmed && l.qboItemId && (
                      <button
                        type="button"
                        disabled={saving === l.key}
                        onClick={() => patch({ lineKind: l.key, qboItemId: l.qboItemId }, l.key)}
                        className="rounded-md bg-pink-600 px-3 py-1 text-xs font-medium text-white hover:bg-pink-700 disabled:opacity-50"
                      >
                        Confirm
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="flex items-center gap-1 border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
          Jobs and buildings
          <InfoTip text="The sub-customer each job or building gets under its company. Worked out from the names, nothing to confirm. No client company: set one on the job or building. Name already used: another QuickBooks customer has this name, so rename the job or that customer before its first invoice." />
          <label className="ml-auto flex items-center gap-1.5 text-xs font-normal text-gray-600">
            <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
            Only show problems ({noCompany + taken})
          </label>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className={thCls}>Job or building</th>
                <th className={thCls}>Company</th>
                <th className={thCls}>In QuickBooks as</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shownGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-500">
                    Nothing to fix.
                  </td>
                </tr>
              )}
              {shownGroups.map((g) => (
                <tr key={g.key}>
                  <td className={tdCls}>
                    <Link href={g.href} className="text-gray-900 hover:text-pink-700">
                      {g.name}
                    </Link>
                    {g.count > 1 && <span className="ml-1 text-xs text-gray-500">({g.count} jobs)</span>}
                    {g.kind === "BUILDING" && <span className="ml-1 text-xs text-gray-400">building</span>}
                  </td>
                  <td className={`${tdCls} text-gray-600`}>{g.companyName ?? "-"}</td>
                  <td className={`${tdCls} text-gray-600`}>{g.plannedName ?? "-"}</td>
                  <td className={tdCls}>{groupChip(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
