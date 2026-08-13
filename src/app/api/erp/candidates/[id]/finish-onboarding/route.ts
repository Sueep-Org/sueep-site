import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type CandidateDoc = { id: string; label: string; filename: string };

/** Only overwrites a field on the target Employee when it's currently empty
 * — merging into an existing profile should fill gaps, not clobber data
 * staff may have already entered there. `undefined` means "leave as is". */
function fillIfMissing(existing: string | null, incoming: string | null): string | undefined {
  return existing ? undefined : incoming || undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { mergeIntoEmployeeId?: unknown };
  const mergeIntoEmployeeId = typeof body.mergeIntoEmployeeId === "string" ? body.mergeIntoEmployeeId : null;

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

  const docs = candidate.documents as CandidateDoc[];

  // Merge path: an Employee profile with this email already exists (surfaced
  // by the 409 below on a prior attempt) and staff chose to merge into it
  // rather than leave two disconnected profiles around.
  if (mergeIntoEmployeeId) {
    const target = await prisma.employee.findUnique({
      where: { id: mergeIntoEmployeeId },
      select: {
        id: true,
        phone: true,
        role: true,
        bankAccountType: true,
        bankAccountNumber: true,
        bankRoutingNumber: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    try {
      await prisma.employee.update({
        where: { id: mergeIntoEmployeeId },
        data: {
          // Re-activate — merging in a new application means they're back
          // in the pipeline even if this profile had gone INACTIVE.
          status: "ACTIVE",
          sourceCandidateApplicationId: id,
          phone: fillIfMissing(target.phone, candidate.phone),
          role: fillIfMissing(target.role, candidate.positionInterest),
          bankAccountType: fillIfMissing(target.bankAccountType, candidate.bankAccountType),
          bankAccountNumber: fillIfMissing(target.bankAccountNumber, candidate.bankAccountNumber),
          bankRoutingNumber: fillIfMissing(target.bankRoutingNumber, candidate.bankRoutingNumber),
        },
      });
    } catch (e) {
      console.error("finish-onboarding merge error:", e);
      return NextResponse.json({ error: "Failed to merge into employee profile" }, { status: 500 });
    }

    if (docs.length > 0) {
      await prisma.employeeDocument.createMany({
        data: docs.map((doc) => ({
          employeeId: mergeIntoEmployeeId,
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

    return NextResponse.json({ employeeId: mergeIntoEmployeeId });
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
        sourceCandidateApplicationId: id,
      },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Email already exists — find and return the existing employee so the
      // UI can offer "view" or "merge" instead of failing silently.
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
