import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CONTRACTOR_MANUAL_SECTIONS, subFieldName } from "@/lib/erp/subcontractorQuestionnaire";

type Ctx = { params: Promise<{ token: string }> };

async function resolveContractor(token: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { infoToken: token },
    select: {
      id: true,
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
  if (!contractor) return null;
  if (!contractor.infoTokenExpiry || contractor.infoTokenExpiry < new Date()) return null;
  return contractor;
}

// Every sub_<key> the questionnaire fieldset (Company/Insurance/Licensing)
// might ask for — filters/serializes Contractor.manualApplicationInfo down
// to just the string values this form actually renders inputs for.
const QUESTIONNAIRE_KEYS = CONTRACTOR_MANUAL_SECTIONS.flatMap((s) => s.fields.map((f) => subFieldName(f.key)));

function pickQuestionnaireValues(info: unknown): Record<string, string> {
  const obj = info && typeof info === "object" && !Array.isArray(info) ? (info as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const key of QUESTIONNAIRE_KEYS) {
    const v = obj[key];
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const contractor = await resolveContractor(token);
  if (!contractor) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

  const workersCompDoc = await prisma.contractorDocument.findFirst({
    where: { contractorId: contractor.id, label: "Workers Comp COI" },
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true },
  });

  return NextResponse.json({
    name: contractor.name,
    expiry: contractor.infoTokenExpiry!.toISOString(),
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
    // Company profile / additional insurance / licensing only make sense to
    // collect here when there's no linked subcontractor application already
    // answering them (see ContractorQuestionnaireCard on the ERP profile).
    isLinkedToApplication: Boolean(contractor.candidateApplicationId),
    questionnaireValues: pickQuestionnaireValues(contractor.manualApplicationInfo),
  });
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const contractor = await resolveContractor(token);
  if (!contractor) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractorFullName = typeof body.contractorFullName === "string" ? body.contractorFullName.trim() : null;
  const address = typeof body.address === "string" ? body.address.trim() : null;
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : null;
  const ssn = typeof body.ssn === "string" ? body.ssn.trim() : null;
  const bankAccountType = typeof body.bankAccountType === "string" ? body.bankAccountType.trim() : null;
  const bankAccountNumber = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() : null;
  const bankRoutingNumber = typeof body.bankRoutingNumber === "string" ? body.bankRoutingNumber.trim() : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() : null;
  const hasInsurance = typeof body.hasInsurance === "boolean" ? body.hasInsurance : null;
  const workersCompCarrier = typeof body.workersCompCarrier === "string" ? body.workersCompCarrier.trim() || null : null;
  const workersCompPolicyNumber =
    typeof body.workersCompPolicyNumber === "string" ? body.workersCompPolicyNumber.trim() || null : null;
  const workersCompExpiresAt = parseDate(body.workersCompExpiresAt);
  if (workersCompExpiresAt === undefined) {
    return NextResponse.json({ error: "Invalid workersCompExpiresAt" }, { status: 400 });
  }

  if (!contractorFullName) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  // Company profile / additional insurance / licensing answers — only sent
  // by the client when this contractor isn't linked to an application (see
  // isLinkedToApplication above). Merge into whatever's already saved rather
  // than replacing it wholesale, same reasoning as the ERP profile's
  // per-section cards: a partial submit here shouldn't wipe out fields
  // staff already entered from the ERP side.
  let manualApplicationInfo: Record<string, unknown> | undefined;
  if (body.questionnaireValues !== undefined) {
    const v = body.questionnaireValues;
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return NextResponse.json({ error: "questionnaireValues must be an object" }, { status: 400 });
    }
    const incoming: Record<string, string> = {};
    for (const key of QUESTIONNAIRE_KEYS) {
      const val = (v as Record<string, unknown>)[key];
      if (typeof val === "string") incoming[key] = val.trim();
    }
    const existingInfo =
      contractor.manualApplicationInfo && typeof contractor.manualApplicationInfo === "object" && !Array.isArray(contractor.manualApplicationInfo)
        ? (contractor.manualApplicationInfo as Record<string, unknown>)
        : {};
    manualApplicationInfo = { ...existingInfo, ...incoming };
  }

  const data: Record<string, unknown> = {
    contractorFullName,
    address,
    dateOfBirth,
    ssn,
    bankAccountType,
    bankAccountNumber,
    bankRoutingNumber,
    phone,
    hasInsurance,
    workersCompCarrier,
    workersCompPolicyNumber,
    workersCompExpiresAt,
  };
  if (manualApplicationInfo !== undefined) data.manualApplicationInfo = manualApplicationInfo;

  await prisma.contractor.update({ where: { id: contractor.id }, data });

  return NextResponse.json({ ok: true });
}
