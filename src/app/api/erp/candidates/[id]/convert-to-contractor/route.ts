import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const application = await prisma.candidateApplication.findUnique({
    where: { id },
    select: {
      fullName: true,
      email: true,
      positionInterest: true,
      contractor: { select: { id: true } },
    },
  });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (application.contractor) {
    return NextResponse.json(
      { error: "Already converted", contractorId: application.contractor.id },
      { status: 409 }
    );
  }

  const email = application.email ? application.email.trim().toLowerCase() : null;

  try {
    const contractor = await prisma.contractor.create({
      data: {
        name: application.fullName,
        email,
        // Carries the Cleaner/Painter/Supervisor classification over from
        // the application, same free-text convention as Employee.role.
        role: application.positionInterest,
        status: "ACTIVE",
        candidateApplicationId: id,
      },
      select: { id: true },
    });
    return NextResponse.json({ id: contractor.id }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "A contractor with this email already exists" }, { status: 409 });
    }
    console.error("POST /api/erp/candidates/[id]/convert-to-contractor", e);
    return NextResponse.json({ error: "Failed to convert to contractor" }, { status: 500 });
  }
}
