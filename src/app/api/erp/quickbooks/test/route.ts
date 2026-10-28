import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { QboReconnectError, loadQboConnection, qboGet } from "@/lib/erp/qboClient";

export const runtime = "nodejs";

/** Test connection: reads the company's name from QuickBooks (refreshing the token if needed). */
export async function POST() {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const conn = await loadQboConnection();
  if (!conn) return NextResponse.json({ error: "QuickBooks isn't connected." }, { status: 400 });
  try {
    const info = await qboGet<{ CompanyInfo?: { CompanyName?: string } }>(`/companyinfo/${conn.realmId}`);
    const companyName = info.CompanyInfo?.CompanyName ?? null;
    await prisma.qboConnection.update({ where: { id: conn.id }, data: { companyName, lastError: null, lastErrorAt: null } });
    return NextResponse.json({ ok: true, companyName });
  } catch (e) {
    const reconnect = e instanceof QboReconnectError;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Test failed", reconnect }, { status: reconnect ? 401 : 502 });
  }
}
