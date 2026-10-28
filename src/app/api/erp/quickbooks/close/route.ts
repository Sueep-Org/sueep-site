import { NextResponse } from "next/server";
import { getErpAuth, canManageQuickBooks } from "@/lib/erpAuth";
import { isCloseItemKey, setBookedThrough, setCloseTick } from "@/lib/erp/qboClose";

/**
 * Month close: { month, item, done } ticks a checklist item by hand;
 * { bookedThrough: "YYYY-MM" | null } sets how far QuickBooks is finished.
 */
export async function PATCH(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManageQuickBooks(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { month?: unknown; item?: unknown; done?: unknown; bookedThrough?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  if ("bookedThrough" in body) {
    if (body.bookedThrough !== null && !isMonth(body.bookedThrough)) return NextResponse.json({ error: "Pick a month" }, { status: 400 });
    await setBookedThrough(body.bookedThrough);
    return NextResponse.json({ ok: true });
  }
  if (!isMonth(body.month) || !isCloseItemKey(body.item)) return NextResponse.json({ error: "Unknown checklist item" }, { status: 400 });
  await setCloseTick(body.month, body.item, body.done === true, auth.email ?? null);
  return NextResponse.json({ ok: true });
}
