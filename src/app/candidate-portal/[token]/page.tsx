import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CandidatePortalClient } from "./CandidatePortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ token: string }> };

export default async function CandidatePortalPage({ params }: PageProps) {
  const { token } = await params;

  const candidate = await prisma.candidateApplication.findUnique({
    where: { paperworkUploadToken: token },
    select: {
      fullName: true,
      paperwork: true,
      paperworkUploadTokenExpiry: true,
      bankAccountRequired: true,
      bankAccountType: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
    },
  });

  if (
    !candidate ||
    !candidate.paperworkUploadTokenExpiry ||
    candidate.paperworkUploadTokenExpiry < new Date()
  ) {
    notFound();
  }

  const paperwork = (candidate.paperwork ?? []) as { label: string; url: string }[];

  return (
    <CandidatePortalClient
      token={token}
      fullName={candidate.fullName}
      paperwork={paperwork}
      bankAccountRequired={candidate.bankAccountRequired}
      initialBankAccountType={candidate.bankAccountType}
      initialBankAccountNumber={candidate.bankAccountNumber}
      initialBankRoutingNumber={candidate.bankRoutingNumber}
    />
  );
}
