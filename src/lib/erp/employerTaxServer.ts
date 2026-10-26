import { prisma } from "@/lib/prisma";
import { EMPLOYER_TAX_SETTING_KEY, parseEmployerTaxRates, type EmployerTaxRates } from "@/lib/erp/employerTax";

/** The employer tax rates set on the Payroll page (defaults when never saved). */
export async function loadEmployerTaxRates(): Promise<EmployerTaxRates> {
  const setting = await prisma.appSetting.findUnique({ where: { key: EMPLOYER_TAX_SETTING_KEY } });
  return parseEmployerTaxRates(setting?.value);
}
