import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { InfoTip } from "@/app/erp/components/ui";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { QuickBooksClose } from "../QuickBooksClose";
import { loadBookedThrough, loadCloseMonths } from "@/lib/erp/qboClose";
import {
  CHECK_LINE_LABELS,
  OWED_STATUS_LABELS,
  loadMoneyOwedCheck,
  loadMonthlyCheck,
  type CheckStatus,
  type DetailGroup,
  type MoneyOwedCheck,
  type MonthCheck,
  type OwedRow,
} from "@/lib/erp/qboCheck";

export const metadata: Metadata = { title: "QuickBooks details" };
export const dynamic = "force-dynamic";

function money(cents: number | null): string {
  if (cents == null) return "-";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dayLabel(key: string): string {
  return new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

const thCls = "px-3 py-2 text-left text-xs font-medium text-gray-500";
const tdCls = "px-3 py-2 align-top";

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "amber" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-700" : "text-gray-900"}`}>{value}</p>
      {sub ? <p className="text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

const STATUS_PILL: Record<CheckStatus | "PROBLEM" | "OK", string> = {
  MATCH: "bg-emerald-50 text-emerald-700",
  OK: "bg-emerald-50 text-emerald-700",
  KNOWN: "bg-sky-50 text-sky-700",
  LOOK: "bg-amber-100 text-amber-800",
  PROBLEM: "bg-amber-100 text-amber-800",
};

function OwedTable({ rows }: { rows: OwedRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className={thCls}>Invoice</th>
            <th className={thCls}>ERP job or building</th>
            <th className={thCls}>QuickBooks customer</th>
            <th className={`${thCls} text-right`}>ERP owed</th>
            <th className={`${thCls} text-right`}>QuickBooks owed</th>
            <th className={thCls}>Status</th>
            <th className={`${thCls} min-w-[18rem]`}>Why</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => {
            const s = OWED_STATUS_LABELS[r.status];
            return (
              <tr key={r.key}>
                <td className={`${tdCls} whitespace-nowrap tabular-nums text-gray-900`}>{r.number ?? "No number"}</td>
                <td className={tdCls}>
                  {r.erpHref ? (
                    <Link href={r.erpHref} className="text-gray-900 hover:text-pink-600 hover:underline">{r.erpTitle}</Link>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className={tdCls}>
                  <span className="text-gray-900">{r.qboCustomer ?? <span className="text-gray-400">-</span>}</span>
                  {r.nameDiffers ? (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="The QuickBooks customer shares no words with the ERP job or building. The invoice may be under the wrong customer in QuickBooks.">
                      Name differs
                    </span>
                  ) : null}
                </td>
                <td className={`${tdCls} text-right tabular-nums`}>{money(r.erpCents)}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{money(r.qboCents)}</td>
                <td className={tdCls}>
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[s.problem ? "PROBLEM" : "OK"]}`} title={s.hint}>
                    {s.label}
                  </span>
                </td>
                <td className={`${tdCls} text-xs text-gray-700`}>
                  {r.cause ? <p>{r.cause}</p> : <p className="text-gray-400">Same in both.</p>}
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] font-medium text-pink-600">History</summary>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">ERP / HubSpot</p>
                        <ul className="mt-0.5 space-y-0.5 text-gray-600">{r.history.erp.map((h, i) => <li key={i}>{h}</li>)}</ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">QuickBooks</p>
                        <ul className="mt-0.5 space-y-0.5 text-gray-600">{r.history.qbo.map((h, i) => <li key={i}>{h}</li>)}</ul>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The groups behind one monthly line, each with its items and how much of the gap it explains. */
function LineDrilldown({ groups }: { groups: DetailGroup[] }) {
  if (!groups.length) return <p className="text-xs text-gray-400">Nothing behind this line on either side.</p>;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <details key={g.key} className="rounded-md border border-gray-200 bg-white" open={g.items.length <= 6}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
            <span className="font-semibold text-gray-900">{g.label}</span>
            <span className="text-gray-500">{g.items.length} item{g.items.length === 1 ? "" : "s"}</span>
            {g.erpCents ? <span className="tabular-nums text-gray-600">ERP {money(g.erpCents)}</span> : null}
            {g.qboCents ? <span className="tabular-nums text-gray-600">QuickBooks {money(g.qboCents)}</span> : null}
            <InfoTip text={g.hint} wide />
          </summary>
          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full min-w-[560px] text-xs">
              <tbody className="divide-y divide-gray-50">
                {g.items.map((i) => (
                  <tr key={i.key}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">{i.date ? dayLabel(i.date) : ""}</td>
                    <td className="px-3 py-1.5">
                      {i.href ? <Link href={i.href} className="text-gray-900 hover:text-pink-600 hover:underline">{i.label}</Link> : <span className="text-gray-900">{i.label}</span>}
                      {i.sub ? <span className="ml-2 text-gray-500">{i.sub}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-600">{i.erpCents != null ? `ERP ${money(i.erpCents)}` : ""}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-600">{i.qboCents != null ? `QB ${money(i.qboCents)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

function MoneyOwedTab({ data }: { data: MoneyOwedCheck }) {
  if (!data.syncedAt) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        QuickBooks&apos; open invoices haven&apos;t been synced yet. Click <strong>Sync now</strong> on the <Link href="/erp/quickbooks" className="text-pink-600 hover:underline">QuickBooks page</Link>, or wait for tonight&apos;s sync.
      </p>
    );
  }
  const problems = data.rows.filter((r) => r.status !== "MATCH" || r.nameDiffers);
  const matches = data.rows.filter((r) => r.status === "MATCH" && !r.nameDiffers);
  const gap = data.qboOpenCents - data.erpOpenCents;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="ERP open invoices" value={money(data.erpOpenCents)} sub="HubSpot invoices in the ERP" />
        <Tile label="QuickBooks open invoices" value={money(data.qboOpenCents)} sub={gap ? `${gap > 0 ? "+" : ""}${money(gap)} vs the ERP` : "Same as the ERP"} tone={Math.abs(gap) > 10_000 ? "amber" : undefined} />
        <Tile label="Payments and credits not applied" value={money(data.unappliedCents)} sub="In QuickBooks, not on any invoice" tone={data.unappliedCents ? "amber" : undefined} />
        <Tile label="QuickBooks A/R Aging" value={data.aging ? money(data.aging.totalCents) : "-"} sub={data.aging ? `As of ${dayLabel(data.aging.asOf)}` : undefined} />
      </div>
      <p className="text-xs text-gray-400">QuickBooks as of the last sync, {new Date(data.syncedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Matched by invoice number.</p>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <h3 className="flex items-center gap-1 px-4 pt-3 text-sm font-semibold text-gray-900">
          To look at ({problems.length})
          <InfoTip text="Invoices that don't match between the ERP and QuickBooks, biggest difference first. Hover a status to see what it usually means. Fix in QuickBooks (apply payments, move invoices to the right customer) or in the ERP, then sync again." wide />
        </h3>
        {problems.length ? <OwedTable rows={problems} /> : <p className="px-4 py-3 text-sm text-emerald-700">Every open invoice matches.</p>}
      </section>

      {data.unapplied.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <h3 className="flex items-center gap-1 px-4 pt-3 text-sm font-semibold text-gray-900">
            Payments and credits not applied to an invoice ({data.unapplied.length})
            <InfoTip text="Money QuickBooks received (or credit it owes the customer) that isn't attached to an invoice. Applying it to the right invoice usually clears an invoice above too." wide />
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className={thCls}>Customer</th>
                  <th className={thCls}>Type</th>
                  <th className={thCls}>Date</th>
                  <th className={thCls}>Reference</th>
                  <th className={`${thCls} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.unapplied.map((u) => (
                  <tr key={u.key}>
                    <td className={`${tdCls} text-gray-900`}>{u.customer}</td>
                    <td className={`${tdCls} text-gray-600`}>{u.kind === "PAYMENT" ? "Payment" : "Credit memo"}</td>
                    <td className={`${tdCls} text-gray-600`}>{u.dateKey ? dayLabel(u.dateKey) : "-"}</td>
                    <td className={`${tdCls} text-gray-600`}>{u.ref ?? "-"}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{money(u.cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {matches.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">Matching ({matches.length})</summary>
          <OwedTable rows={matches} />
        </details>
      )}
    </div>
  );
}

const CHECK_STATUS_LABELS: Record<CheckStatus, string> = { MATCH: "Matches", KNOWN: "Known difference", LOOK: "Look at this" };

function MonthlyTab({ months }: { months: MonthCheck[] }) {
  if (!months.length) {
    return (
      <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        No finished months with QuickBooks data yet. Sync or upload the Profit and Loss on the <Link href="/erp/quickbooks" className="text-pink-600 hover:underline">QuickBooks page</Link>.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <p className="max-w-3xl text-sm text-gray-600">
        Finished months since August 2026, the ERP next to QuickBooks. Some lines rarely match exactly because the two count differently; hover a line for the usual reasons. Matches means within 5% or $100.
      </p>
      {months.map((m) => {
        const look = m.lines.filter((l) => l.status === "LOOK").length;
        return (
          <section key={m.month} className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <h3 className="flex flex-wrap items-center gap-2 px-4 pt-3 text-sm font-semibold text-gray-900">
              {monthLabel(m.month)}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${look ? STATUS_PILL.LOOK : STATUS_PILL.MATCH}`}>
                {look ? `${look} to look at` : "All match or explained"}
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className={thCls}>Line</th>
                    <th className={`${thCls} text-right`}>ERP</th>
                    <th className={`${thCls} text-right`}>QuickBooks</th>
                    <th className={`${thCls} text-right`}>Difference</th>
                    <th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {m.lines.map((l) => {
                    const meta = CHECK_LINE_LABELS[l.line];
                    const diff = l.qboCents - l.erpCents;
                    return [
                      <tr key={l.line}>
                        <td className={tdCls}>
                          <span className="flex items-center gap-1 text-gray-900">
                            {meta.label}
                            <InfoTip text={`ERP: ${meta.erp}. QuickBooks: ${meta.qbo}. Usual reasons they differ: ${meta.reasons}`} wide />
                          </span>
                        </td>
                        <td className={`${tdCls} text-right tabular-nums`}>{money(l.erpCents)}</td>
                        <td className={`${tdCls} text-right tabular-nums`}>{money(l.qboCents)}</td>
                        <td className={`${tdCls} text-right tabular-nums ${l.status === "LOOK" ? "text-amber-800" : "text-gray-500"}`}>
                          {diff === 0 ? "-" : `${diff > 0 ? "+" : ""}${money(diff)}`}
                        </td>
                        <td className={tdCls}>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[l.status]}`} title={l.note ?? meta.reasons}>
                            {CHECK_STATUS_LABELS[l.status]}
                          </span>
                        </td>
                      </tr>,
                      <tr key={`${l.line}-why`} className="border-t-0">
                        <td colSpan={5} className="px-3 pb-3 pt-0">
                          {m.detailSynced ? (
                            <details open={l.status === "LOOK" && l.line === "REVENUE"}>
                              <summary className="cursor-pointer text-xs font-medium text-pink-600">What&apos;s behind it</summary>
                              <div className="mt-2">
                                <LineDrilldown groups={l.groups} />
                              </div>
                            </details>
                          ) : (
                            <p className="text-xs text-gray-400">The transactions behind this line show after the next QuickBooks sync.</p>
                          )}
                        </td>
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default async function QuickBooksCheckPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) redirect("/erp");
  const [owed, months, closeMonths, bookedThrough] = await Promise.all([loadMoneyOwedCheck(), loadMonthlyCheck(), loadCloseMonths(), loadBookedThrough()]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/quickbooks" className="text-xs text-gray-500 hover:text-pink-600">← QuickBooks</Link>
        <h1 className="mt-1 flex items-center gap-1 text-2xl font-semibold text-gray-900">
          QuickBooks details
          <InfoTip text="Everything behind the status on the QuickBooks page: what customers owe invoice by invoice, the monthly totals with what's behind each, and each month's close checklist. Read-only. Fix differences at the source, then sync again." />
        </h1>
      </div>
      <DetailTabs
        tabs={[
          { label: "Money owed", content: <MoneyOwedTab data={owed} /> },
          { label: "Monthly totals", content: <MonthlyTab months={months} /> },
          { label: "Month close", content: <QuickBooksClose months={closeMonths} bookedThrough={bookedThrough} /> },
        ]}
      />
    </div>
  );
}
