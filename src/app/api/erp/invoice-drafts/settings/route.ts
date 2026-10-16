import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { APPROVE_SETTING_KEY } from "@/lib/erp/janitorialInvoiceDrafts";

/** Admin switch for Approve. Off until the first invoice is done with the bookkeeper. */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || auth.role !== "ADMIN") return NextResponse.json({ error: "Only an Admin can turn Approve on or off." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { approveEnabled?: unknown };
  if (typeof body.approveEnabled !== "boolean") return NextResponse.json({ error: "approveEnabled is required" }, { status: 400 });
  const value = body.approveEnabled ? "true" : "false";
  await prisma.appSetting.upsert({ where: { key: APPROVE_SETTING_KEY }, create: { key: APPROVE_SETTING_KEY, value }, update: { value } });
  return NextResponse.json({ ok: true });
}
