import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ checkId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { checkId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workerName = String(body.workerName ?? "").trim();
  if (!workerName) return NextResponse.json({ error: "workerName is required" }, { status: 400 });

  const employeeId = typeof body.employeeId === "string" && body.employeeId ? body.employeeId : null;

  const worker = await prisma.safetyCheckWorker.create({
    data: { safetyCheckId: checkId, workerName, employeeId },
  });
  return NextResponse.json(worker);
}
