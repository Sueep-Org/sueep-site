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
    },
  });

  if (!contractor || !contractor.infoTokenExpiry || contractor.infoTokenExpiry < new Date()) {
    notFound();
  }

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
      }}
    />
  );
}
