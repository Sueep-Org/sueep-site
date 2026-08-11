import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ token: string }> };

async function resolveEmployee(token: string) {
  const employee = await prisma.employee.findUnique({
    where: { infoToken: token },
    select: {
      id: true,
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
  if (!employee) return null;
  if (!employee.infoTokenExpiry || employee.infoTokenExpiry < new Date()) return null;
  return employee;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

  return NextResponse.json({
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    expiry: employee.infoTokenExpiry!.toISOString(),
    address: employee.address,
    dateOfBirth: employee.dateOfBirth,
    ssn: employee.ssn,
    bankAccountType: employee.bankAccountType,
    bankAccountNumber: employee.bankAccountNumber,
    bankRoutingNumber: employee.bankRoutingNumber,
    phone: employee.phone,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const employee = await resolveEmployee(token);
  if (!employee) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = typeof body.address === "string" ? body.address.trim() || null : null;
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() || null : null;
  const ssn = typeof body.ssn === "string" ? body.ssn.trim() || null : null;
  const bankAccountType = typeof body.bankAccountType === "string" ? body.bankAccountType.trim() || null : null;
  const bankAccountNumber = typeof body.bankAccountNumber === "string" ? body.bankAccountNumber.trim() || null : null;
  const bankRoutingNumber = typeof body.bankRoutingNumber === "string" ? body.bankRoutingNumber.trim() || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      address,
      dateOfBirth,
      ssn,
      bankAccountType,
      bankAccountNumber,
      bankRoutingNumber,
      phone,
    },
  });

  return NextResponse.json({ ok: true });
}
