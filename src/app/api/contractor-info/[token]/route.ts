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
  });
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
    },
  });

  return NextResponse.json({ ok: true });
}
