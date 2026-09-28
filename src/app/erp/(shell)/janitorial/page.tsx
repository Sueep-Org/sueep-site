import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { centsToDollars } from "@/lib/erp/money";
import { periodTotalCents } from "@/lib/erp/recurringContracts";
import { laborCostByContract, monthBounds } from "@/lib/erp/janitorialProfit";
import { todayEasternKey } from "@/lib/erp/dates";
import { NewContractForm } from "./NewContractForm";
import { ContractStatusBadge, BillingStatusBadge } from "./badges";
import { JanitorialTabs } from "./JanitorialTabs";

export const metadata: Metadata = {
  title: "Janitorial",
};

export const dynamic = "force-dynamic";

export default async function JanitorialPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");

  const [contracts, buildings, employees] = await Promise.all([
    prisma.recurringContract.findMany({
      include: {
        building: { select: { id: true, name: true, address: true } },
        commissionEmployee: { select: { firstName: true, lastName: true } },
        periods: {
          orderBy: { periodStart: "desc" },
          take: 1,
          include: { charges: { select: { amountCents: true } } },
        },
      },
    }),
    prisma.building.findMany({
      where: { recurringContract: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  // Margin for the last full month: that month's billed total minus the
  // janitorial labor cost there (see janitorialProfit.ts).
  const today = new Date(`${todayEasternKey()}T00:00:00.000Z`);
  const lastMonth = monthBounds(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const lastMonthLabel = lastMonth.start.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const [lastMonthLabor, lastMonthPeriods] = await Promise.all([
    laborCostByContract(lastMonth.start, lastMonth.end),
    prisma.recurringContractPeriod.findMany({
      where: { periodStart: lastMonth.start },
      include: { charges: { select: { amountCents: true } } },
    }),
  ]);
  const lastMonthRevenue = new Map(lastMonthPeriods.map((p) => [p.recurringContractId, periodTotalCents(p)]));
  const marginFor = (contractId: string) => {
    const revenue = lastMonthRevenue.get(contractId);
    const labor = lastMonthLabor.get(contractId);
    if (revenue == null && !labor) return null;
    return { revenue: revenue ?? 0, cost: labor?.costCents ?? 0, margin: (revenue ?? 0) - (labor?.costCents ?? 0) };
  };

  const statusOrder: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ENDED: 2 };
  contracts.sort(
    (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3) || a.building.name.localeCompare(b.building.name)
  );
  const activeMonthlyCents = contracts.filter((c) => c.status === "ACTIVE").reduce((s, c) => s + c.monthlyRateCents, 0);
  const activeCount = contracts.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-pink-600">Janitorial</h1>
      <JanitorialTabs active="contracts" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mt-1 text-sm text-gray-600">
            {activeCount} active, {centsToDollars(activeMonthlyCents)}/month
          </p>
        </div>
        <NewContractForm
          buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
          employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Service areas</th>
                <th className="px-4 py-3 text-right">Monthly rate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Latest month</th>
                <th className="px-4 py-3 text-right">Margin, {lastMonthLabel}</th>
                <th className="px-4 py-3">Salesperson</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No janitorial contracts yet.</td>
                </tr>
              ) : (
                contracts.map((c) => {
                  const latest = c.periods[0];
                  return (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/erp/janitorial/contracts/${c.id}`} className="font-medium text-gray-900 hover:text-pink-600 hover:underline">
                          {c.building.name}
                        </Link>
                        {c.building.address && <p className="text-xs text-gray-500">{c.building.address}</p>}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-gray-600">
                        <span className="line-clamp-2">{c.serviceAreas || "Not set"}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{centsToDollars(c.monthlyRateCents)}</td>
                      <td className="px-4 py-3"><ContractStatusBadge status={c.status} /></td>
                      <td className="px-4 py-3">
                        {latest ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700">
                              {latest.periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
                            </span>
                            <span className="tabular-nums text-gray-500">{centsToDollars(periodTotalCents(latest))}</span>
                            <BillingStatusBadge status={latest.billingStatus} />
                          </div>
                        ) : (
                          <span className="text-gray-400">None yet</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {(() => {
                          const m = marginFor(c.id);
                          if (!m) return <span className="text-gray-400">No data</span>;
                          return (
                            <span title={`Billed ${centsToDollars(m.revenue)}, labor ${centsToDollars(m.cost)}`} className={`font-semibold ${m.margin < 0 ? "text-red-600" : "text-emerald-700"}`}>
                              {centsToDollars(m.margin)}
                              {m.margin < 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Losing money</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.commissionEmployee ? `${c.commissionEmployee.firstName} ${c.commissionEmployee.lastName}`.trim() : "Unassigned"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
