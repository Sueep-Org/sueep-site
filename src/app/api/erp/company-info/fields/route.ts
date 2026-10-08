import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseCompanyInfoBody } from "@/lib/erp/companyInfo";
import { companyInfoWriteData, toCompanyInfoRow } from "@/lib/erp/companyInfoServer";
import { MissingEncryptionKeyError } from "@/lib/erp/secretBox";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageCompanyInfo(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCompanyInfoBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const last = await prisma.companyInfoField.findFirst({
      where: { section: parsed.data.section },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const field = await prisma.companyInfoField.create({
      data: { ...companyInfoWriteData(parsed.data, null, auth.email), sortOrder: (last?.sortOrder ?? 0) + 10 },
    });
    return NextResponse.json({ row: toCompanyInfoRow(field) });
  } catch (e) {
    if (e instanceof MissingEncryptionKeyError) return NextResponse.json({ error: e.message }, { status: 500 });
    throw e;
  }
}
