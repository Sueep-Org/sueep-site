import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { inputToCents } from "@/lib/erp/money";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const dateRaw = String(fd.get("date") || "");
  const employeeId = String(fd.get("employeeId") || "").trim();
  const companyOrTeam = String(fd.get("companyOrTeam") || "").trim();
  const description = String(fd.get("description") || "").trim();
  const amountCents = inputToCents(fd.get("amount"));

  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (!companyOrTeam) return NextResponse.json({ error: "companyOrTeam is required" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });
  if (amountCents === null || amountCents <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  let receiptData: Buffer | null = null;
  let receiptMimeType: string | null = null;
  let receiptFilename: string | null = null;
  const file = fd.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Receipt must be 4 MB or smaller" }, { status: 413 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Only PDF, JPEG, PNG, or WEBP files are allowed" }, { status: 415 });
    }
    receiptData = Buffer.from(await file.arrayBuffer());
    receiptMimeType = file.type;
    receiptFilename = file.name;
  }

  const created = await prisma.reimbursement.create({
    data: {
      date,
      employeeId,
      companyOrTeam,
      description,
      amountCents,
      receiptData: receiptData ?? undefined,
      receiptMimeType: receiptMimeType ?? undefined,
      receiptFilename: receiptFilename ?? undefined,
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });

  if (receiptData) {
    const updated = await prisma.reimbursement.update({
      where: { id: created.id },
      data: { receiptUrl: `/api/erp/reimbursements/${created.id}/receipt` },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(created);
}
