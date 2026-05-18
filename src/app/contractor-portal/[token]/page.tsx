import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContractorDocPortalClient } from "./ContractorDocPortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ token: string }> };

export default async function ContractorPortalPage({ params }: PageProps) {
  const { token } = await params;

  const contractor = await prisma.contractor.findUnique({
    where: { paperworkUploadToken: token },
    select: {
      name: true,
      paperwork: true,
      paperworkUploadTokenExpiry: true,
    },
  });

  if (
    !contractor ||
    !contractor.paperworkUploadTokenExpiry ||
    contractor.paperworkUploadTokenExpiry < new Date()
  ) {
    notFound();
  }

  const paperwork = (contractor.paperwork ?? []) as { label: string; url: string }[];

  return (
    <ContractorDocPortalClient
      token={token}
      name={contractor.name}
      paperwork={paperwork}
    />
  );
}
