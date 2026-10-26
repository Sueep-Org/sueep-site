import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { EMPLOYER_TAX_SETTING_KEY, parseEmployerTaxRates, validateEmployerTaxRates } from "@/lib/erp/employerTax";

export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const setting = await prisma.appSetting.findUnique({ where: { key: EMPLOYER_TAX_SETTING_KEY } });
  return NextResponse.json({ rates: parseEmployerTaxRates(setting?.value), canEdit: auth.role === "ADMIN" });
}

/** Admin only: rates change about once a year (new PA SUI notice, new Social Security cap). */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || auth.role !== "ADMIN") return NextResponse.json({ error: "Only an Admin can change tax rates" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = validateEmployerTaxRates(body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const value = JSON.stringify(result.rates);
  await prisma.appSetting.upsert({
    where: { key: EMPLOYER_TAX_SETTING_KEY },
    update: { value },
    create: { key: EMPLOYER_TAX_SETTING_KEY, value },
  });
  return NextResponse.json({ rates: result.rates });
}
