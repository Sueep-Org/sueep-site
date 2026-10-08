import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import {
  COMPANY_DOC_KINDS,
  COMPANY_DOC_MAX_SIZE,
  isCompanyDocKind,
  isYearlyDocKind,
  parseLinkUrl,
  parseYear,
  resolveCompanyDocMimeType,
} from "@/lib/erp/companyInfo";

export const runtime = "nodejs";

/**
 * Adds a Company Info document. Multipart form: kind, year (P&L and balance
 * sheet), label (Other), and either file or link. A new P&L or balance
 * sheet replaces that year's old one.
 */
export async function POST(req: NextRequest) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const kind = form.get("kind");
  if (!isCompanyDocKind(kind)) return NextResponse.json({ error: "Pick a document type." }, { status: 400 });
  const yearly = isYearlyDocKind(kind);
  const year = yearly ? parseYear(form.get("year")) : null;
  if (yearly && year == null) return NextResponse.json({ error: "Pick a year." }, { status: 400 });

  const rawLabel = form.get("label");
  const label = yearly
    ? COMPANY_DOC_KINDS.find((k) => k.id === kind)!.label
    : typeof rawLabel === "string" && rawLabel.trim()
      ? rawLabel.trim().slice(0, 120)
      : null;
  if (!label) return NextResponse.json({ error: "Name the document." }, { status: 400 });

  const file = form.get("file");
  const link = parseLinkUrl(form.get("link"));
  let fileData: { filename: string; mimeType: string; size: number; data: Buffer } | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > COMPANY_DOC_MAX_SIZE) return NextResponse.json({ error: "File too large (max 4 MB). Paste a Drive link instead." }, { status: 413 });
    const mimeType = resolveCompanyDocMimeType(file.name);
    if (!mimeType) return NextResponse.json({ error: "Only PDF, image, Excel, Word, and CSV files are accepted." }, { status: 415 });
    fileData = { filename: file.name, mimeType, size: file.size, data: Buffer.from(await file.arrayBuffer()) };
  } else if (!link) {
    const typed = form.get("link");
    return NextResponse.json({ error: typed ? "That link doesn't look like a web address." : "Choose a file or paste a link." }, { status: 400 });
  }

  const data = { kind, year, label, uploadedByEmail: auth.email, ...(fileData ?? { linkUrl: link }) };
  const doc = await prisma.$transaction(async (tx) => {
    if (yearly) await tx.companyDocument.deleteMany({ where: { kind, year } });
    return tx.companyDocument.create({ data, select: { id: true } });
  });
  return NextResponse.json({ id: doc.id });
}
