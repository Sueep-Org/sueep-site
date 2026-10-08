import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { centsToDollars } from "@/lib/erp/money";
import { periodTotalCents } from "@/lib/erp/recurringContracts";
import { laborCostByContract, monthBounds } from "@/lib/erp/janitorialProfit";
import { todayEasternKey, utcDateKey } from "@/lib/erp/dates";
import { JanitorialHeader } from "./JanitorialTabs";
import { ContractsTable, type ContractRow } from "./ContractsTable";
import { StatStrip } from "./StatStrip";

export const metadata: Metadata = {
  title: "Janitorial Contracts",
};

export const dynamic = "force-dynamic";

export default async function JanitorialPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");

  // Margin for the last full month: that month's billed total minus the
  // janitorial labor cost there (see janitorialProfit.ts).
  const today = new Date(`${todayEasternKey()}T00:00:00.000Z`);
  const lastMonth = monthBounds(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
  const lastMonthLabel = lastMonth.start.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

  const [contracts, unpaidPeriods, lastMonthLabor, lastMonthPeriods] = await Promise.all([
    prisma.recurringContract.findMany({
      include: {
        building: { select: { name: true, address: true } },
        commissionEmployee: { select: { firstName: true, lastName: true } },
        qualityChecks: { where: { status: "SCHEDULED" }, orderBy: { scheduledDate: "asc" }, take: 1, select: { scheduledDate: true } },
        periods: {
          orderBy: { periodStart: "desc" },
          take: 1,
          include: { charges: { select: { amountCents: true } } },
        },
      },
    }),
    prisma.recurringContractPeriod.findMany({
      where: { billingStatus: { not: "PAID" } },
      include: { charges: { select: { amountCents: true } } },
    }),
    laborCostByContract(lastMonth.start, lastMonth.end),
    prisma.recurringContractPeriod.findMany({
      where: { periodStart: lastMonth.start },
      include: { charges: { select: { amountCents: true } } },
    }),
  ]);

  const lastMonthRevenue = new Map(lastMonthPeriods.map((p) => [p.recurringContractId, periodTotalCents(p)]));
  const marginFor = (contractId: string): ContractRow["margin"] => {
    const revenue = lastMonthRevenue.get(contractId);
    const labor = lastMonthLabor.get(contractId);
    if (revenue == null && !labor) return null;
    const revenueCents = revenue ?? 0;
    const costCents = labor?.costCents ?? 0;
    return { revenueCents, costCents, marginCents: revenueCents - costCents };
  };

  const statusOrder: Record<string, number> = { ACTIVE: 0, PAUSED: 1, ENDED: 2 };
  const rows: ContractRow[] = contracts
    .sort((a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3) || a.building.name.localeCompare(b.building.name))
    .map((c) => {
      const latest = c.periods[0];
      return {
        id: c.id,
        buildingName: c.building.name,
        address: c.building.address,
        serviceAreas: c.serviceAreas,
        status: c.status,
        monthlyRateCents: c.monthlyRateCents,
        latest: latest
          ? {
              label: latest.periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
              totalCents: periodTotalCents(latest),
              billingStatus: latest.billingStatus,
            }
          : null,
        margin: marginFor(c.id),
        expirationDate: c.expirationDate ? utcDateKey(c.expirationDate) : null,
        nextCheck: c.qualityChecks[0] ? utcDateKey(c.qualityChecks[0].scheduledDate) : null,
        salesperson: c.commissionEmployee ? `${c.commissionEmployee.firstName} ${c.commissionEmployee.lastName}`.trim() : null,
      };
    });

  // Summary tiles
  const active = contracts.filter((c) => c.status === "ACTIVE");
  const pausedCount = contracts.filter((c) => c.status === "PAUSED").length;
  const monthlyRevenueCents = active.reduce((s, c) => s + c.monthlyRateCents, 0);
  const unpaidCents = unpaidPeriods.reduce((s, p) => s + periodTotalCents(p), 0);
  const margins = rows.map((r) => r.margin).filter((m): m is NonNullable<ContractRow["margin"]> => m != null);
  const lastMonthMarginCents = margins.reduce((s, m) => s + m.marginCents, 0);

  const tiles: { label: string; value: string; hint?: string; tone?: string }[] = [
    { label: "Active contracts", value: String(active.length), hint: pausedCount ? `${pausedCount} paused` : undefined },
    { label: "Monthly revenue", value: centsToDollars(monthlyRevenueCents), hint: `${centsToDollars(monthlyRevenueCents * 12)} a year` },
    {
      label: "Not yet paid",
      value: centsToDollars(unpaidCents),
      hint: `${unpaidPeriods.length} month${unpaidPeriods.length === 1 ? "" : "s"}`,
      tone: unpaidCents > 0 ? "text-amber-600" : undefined,
    },
    {
      label: `Margin, ${lastMonthLabel}`,
      value: margins.length ? centsToDollars(lastMonthMarginCents) : "No data yet",
      hint: margins.length ? `${margins.length} building${margins.length === 1 ? "" : "s"}` : "Shows once shifts have run",
      tone: margins.length ? (lastMonthMarginCents < 0 ? "text-red-600" : "text-emerald-700") : "text-gray-400",
    },
  ];

  return (
    <div className="space-y-6">
      <JanitorialHeader
        active="contracts"
        action={
          <Link href="/erp/janitorial/contracts/new" className="rounded-md bg-pink-600 px-3 py-2 text-sm font-medium text-white hover:bg-pink-500">
            + New contract
          </Link>
        }
      />

      <StatStrip stats={tiles} />

      <ContractsTable today={todayEasternKey()} rows={rows} marginMonthLabel={lastMonthLabel} />
    </div>
  );
}
