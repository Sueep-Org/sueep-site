import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { ContractDetailsCard } from "./ContractDetailsCard";
import { ContractMonthsTable } from "./ContractMonthsTable";
import { ContractShiftPatterns } from "./ContractShiftPatterns";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function JanitorialContractPage({ params }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");
  const { id } = await params;

  const [contract, employees] = await Promise.all([
    prisma.recurringContract.findUnique({
      where: { id },
      include: {
        building: { select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true } },
        periods: {
          orderBy: { periodStart: "desc" },
          include: { charges: { orderBy: { createdAt: "asc" } } },
        },
        shiftPatterns: {
          orderBy: [{ effectiveFrom: "asc" }, { startTime: "asc" }],
          include: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  if (!contract) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/erp/janitorial" className="text-xs text-pink-600 hover:underline">
          Back to janitorial contracts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{contract.building.name}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {contract.building.address}
          {" · "}
          <Link href={`/erp/buildings/${contract.building.id}`} className="text-pink-600 hover:underline">
            Building profile
          </Link>
        </p>
        {contract.building.pmName && (
          <p className="mt-1 text-xs text-gray-500">
            Property manager: {[contract.building.pmName, contract.building.pmEmail, contract.building.pmPhone].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <ContractDetailsCard
        contract={{
          id: contract.id,
          monthlyRateCents: contract.monthlyRateCents,
          billingDayOfMonth: contract.billingDayOfMonth,
          status: contract.status,
          startDate: contract.startDate.toISOString(),
          endDate: contract.endDate ? contract.endDate.toISOString() : null,
          serviceAreas: contract.serviceAreas,
          notes: contract.notes,
          commissionEmployeeId: contract.commissionEmployeeId,
        }}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
      />

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

      <ContractMonthsTable
        contractId={contract.id}
        months={contract.periods.map((p) => ({
          id: p.id,
          periodStart: p.periodStart.toISOString(),
          amountCents: p.amountCents,
          billingStatus: p.billingStatus,
          commissionPaid: p.commissionPaidAt != null,
          charges: p.charges.map((c) => ({ id: c.id, description: c.description, amountCents: c.amountCents })),
        }))}
      />
    </div>
  );
}
