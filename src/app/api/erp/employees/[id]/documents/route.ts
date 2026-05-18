import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

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

  const contentType = req.headers.get("content-type") ?? "";

  let documentType = "";
  let title: string | null = null;
  let issuedAt: Date | null = null;
  let expiresAt: Date | null = null;
  let fileUrl: string | null = null;
  let fileData: Buffer | null = null;
  let fileMimeType: string | null = null;
  let fileFilename: string | null = null;
  let notes: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      fd = await req.formData();
    } catch {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    documentType = String(fd.get("documentType") || "").trim();
    title = fd.get("title") ? String(fd.get("title")).trim() : null;
    notes = fd.get("notes") ? String(fd.get("notes")).trim() : null;
    fileUrl = fd.get("fileUrl") ? String(fd.get("fileUrl")).trim() : null;

    const issuedRaw = fd.get("issuedAt");
    const expiresRaw = fd.get("expiresAt");
    const parsedIssued = parseDate(issuedRaw ? String(issuedRaw) : undefined);
    const parsedExpires = parseDate(expiresRaw ? String(expiresRaw) : undefined);
    if (parsedIssued === undefined || parsedExpires === undefined) {
      return NextResponse.json({ error: "Invalid issuedAt/expiresAt date" }, { status: 400 });
    }
    issuedAt = parsedIssued;
    expiresAt = parsedExpires;

    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File must be 4 MB or smaller" }, { status: 413 });
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: "Only PDF, JPEG, PNG, or WEBP files are allowed" }, { status: 415 });
      }
      fileData = Buffer.from(await file.arrayBuffer());
      fileMimeType = file.type;
      fileFilename = file.name;
    }
  } else {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    documentType = String(body.documentType || "").trim();
    title = body.title ? String(body.title).trim() : null;
    notes = body.notes ? String(body.notes).trim() : null;
    fileUrl = body.fileUrl ? String(body.fileUrl).trim() : null;

    const parsedIssued = parseDate(body.issuedAt);
    const parsedExpires = parseDate(body.expiresAt);
    if (
      (body.issuedAt !== undefined && parsedIssued === undefined) ||
      (body.expiresAt !== undefined && parsedExpires === undefined)
    ) {
      return NextResponse.json({ error: "Invalid issuedAt/expiresAt date" }, { status: 400 });
    }
    issuedAt = parsedIssued ?? null;
    expiresAt = parsedExpires ?? null;
  }

  if (!documentType) {
    return NextResponse.json({ error: "documentType is required" }, { status: 400 });
  }

  try {
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        documentType,
        title,
        issuedAt,
        expiresAt,
        fileUrl,
        fileData: fileData ?? undefined,
        fileMimeType: fileMimeType ?? undefined,
        fileFilename: fileFilename ?? undefined,
        notes,
      },
    });

    if (fileData) {
      const updated = await prisma.employeeDocument.update({
        where: { id: doc.id },
        data: { fileUrl: `/api/erp/employees/${id}/documents/${doc.id}/file` },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json(doc);
  } catch (e) {
    console.error("POST /api/erp/employees/[id]/documents", e);
    return NextResponse.json({ error: "Create document failed" }, { status: 500 });
  }
}
