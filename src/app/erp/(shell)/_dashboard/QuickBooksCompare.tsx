"use client";

import { useState } from "react";
import { Modal } from "@/app/erp/components/ui";
import { centsToDollars } from "@/lib/erp/money";
import type { CompareMonth } from "@/lib/erp/qboCompare";

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Compare with QuickBooks" on the Finance tab: loads when opened, explains differences, changes nothing. */
export function QuickBooksCompare() {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState<CompareMonth[] | null>(null);
  const [error, setError] = useState("");

  async function show() {
    setOpen(true);
    if (months) return;
    try {
      const res = await fetch("/api/erp/finance/compare");
      const data = (await res.json()) as { months?: CompareMonth[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't load");
      setMonths(data.months ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }

  return (
    <>
      <button type="button" onClick={() => void show()} className="text-xs font-medium text-gray-600 hover:text-pink-600">
        Compare with QuickBooks
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} size="lg">
          <h3 className="text-base font-semibold text-gray-900">ERP vs QuickBooks</h3>
          <p className="mt-1 text-xs text-gray-500">
            Each finished month side by side, with why they differ. Money in is what was paid, since QuickBooks counts money when it lands. Nothing here
            changes either one.
          </p>
          <div className="mt-4 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {!months && !error && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
            {months?.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No QuickBooks numbers yet.</p>}
            {months?.map((m) => (
              <section key={m.month} className="rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{monthLabel(m.month)}</h4>
                  {m.unfinished && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800" title="Its QuickBooks costs are well below usual, so the bookkeeper is still entering this month.">
                      QuickBooks not finished
                    </span>
                  )}
                </div>
                <table className="mt-2 w-full text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr>
                      <th className="py-1 text-left font-medium" />
                      <th className="py-1 text-right font-medium">ERP</th>
                      <th className="py-1 text-right font-medium">QuickBooks</th>
                      <th className="py-1 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(
                      [
                        ["Money in", m.revenue],
                        ["Costs", m.costs],
                      ] as const
                    ).map(([label, row]) => (
                      <tr key={label} className="align-top">
                        <td className="py-1.5 pr-2 text-gray-700">
                          {label}
                          {row.reasons.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                              {row.reasons.map((r) => (
                                <li key={r.text}>· {r.text}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-gray-900">{centsToDollars(row.erpCents)}</td>
                        <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-gray-900">{centsToDollars(row.qboCents)}</td>
                        <td className="whitespace-nowrap py-1.5 pl-2 text-right tabular-nums text-gray-500">{centsToDollars(row.qboCents - row.erpCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
