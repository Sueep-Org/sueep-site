import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContractorInfoPortalClient } from "./ContractorInfoPortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ token: string }> };

export default async function ContractorInfoPage({ params }: PageProps) {
  const { token } = await params;

  const contractor = await prisma.contractor.findUnique({
    where: { infoToken: token },
    select: {
      name: true,
      infoTokenExpiry: true,
      contractorFullName: true,
      address: true,
      dateOfBirth: true,
      ssn: true,
      bankAccountType: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
      phone: true,
      hasInsurance: true,
      workersCompCarrier: true,
      workersCompPolicyNumber: true,
      workersCompExpiresAt: true,
    },
  });

  if (!contractor || !contractor.infoTokenExpiry || contractor.infoTokenExpiry < new Date()) {
    notFound();
  }

  const workersCompDoc = await prisma.contractorDocument.findFirst({
    where: { contractor: { infoToken: token }, label: "Workers Comp COI" },
    orderBy: { createdAt: "desc" },
    select: { filename: true },
  });

  return (
    <ContractorInfoPortalClient
      token={token}
      name={contractor.name}
      initial={{
        contractorFullName: contractor.contractorFullName,
        address: contractor.address,
        dateOfBirth: contractor.dateOfBirth,
        ssn: contractor.ssn,
        bankAccountType: contractor.bankAccountType,
        bankAccountNumber: contractor.bankAccountNumber,
        bankRoutingNumber: contractor.bankRoutingNumber,
        phone: contractor.phone,
        hasInsurance: contractor.hasInsurance,
        workersCompCarrier: contractor.workersCompCarrier,
        workersCompPolicyNumber: contractor.workersCompPolicyNumber,
        workersCompExpiresAt: contractor.workersCompExpiresAt ? contractor.workersCompExpiresAt.toISOString() : null,
        workersCompDocFilename: workersCompDoc?.filename ?? null,
      }}
    />
  );
}
