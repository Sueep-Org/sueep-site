import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canSeeFinanceDashboard } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { loadOverheadPage } from "@/lib/erp/qboOverheadPage";

export const metadata: Metadata = { title: "Overhead" };
export const dynamic = "force-dynamic";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function exact(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function monthShort(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
}

function monthLong(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default async function OverheadPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinanceDashboard(auth.role)) redirect("/erp");
  const { month: picked } = await searchParams;
  const data = await loadOverheadPage(picked);
  const monthTotal = data.totals[data.month] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp?tab=finance" className="text-xs text-gray-500 hover:text-pink-600">← Finance</Link>
        <h1 className="mt-1 flex items-center gap-1 text-2xl font-semibold text-gray-900">
          Overhead
          <InfoTip text="Every overhead cost from QuickBooks: rent, software, vehicles, supplies not on jobs and the rest, synced every night. Payroll, insurance, health and subcontractors aren't here because the ERP tracks them itself. The Finance dashboard takes out job ads and job materials the ERP already counts, so its recruiting and supplies can be a little lower." wide />
        </h1>
      </div>

      {data.categories.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No overhead from QuickBooks yet. It shows up after the first QuickBooks sync.</p>
      ) : (
        <>
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    {data.months.map((m) => (
                      <th key={m} className="px-3 py-2 text-right font-medium">
                        <Link href={`/erp/overhead?month=${m}`} className={`hover:text-pink-600 ${m === data.month ? "font-semibold text-pink-600" : ""}`}>
                          {monthShort(m)}
                          {m === data.currentMonth ? " (so far)" : ""}
                        </Link>
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.categories.map((c) => (
                    <tr key={c.group}>
                      <td className="px-4 py-2 text-gray-900" title={c.hint}>{c.label}</td>
                      {data.months.map((m) => (
                        <td key={m} className={`px-3 py-2 text-right tabular-nums ${m === data.month ? "bg-pink-50/60 text-gray-900" : "text-gray-600"}`} title={c.byMonth[m] ? exact(c.byMonth[m]) : undefined}>
                          {c.byMonth[m] ? money(c.byMonth[m]) : "-"}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">{money(c.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    {data.months.map((m) => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums">{data.totals[m] ? money(data.totals[m]) : "-"}</td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums">{money(Object.values(data.totals).reduce((s, v) => s + v, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-gray-900">
                {monthLong(data.month)}: {money(monthTotal)}
              </h2>
              <p className="text-xs text-gray-500">Click a month above to see its expenses.</p>
            </div>
            {!data.detailSynced ? (
              <p className="text-xs text-gray-500">The expense-by-expense list shows after the next QuickBooks sync. Until then, each category lists its QuickBooks accounts.</p>
            ) : null}
            <div className="space-y-2">
              {data.categories
                .filter((c) => (c.byMonth[data.month] ?? 0) !== 0 || c.vendors.length > 0)
                .map((c) => (
                  <details key={c.group} className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-medium text-gray-900">{c.label}</span>
                      <span className="tabular-nums text-gray-900">{exact(c.byMonth[data.month] ?? 0)}</span>
                    </summary>
                    <div className="border-t border-gray-100 px-4 py-3">
                      {c.vendors.length ? (
                        <ul className="space-y-2">
                          {c.vendors.map((v) => (
                            <li key={v.name}>
                              <details>
                                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                                  <span className="text-gray-800">
                                    {v.name} <span className="text-xs text-gray-400">{v.expenses.length} expense{v.expenses.length === 1 ? "" : "s"}</span>
                                  </span>
                                  <span className="tabular-nums text-gray-800">{exact(v.cents)}</span>
                                </summary>
                                <table className="mt-1 w-full text-xs">
                                  <tbody className="divide-y divide-gray-50">
                                    {v.expenses.map((e, i) => (
                                      <tr key={i}>
                                        <td className="whitespace-nowrap py-1 pr-3 text-gray-500">{dayLabel(e.date)}</td>
                                        <td className="py-1 pr-3 text-gray-700">{e.memo || e.type}<span className="ml-2 text-gray-400">{e.account}</span></td>
                                        <td className="whitespace-nowrap py-1 text-right tabular-nums text-gray-700">{exact(e.cents)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </details>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {c.accounts.filter((a) => a.cents !== 0).map((a) => (
                            <li key={a.name} className="flex justify-between gap-3 text-gray-700">
                              <span>{a.name}</span>
                              <span className="tabular-nums">{exact(a.cents)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
