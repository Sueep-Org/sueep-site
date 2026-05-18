import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET() {
  const contractors = await prisma.contractor.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(contractors);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const email = body.email ? String(body.email).trim().toLowerCase() : null;

  try {
    const contractor = await prisma.contractor.create({
      data: { name, email, status: "ACTIVE" },
    });
    return NextResponse.json(contractor, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "A contractor with this email already exists" }, { status: 409 });
    }
    console.error("POST /api/erp/contractors", e);
    return NextResponse.json({ error: "Failed to create contractor" }, { status: 500 });
  }
}
