import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    },
  });
  if (!contractor) return null;
  if (!contractor.infoTokenExpiry || contractor.infoTokenExpiry < new Date()) return null;
  return contractor;
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

  await prisma.contractor.update({
    where: { id: contractor.id },
    data: {
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
    },
  });

  return NextResponse.json({ ok: true });
}
