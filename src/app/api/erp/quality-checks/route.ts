import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RequestBody = Record<string, unknown>;

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function GET() {
  const checks = await prisma.qualityCheck.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      turnoverRequest: { include: { building: true } },
    },
  });
  return NextResponse.json(checks);
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const turnoverRequestId = String(body.turnoverRequestId || "").trim();
  if (!turnoverRequestId) {
    return NextResponse.json({ error: "turnoverRequestId is required" }, { status: 400 });
  }

  const supervisorName = String(body.supervisorName || "").trim();
  if (!supervisorName) {
    return NextResponse.json({ error: "supervisorName is required" }, { status: 400 });
  }

  const supervisorSignatureUrl = body.supervisorSignatureUrl != null ? String(body.supervisorSignatureUrl).trim() : null;
  const pmApproval = Boolean(body.pmApproval);
  const evidencePhotos = parseStringArray(body.evidencePhotos);
  const notes = body.notes != null ? String(body.notes).trim() : null;

  try {
    const check = await prisma.qualityCheck.create({
      data: {
        turnoverRequestId,
        supervisorName,
        supervisorSignatureUrl: supervisorSignatureUrl || null,
        pmApproval,
        evidencePhotos: evidencePhotos.length > 0 ? evidencePhotos : undefined,
        notes: notes || null,
      },
    });
    return NextResponse.json(check);
  } catch (e) {
    console.error("POST /api/erp/quality-checks", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
