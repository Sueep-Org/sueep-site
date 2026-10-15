import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { canEditForecastTerms, loadTermsDays, MAX_TERMS_DAYS, TERMS_SETTING_KEY } from "@/lib/erp/dashboardCashForecast";

export const runtime = "nodejs";

/** Days after billing the cash forecast assumes a client pays. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ days: await loadTermsDays() });
}

export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditForecastTerms(auth.role)) return NextResponse.json({ error: "Only Admin and Business Manager can change this" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { days?: unknown } | null;
  const days = Number(body?.days);
  if (!Number.isInteger(days) || days < 0 || days > MAX_TERMS_DAYS) {
    return NextResponse.json({ error: `Days must be a whole number from 0 to ${MAX_TERMS_DAYS}` }, { status: 400 });
  }
  await prisma.appSetting.upsert({
    where: { key: TERMS_SETTING_KEY },
    update: { value: String(days) },
    create: { key: TERMS_SETTING_KEY, value: String(days) },
  });
  return NextResponse.json({ days });
}
