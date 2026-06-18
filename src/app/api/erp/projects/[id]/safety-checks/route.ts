import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const checks = await prisma.dailySafetyCheck.findMany({
    where: { projectId: id },
    orderBy: { checkDate: "desc" },
    include: { workers: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(checks);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supervisorName = String(body.supervisorName ?? "").trim();
  if (!supervisorName) return NextResponse.json({ error: "supervisorName is required" }, { status: 400 });

  const checkDate = body.checkDate ? new Date(String(body.checkDate)) : new Date();
  if (isNaN(checkDate.getTime())) return NextResponse.json({ error: "Invalid checkDate" }, { status: 400 });

  const check = await prisma.dailySafetyCheck.create({
    data: { projectId: id, supervisorName, checkDate },
    include: { workers: true },
  });
  return NextResponse.json(check);
}
