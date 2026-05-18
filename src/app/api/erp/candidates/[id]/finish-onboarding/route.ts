import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const candidate = await prisma.candidateApplication.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      positionInterest: true,
      status: true,
      bankAccountType: true,
      bankAccountNumber: true,
      bankRoutingNumber: true,
      documents: { select: { id: true, label: true, filename: true } },
    },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status !== "ONBOARDING") {
    return NextResponse.json(
      { error: "Candidate must be in ONBOARDING status" },
      { status: 400 }
    );
  }

  const parts = candidate.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? candidate.fullName;
  const lastName = parts.slice(1).join(" ") || "-";

  let employee;
  try {
    employee = await prisma.employee.create({
      data: {
        firstName,
        lastName,
        email: candidate.email.trim().toLowerCase(),
        phone: candidate.phone ?? null,
        role: candidate.positionInterest ?? null,
        status: "ACTIVE",
        hireDate: new Date(),
        bankAccountType: candidate.bankAccountType ?? null,
        bankAccountNumber: candidate.bankAccountNumber ?? null,
        bankRoutingNumber: candidate.bankRoutingNumber ?? null,
      },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Email already exists — find and return the existing employee
      const existing = await prisma.employee.findUnique({
        where: { email: candidate.email.trim().toLowerCase() },
        select: { id: true },
      });
      return NextResponse.json(
        { error: "An employee with this email already exists", employeeId: existing?.id },
        { status: 409 }
      );
    }
    console.error("finish-onboarding employee create error:", e);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }

  const docs = candidate.documents as { id: string; label: string; filename: string }[];
  if (docs.length > 0) {
    await prisma.employeeDocument.createMany({
      data: docs.map((doc) => ({
        employeeId: employee.id,
        documentType: doc.label,
        title: doc.filename,
        fileUrl: `/api/erp/candidates/${id}/documents/${doc.id}`,
        isVerified: false,
      })),
    });
  }

  await prisma.candidateApplication.update({
    where: { id },
    data: { status: "HIRED" },
  });

  return NextResponse.json({ employeeId: employee.id });
}