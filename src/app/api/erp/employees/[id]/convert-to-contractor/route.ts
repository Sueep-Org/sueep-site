import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/erp/employees/[id]/convert-to-contractor
 * Switches an existing Employee to a subcontractor: creates a Contractor
 * profile seeded from the employee's info and marks the employee INACTIVE.
 * Historical labor/assignment rows keep pointing at the Employee record —
 * this doesn't migrate or delete anything, it just adds a linked Contractor
 * profile going forward. Mirrors the candidate "Convert to Contractor" flow.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      address: true,
      dateOfBirth: true,
      ssn: true,
      bankAccountType: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
      contractor: { select: { id: true } },
    },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  if (employee.contractor) {
    return NextResponse.json(
      { error: "Already converted", contractorId: employee.contractor.id },
      { status: 409 }
    );
  }

  const name = `${employee.firstName} ${employee.lastName}`.trim();
  const email = employee.email ? employee.email.trim().toLowerCase() : null;

  try {
    const [contractor] = await prisma.$transaction([
      prisma.contractor.create({
        data: {
          name,
          email,
          role: employee.role,
          status: "ACTIVE",
          employeeId: id,
          address: employee.address,
          dateOfBirth: employee.dateOfBirth,
          ssn: employee.ssn,
          bankAccountType: employee.bankAccountType,
          bankAccountNumber: employee.bankAccountNumber,
          bankRoutingNumber: employee.bankRoutingNumber,
          phone: employee.phone,
        },
        select: { id: true },
      }),
      prisma.employee.update({ where: { id }, data: { status: "INACTIVE" } }),
    ]);
    return NextResponse.json({ id: contractor.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "A contractor with this email already exists" }, { status: 409 });
    }
    console.error("POST /api/erp/employees/[id]/convert-to-contractor", e);
    return NextResponse.json({ error: "Failed to convert to contractor" }, { status: 500 });
  }
}
