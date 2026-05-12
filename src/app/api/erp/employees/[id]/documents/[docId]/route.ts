import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; docId: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, docId } = await ctx.params;
  const doc = await prisma.employeeDocument.findFirst({ where: { id: docId, employeeId: id } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.documentType !== undefined) {
    const v = String(body.documentType || "").trim();
    if (!v) return NextResponse.json({ error: "documentType is required" }, { status: 400 });
    data.documentType = v;
  }
  if (body.title !== undefined) data.title = body.title ? String(body.title).trim() : null;
  if (body.issuedAt !== undefined) {
    const d = parseDate(body.issuedAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid issuedAt" }, { status: 400 });
    data.issuedAt = d;
  }
  if (body.expiresAt !== undefined) {
    const d = parseDate(body.expiresAt);
    if (d === undefined) return NextResponse.json({ error: "Invalid expiresAt" }, { status: 400 });
    data.expiresAt = d;
  }
  if (body.isVerified !== undefined) data.isVerified = Boolean(body.isVerified);
  if (body.fileUrl !== undefined) data.fileUrl = body.fileUrl ? String(body.fileUrl).trim() : null;
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).trim() : null;

  try {
    const updated = await prisma.employeeDocument.update({ where: { id: docId }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/erp/employees/[id]/documents/[docId]", e);
    return NextResponse.json({ error: "Update document failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, docId } = await ctx.params;
  try {
    const deleted = await prisma.employeeDocument.deleteMany({ where: { id: docId, employeeId: id } });
    if (deleted.count === 0) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete document failed" }, { status: 500 });
  }
}