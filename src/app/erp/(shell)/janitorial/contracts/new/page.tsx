import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { NewContractForm } from "../../NewContractForm";

export const metadata: Metadata = {
  title: "New Janitorial Contract",
};

export const dynamic = "force-dynamic";

export default async function NewJanitorialContractPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");

  const [buildings, employees] = await Promise.all([
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

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <Link href="/erp/janitorial" className="text-xs text-pink-600 hover:underline">
          ← Janitorial Contracts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">New janitorial contract</h1>
      </div>
      <NewContractForm
        buildings={buildings.map((b) => ({ id: b.id, name: b.name }))}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() }))}
      />
    </div>
  );
}
