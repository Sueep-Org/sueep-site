import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CONTRACTOR_MANUAL_SECTIONS, subFieldName } from "@/lib/erp/subcontractorQuestionnaire";
import { ContractorInfoPortalClient } from "./ContractorInfoPortalClient";

const QUESTIONNAIRE_KEYS = CONTRACTOR_MANUAL_SECTIONS.flatMap((s) => s.fields.map((f) => subFieldName(f.key)));

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
      candidateApplicationId: true,
      manualApplicationInfo: true,
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

  // Company profile / additional insurance / licensing already have a home
  // (the linked application) when one exists, so this form only collects
  // them manually otherwise — same rule ContractorQuestionnaireCard follows
  // on the ERP side, so a contractor never fills in an answer that gets
  // silently ignored because an application already covers it.
  const manualInfo =
    contractor.manualApplicationInfo && typeof contractor.manualApplicationInfo === "object" && !Array.isArray(contractor.manualApplicationInfo)
      ? (contractor.manualApplicationInfo as Record<string, unknown>)
      : {};
  const questionnaireValues: Record<string, string> = {};
  for (const key of QUESTIONNAIRE_KEYS) {
    const v = manualInfo[key];
    questionnaireValues[key] = typeof v === "string" ? v : "";
  }

  return (
    <ContractorInfoPortalClient
      token={token}
      name={contractor.name}
      isLinkedToApplication={Boolean(contractor.candidateApplicationId)}
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
        questionnaireValues,
      }}
    />
  );
}
