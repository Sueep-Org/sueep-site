import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageCompanyInfo } from "@/lib/erpAuth";
import { parseCompanyLoginBody } from "@/lib/erp/companyInfo";
import { companyLoginWriteData } from "@/lib/erp/companyInfoServer";
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

  const parsed = parseCompanyLoginBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const login = await prisma.companyLogin.create({ data: companyLoginWriteData(parsed.data, auth.email), select: { id: true } });
    return NextResponse.json({ id: login.id });
  } catch (e) {
    if (e instanceof MissingEncryptionKeyError) return NextResponse.json({ error: e.message }, { status: 500 });
    throw e;
  }
}
