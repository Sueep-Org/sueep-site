import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canSeePayroll, getErpAuth } from "@/lib/erpAuth";
import { saveSetting } from "@/lib/erp/settings";
import { PAYROLL_ANCHOR_KEY } from "@/lib/erp/settingsRegistry";
import { DEFAULT_PAYROLL_ANCHOR } from "@/lib/erp/payPeriods";

export async function GET() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const setting = await prisma.appSetting.findUnique({ where: { key: PAYROLL_ANCHOR_KEY } });
  return NextResponse.json({ anchor: setting?.value ?? DEFAULT_PAYROLL_ANCHOR });
}

/** Also on the Settings page. Kept for the Payroll page's pay period editor. */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { anchor?: unknown };
  try {
    body = (await req.json()) as { anchor?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const anchor = String(body.anchor ?? "").trim();
  const result = await saveSetting(PAYROLL_ANCHOR_KEY, anchor, auth.email);
  if ("error" in result) return NextResponse.json({ error: result.error === "Pick a Monday" ? "Anchor must be a Monday" : result.error }, { status: 400 });
  return NextResponse.json({ anchor });
}
