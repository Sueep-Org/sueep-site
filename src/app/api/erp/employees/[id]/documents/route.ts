import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({ where: { id }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const documentType = String(body.documentType || "").trim();
  if (!documentType) {
    return NextResponse.json({ error: "documentType is required" }, { status: 400 });
  }

  const issuedAt = parseDate(body.issuedAt);
  const expiresAt = parseDate(body.expiresAt);
  if ((body.issuedAt !== undefined && issuedAt === undefined) || (body.expiresAt !== undefined && expiresAt === undefined)) {
    return NextResponse.json({ error: "Invalid issuedAt/expiresAt date" }, { status: 400 });
  }

  try {
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        documentType,
        title: body.title ? String(body.title).trim() : null,
        issuedAt: issuedAt ?? null,
        expiresAt: expiresAt ?? null,
        isVerified: Boolean(body.isVerified),
        fileUrl: body.fileUrl ? String(body.fileUrl).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });
    return NextResponse.json(doc);
  } catch (e) {
    console.error("POST /api/erp/employees/[id]/documents", e);
    return NextResponse.json({ error: "Create document failed" }, { status: 500 });
  }
}