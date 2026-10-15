import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { draftItems } from "@/lib/erp/itemInvoiceDrafts";

const MAX_CENTS = 10_000_000_00;

/** Drafts the picked Ready to bill items: one HubSpot draft per building or job. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { picks?: unknown } | null;
  const picks: { key: string; amountCents: number }[] = [];
  for (const p of Array.isArray(body?.picks) ? body!.picks : []) {
    const key = typeof p?.key === "string" ? p.key : "";
    const amountCents = Number(p?.amountCents);
    if (!/^(TURN|SOV|CO):\S+$/.test(key)) return NextResponse.json({ error: "Unknown item." }, { status: 400 });
    if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_CENTS) return NextResponse.json({ error: "Check the amounts." }, { status: 400 });
    picks.push({ key, amountCents });
  }
  if (!picks.length) return NextResponse.json({ error: "Pick at least one item." }, { status: 400 });
  return NextResponse.json({ results: await draftItems(picks, auth.email) });
}
