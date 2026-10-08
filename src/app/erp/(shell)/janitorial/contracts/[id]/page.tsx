import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { DetailTabs } from "@/app/erp/components/DetailTabs";
import { centsToDollars } from "@/lib/erp/money";
import { todayEasternKey, utcDateKey } from "@/lib/erp/dates";
import { daysBetween } from "@/lib/erp/managementCalendar";
import { shiftHours } from "@/lib/erp/janitorialSchedule";
import { formatHours } from "@/lib/erp/schedule";
import { periodTotalCents } from "@/lib/erp/recurringContracts";
import { laborCostByContract, monthBounds } from "@/lib/erp/janitorialProfit";
import { ContractStatusBadge } from "../../badges";
import { ContractDetailsForm } from "./ContractDetailsForm";
import { ContractPricingEditor } from "./ContractPricingEditor";
import type { ContractPricing } from "@/lib/erp/janitorialPricing";
import { ContractStatusActions } from "./ContractStatusActions";
import { ContractMonthsTable } from "./ContractMonthsTable";
import { ContractShiftPatterns } from "./ContractShiftPatterns";
import { BuildingLocationCard } from "./BuildingLocationCard";
import { StatStrip } from "../../StatStrip";
import { ContractQualityChecks } from "./ContractQualityChecks";
import { checkerName, loadCheckers, namesByEmail } from "@/lib/erp/janitorialQualityChecks";
import { keyAreasFor, needsAttention, parseAreaResults } from "@/lib/erp/janitorialQualityShared";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function JanitorialContractPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");
  const { id } = await params;

  const [contract, employees, latestGpsClockIn, checkers] = await Promise.all([
    prisma.recurringContract.findUnique({
      where: { id },
      include: {
        building: {
          select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true, latitude: true, longitude: true, geocodeStatus: true },
        },
        periods: {
          orderBy: { periodStart: "desc" },
          include: { charges: { orderBy: { createdAt: "asc" } } },
        },
        shiftPatterns: {
          orderBy: [{ effectiveFrom: "asc" }, { startTime: "asc" }],
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
        qualityChecks: {
          orderBy: { scheduledDate: "desc" },
          include: { assignedUser: { select: { email: true } } },
        },
      },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.janitorialTimeEntry.findFirst({
      where: { recurringContractId: id, clockInLatitude: { not: null } },
      orderBy: { clockInAt: "desc" },
      select: { clockInAt: true, employee: { select: { firstName: true, lastName: true } } },
    }),
    loadCheckers(),
  ]);
  if (!contract) notFound();
  const assigneeNames = await namesByEmail(contract.qualityChecks.flatMap((q) => (q.assignedUser ? [q.assignedUser.email] : [])));

  // Summary tiles
  const today = todayEasternKey();
  const currentPatterns = contract.shiftPatterns.filter(
    (p) => p.effectiveFrom.toISOString().slice(0, 10) <= today && (!p.effectiveUntil || p.effectiveUntil.toISOString().slice(0, 10) >= today)
  );
  const janitorCount = new Set(currentPatterns.map((p) => p.employeeId)).size;
  const weeklyHours = currentPatterns.reduce((s, p) => s + p.daysOfWeek.length * shiftHours(p.startTime, p.endTime), 0);
  const unpaidCents = contract.periods.filter((p) => p.billingStatus !== "PAID").reduce((s, p) => s + periodTotalCents(p), 0);
  const unpaidMonths = contract.periods.filter((p) => p.billingStatus !== "PAID").length;

  // Labor cost per billing month (months that have started, newest 12),
  // counted through today for the current month.
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const costedPeriods = contract.periods.filter((p) => p.periodStart <= todayDate).slice(0, 12);
  const laborByPeriod: Record<string, { costCents: number; hours: number; missingRateNames: string[]; partial: boolean }> = {};
  for (const p of costedPeriods) {
    const { start, end } = monthBounds(p.periodStart);
    const partial = end > todayDate;
    const labor = (await laborCostByContract(start, partial ? todayDate : end)).get(contract.id);
    laborByPeriod[p.id] = { costCents: labor?.costCents ?? 0, hours: labor?.hours ?? 0, missingRateNames: labor?.missingRateNames ?? [], partial };
  }
  const lastFull = costedPeriods.find((p) => !laborByPeriod[p.id]?.partial);
  const lastFullMargin = lastFull ? periodTotalCents(lastFull) - laborByPeriod[lastFull.id].costCents : null;

  const tiles = [
    { label: "Monthly rate", value: centsToDollars(contract.monthlyRateCents) },
    { label: "Janitors scheduled", value: String(janitorCount) },
    { label: "Scheduled per week", value: formatHours(Math.round(weeklyHours * 100) / 100) },
    { label: "Not yet paid", value: centsToDollars(unpaidCents), hint: `${unpaidMonths} month${unpaidMonths === 1 ? "" : "s"}`, warn: unpaidCents > 0 },
    lastFull && lastFullMargin != null
      ? {
          label: "Margin, last full month",
          value: centsToDollars(lastFullMargin),
          hint: lastFull.periodStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
          warn: lastFullMargin < 0,
          bad: lastFullMargin < 0,
        }
      : { label: "Margin, last full month", value: "No data yet" },
  ];

  // Yearly term: amber within 60 days, red once it has expired without a renewal.
  const expiration = contract.expirationDate
    ? (() => {
        const key = utcDateKey(contract.expirationDate);
        const daysLeft = daysBetween(today, key);
        return { key, daysLeft, tone: daysLeft < 0 ? "font-medium text-red-600" : daysLeft <= 60 ? "font-medium text-amber-600" : "text-gray-500" };
      })()
    : null;
  const formatDateKey = (key: string) =>
    new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

  const employeeOptions = employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/erp/janitorial" className="text-xs text-pink-600 hover:underline">
            ← Janitorial Contracts
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{contract.building.name}</h1>
            <ContractStatusBadge status={contract.status} />
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {contract.building.address} ·{" "}
            <Link href={`/erp/buildings/${contract.building.id}`} className="text-pink-600 hover:underline">
              Building profile
            </Link>
          </p>
          {contract.status !== "ENDED" &&
            (expiration ? (
              <p className={`mt-1 text-sm ${expiration.tone}`}>
                {expiration.daysLeft < 0 ? "Expired " : "Expires "}
                {formatDateKey(expiration.key)}
                {expiration.daysLeft >= 0 && expiration.daysLeft <= 60 ? ` (in ${expiration.daysLeft} day${expiration.daysLeft === 1 ? "" : "s"})` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-amber-600">No expiration date set. Add it on the Details tab.</p>
            ))}
        </div>
        <ContractStatusActions
          contractId={contract.id}
          status={contract.status}
          buildingName={contract.building.name}
          expirationDate={contract.expirationDate ? utcDateKey(contract.expirationDate) : null}
        />
      </div>

      <StatStrip
        stats={tiles.map((t) => ({
          label: t.label,
          value: t.value,
          hint: t.hint,
          tone: "bad" in t && t.bad ? "text-red-600" : t.warn ? "text-amber-600" : undefined,
        }))}
      />

      <DetailTabs
        tabs={[
          {
            label: "Details",
            content: (
              <ContractDetailsForm
                contract={{
                  id: contract.id,
                  monthlyRateCents: contract.monthlyRateCents,
                  billingDayOfMonth: contract.billingDayOfMonth,
                  startDate: contract.startDate.toISOString(),
                  endDate: contract.endDate ? contract.endDate.toISOString() : null,
                  expirationDate: contract.expirationDate ? contract.expirationDate.toISOString() : null,
                  serviceAreas: contract.serviceAreas,
                  notes: contract.notes,
                  commissionEmployeeId: contract.commissionEmployeeId,
                }}
                building={{
                  id: contract.building.id,
                  pmName: contract.building.pmName,
                  pmEmail: contract.building.pmEmail,
                  pmPhone: contract.building.pmPhone,
                }}
                employees={employeeOptions}
              />
            ),
          },
          {
            label: "Pricing",
            content: (
              <ContractPricingEditor
                contractId={contract.id}
                initialPricing={(contract.pricing as ContractPricing | null) ?? null}
                currentMonthlyRateCents={contract.monthlyRateCents}
              />
            ),
          },
          {
            label: "Schedule",
            content: (
              <div className="space-y-4">
                <ContractShiftPatterns
                  contractId={contract.id}
                  patterns={contract.shiftPatterns.map((p) => ({
                    id: p.id,
                    employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
                    daysOfWeek: p.daysOfWeek,
                    startTime: p.startTime,
                    endTime: p.endTime,
                    effectiveFrom: p.effectiveFrom.toISOString(),
                    effectiveUntil: p.effectiveUntil ? p.effectiveUntil.toISOString() : null,
                    notes: p.notes,
                  }))}
                />
                <BuildingLocationCard
                  contractId={contract.id}
                  latitude={contract.building.latitude}
                  longitude={contract.building.longitude}
                  status={contract.building.geocodeStatus}
                  latestClockIn={
                    latestGpsClockIn?.clockInAt
                      ? {
                          employeeName: `${latestGpsClockIn.employee.firstName} ${latestGpsClockIn.employee.lastName}`.trim(),
                          at: latestGpsClockIn.clockInAt.toISOString(),
                        }
                      : null
                  }
                />
              </div>
            ),
          },
          {
            label: "Quality",
            content: (
              <ContractQualityChecks
                contractId={contract.id}
                today={today}
                checkers={checkers.map((c) => ({ id: c.id, name: c.name }))}
                keyAreas={keyAreasFor(contract)}
                usingServiceAreas={contract.qualityAreas.length === 0}
                checks={contract.qualityChecks.map((q) => ({
                  id: q.id,
                  date: utcDateKey(q.scheduledDate),
                  assignedUserId: q.assignedUserId,
                  assigneeName: checkerName(q.assignedUser, assigneeNames),
                  status: q.status === "DONE" ? "DONE" : "SCHEDULED",
                  notes: q.notes,
                  completedAt: q.completedAt ? q.completedAt.toISOString() : null,
                  attentionAreas: needsAttention(parseAreaResults(q.areaResults)).map((r) => r.area),
                  started: q.areaResults != null,
                  summarySent: q.summarySentAt != null,
                }))}
              />
            ),
          },
          {
            label: "Billing",
            content: (
              <ContractMonthsTable
                contractId={contract.id}
                laborByPeriod={laborByPeriod}
                months={contract.periods.map((p) => ({
                  id: p.id,
                  periodStart: p.periodStart.toISOString(),
                  amountCents: p.amountCents,
                  billingStatus: p.billingStatus,
                  commissionPaid: p.commissionPaidAt != null,
                  charges: p.charges.map((c) => ({ id: c.id, description: c.description, amountCents: c.amountCents })),
                }))}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
