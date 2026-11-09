import { NextResponse } from "next/server";
import { canSeeFinancials, getErpAuth } from "@/lib/erpAuth";
import { offerableDays, offerPayFromBody, offersForDay, sendOffer, type OfferKind } from "@/lib/erp/subOffers";

function kindOf(v: unknown): OfferKind | null {
  return v === "day" || v === "co-day" ? v : null;
}

/** The day card's offer box: every round touching this day, and the days a new offer would cover. ?kind&ownerId&dayId&dateKey */
export async function GET(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const kind = kindOf(q.get("kind"));
  const ownerId = q.get("ownerId") ?? "";
  const dayId = q.get("dayId") ?? "";
  const dateKey = q.get("dateKey") ?? "";
  if (!kind || !ownerId || !dayId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const [offers, days] = await Promise.all([offersForDay(kind, dayId), offerableDays(kind, ownerId, dateKey)]);
  return NextResponse.json({ offers, offerableDateKeys: days.map((d) => d.dateKey) });
}

/** Sends a new offer. Body: { kind, ownerId, dateKey, contractorId, payCents, note, answerBy (ISO) } */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const kind = kindOf(body?.kind);
  const payCents = offerPayFromBody(body?.payCents);
  if (!body || !kind || typeof body.ownerId !== "string" || typeof body.dateKey !== "string" || typeof body.contractorId !== "string" || !body.contractorId) {
    return NextResponse.json({ error: "Pick a sub" }, { status: 400 });
  }
  if (payCents === undefined) return NextResponse.json({ error: "Pay isn't a valid amount" }, { status: 400 });
  const result = await sendOffer({
    kind,
    ownerId: body.ownerId,
    dateKey: body.dateKey,
    contractorId: body.contractorId,
    payCents,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null,
    answerBy: new Date(String(body.answerBy ?? "")),
    sentBy: auth.email,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result, { status: 201 });
}
