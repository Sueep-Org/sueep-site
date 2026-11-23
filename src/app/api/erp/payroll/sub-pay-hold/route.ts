import { NextResponse } from "next/server";
import { getErpAuth, canSeePayroll } from "@/lib/erpAuth";
import { todayEasternKey } from "@/lib/erp/dates";
import { holdSubPay, loadHeldSubPay, releaseSubPay } from "@/lib/erp/subPayHold";

/** Sub pay on hold, listed under every pay period on the Payroll page. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ held: await loadHeldSubPay() });
}

/**
 * { action: "hold", kind, id, note? } or { action: "release", kind, id, payDate? "YYYY-MM-DD" }.
 * Release pays it in the period holding payDate (today, Eastern, when left out).
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeePayroll(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === "co" ? "co" : body.kind === "project" ? "project" : null;
  const id = typeof body.id === "string" ? body.id : "";
  if (!kind || !id) return NextResponse.json({ error: "kind and id required" }, { status: 400 });

  if (body.action === "hold") {
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;
    const ok = await holdSubPay(kind, id, auth.email, note);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Pay line not found" }, { status: 404 });
  }

  if (body.action === "release") {
    const key = typeof body.payDate === "string" && body.payDate ? body.payDate : todayEasternKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return NextResponse.json({ error: "Invalid pay date" }, { status: 400 });
    const payDate = new Date(`${key}T00:00:00.000Z`);
    if (isNaN(payDate.getTime())) return NextResponse.json({ error: "Invalid pay date" }, { status: 400 });
    const ok = await releaseSubPay(kind, id, auth.email, payDate);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "That pay isn't on hold" }, { status: 404 });
  }

  return NextResponse.json({ error: "action must be hold or release" }, { status: 400 });
}
