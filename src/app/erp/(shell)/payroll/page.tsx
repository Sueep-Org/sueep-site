import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials, canSeePayroll } from "@/lib/erpAuth";
import { DEFAULT_PAYROLL_ANCHOR } from "@/lib/erp/payPeriods";
import { loadCommissionRows } from "@/lib/erp/commissionRows";
import { CommissionByRep, type RepGroup } from "../commission/CommissionByRep";
import { BidsView, type BidRow } from "../commission/BidsView";
import { BidCommissionView } from "../commission/BidCommissionView";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { PayrollView } from "./PayrollView";
import { OffshorePayrollView } from "./OffshorePayrollView";
import { ReimbursementsView, type ReimbursementRow } from "./ReimbursementsView";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ year?: string; view?: string }> };

export default async function PayrollPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");

  const [{ deals: allRows, recurring: recurringRowsAll, bidBonuses: bidBonusRows }, employees, reimbursements, salesBidEntries, anchorSetting, closedPeriods] = await Promise.all([
    loadCommissionRows(),
    prisma.employee.findMany({ select: { id: true, firstName: true, lastName: true, status: true } }),
    prisma.reimbursement.findMany({
      orderBy: { date: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.salesBidEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.appSetting.findUnique({ where: { key: "payrollAnchor" } }),
    prisma.payrollPeriodClose.findMany({ select: { periodStart: true } }),
  ]);

  // For the commission Paid date picker: which pay period a date lands in,
  // and whether that period's payroll was already closed.
  const payrollAnchor = anchorSetting?.value ?? DEFAULT_PAYROLL_ANCHOR;
  const closedPeriodStarts = closedPeriods.map((c) => c.periodStart.toISOString().slice(0, 10));

  // The manual bid-pipeline log — a separate comp track from deal/CO/recurring
  // commission, shown as its own flat page ("Bids") rather than nested
  // per-rep, and not scoped to the Commission tab's selected year.
  const bidRows: BidRow[] = salesBidEntries.map((entry) => ({
    id: entry.id,
    employeeId: entry.employeeId,
    employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`.trim(),
    date: entry.date ? entry.date.toISOString() : null,
    projectStartDate: entry.projectStartDate ? entry.projectStartDate.toISOString() : null,
    company: entry.company,
    deal: entry.deal,
    description: entry.description,
    drawings: entry.drawings as "YES" | "NO" | "ASKED" | null,
    payoutCents: entry.payoutCents,
    sent: entry.sent,
  }));

  const availableYears = [
    ...new Set([...allRows.map((r) => r.year), ...recurringRowsAll.map((r) => r.year)]),
  ].sort((a, b) => b - a);
  const { year: yearParam } = await searchParams;
  const selectedYear = yearParam && availableYears.includes(Number(yearParam))
    ? Number(yearParam)
    : (availableYears[0] ?? new Date().getUTCFullYear());

  const yearRows = allRows.filter((r) => r.year === selectedYear);
  const groupsByOwner = new Map<string, RepGroup>();
  for (const row of yearRows) {
    const key = row.ownerId ?? "unassigned";
    const group = groupsByOwner.get(key) ?? {
      ownerId: row.ownerId,
      ownerName: row.ownerName ?? "Unassigned",
      yearRevenueCents: 0,
      totalCommissionCents: 0,
      paidCommissionCents: 0,
      deals: [],
      recurringRows: [],
    };
    group.yearRevenueCents += row.contractValueCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.deals.push(row);
    groupsByOwner.set(key, group);
  }

  const recurringYearRows = recurringRowsAll.filter((r) => r.year === selectedYear);
  for (const row of recurringYearRows) {
    const key = row.ownerId ?? "unassigned";
    const group = groupsByOwner.get(key) ?? {
      ownerId: row.ownerId,
      ownerName: row.ownerName ?? "Unassigned",
      yearRevenueCents: 0,
      totalCommissionCents: 0,
      paidCommissionCents: 0,
      deals: [],
      recurringRows: [],
    };
    group.yearRevenueCents += row.monthlyRateCents;
    group.totalCommissionCents += row.commissionCents;
    if (row.paidAt) group.paidCommissionCents += row.commissionCents;
    group.recurringRows.push(row);
    groupsByOwner.set(key, group);
  }

  const repGroups = [...groupsByOwner.values()].sort((a, b) => b.totalCommissionCents - a.totalCommissionCents);

  const activeEmployeeOptions = employees
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const reimbursementRows: ReimbursementRow[] = reimbursements.map((r) => ({
    id: r.id,
    date: r.date.toISOString(),
    employeeId: r.employeeId,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
    companyOrTeam: r.companyOrTeam,
    description: r.description,
    amountCents: r.amountCents,
    receiptUrl: r.receiptUrl,
    paidAt: r.paidAt ? r.paidAt.toISOString() : null,
  }));

  // Finance and Sales keep this page (for Commission/Reimbursements) but
  // lose the Payroll and Offshore Payroll tabs specifically — canSeePayroll
  // excludes both, distinct from the canSeeFinancials guard above the page.
  const showPayrollTabs = canSeePayroll(auth.role);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">Compensation</h1>
      <DetailTabs
        paramName="view"
        tabs={[
          ...(showPayrollTabs
            ? [
                { label: "Payroll", content: <PayrollView canReopen={auth.role === "ADMIN"} employees={activeEmployeeOptions} /> },
                { label: "Offshore Payroll", content: <OffshorePayrollView /> },
              ]
            : []),
          {
            label: "Commission",
            children: [
              {
                label: "Sales",
                // key={selectedYear} forces a full remount on year-tab switches —
                // CommissionByRep's paid-toggle state (dealsByOwner/recurringByOwner)
                // is only initialized once from the `reps` prop, so without a fresh
                // mount it kept showing the first-loaded year's rows even after
                // navigating to a different year.
                content: (
                  <CommissionByRep
                    key={selectedYear}
                    years={availableYears}
                    selectedYear={selectedYear}
                    reps={repGroups}
                    payrollAnchor={payrollAnchor}
                    closedPeriodStarts={closedPeriodStarts}
                  />
                ),
              },
              {
                label: "Bids",
                content: (
                  <div className="space-y-6">
                    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bid Commission</h2>
                      <BidCommissionView rows={bidBonusRows} />
                    </section>
                    <section className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Bids</h2>
                      <BidsView employees={activeEmployeeOptions} rows={bidRows} />
                    </section>
                  </div>
                ),
              },
            ],
          },
          {
            label: "Reimbursements",
            content: <ReimbursementsView employees={activeEmployeeOptions} reimbursements={reimbursementRows} />,
          },
        ]}
      />
    </div>
  );
}
