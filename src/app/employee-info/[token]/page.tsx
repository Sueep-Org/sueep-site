import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EmployeeInfoPortalClient } from "./EmployeeInfoPortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ token: string }> };

export default async function EmployeeInfoPage({ params }: PageProps) {
  const { token } = await params;

  const employee = await prisma.employee.findUnique({
    where: { infoToken: token },
    select: {
      firstName: true,
      lastName: true,
      infoTokenExpiry: true,
      address: true,
      dateOfBirth: true,
      ssn: true,
      bankAccountType: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
      phone: true,
    },
  });

  if (!employee || !employee.infoTokenExpiry || employee.infoTokenExpiry < new Date()) {
    notFound();
  }

  return (
    <EmployeeInfoPortalClient
      token={token}
      name={`${employee.firstName} ${employee.lastName}`.trim()}
      initial={{
        address: employee.address,
        dateOfBirth: employee.dateOfBirth,
        ssn: employee.ssn,
        bankAccountType: employee.bankAccountType,
        bankAccountNumber: employee.bankAccountNumber,
        bankRoutingNumber: employee.bankRoutingNumber,
        phone: employee.phone,
      }}
    />
  );
}
