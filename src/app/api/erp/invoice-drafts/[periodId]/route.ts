import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { discardDraft, editDraft } from "@/lib/erp/janitorialInvoiceDrafts";

type Ctx = { params: Promise<{ periodId: string }> };

const MAX_CENTS = 10_000_000_00;

/** Edit the month's base amount and extras; the draft in HubSpot follows. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { periodId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { amountCents?: unknown; charges?: unknown } | null;
  const amountCents = Number(body?.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_CENTS) return NextResponse.json({ error: "Enter the monthly amount." }, { status: 400 });
  const charges: { description: string; amountCents: number }[] = [];
  for (const c of Array.isArray(body?.charges) ? body!.charges : []) {
    const description = typeof c?.description === "string" ? c.description.trim().slice(0, 300) : "";
    const cents = Number(c?.amountCents);
    if (!description) return NextResponse.json({ error: "Each extra needs a description." }, { status: 400 });
    if (!Number.isInteger(cents) || Math.abs(cents) > MAX_CENTS) return NextResponse.json({ error: `Check the amount for "${description}".` }, { status: 400 });
    charges.push({ description, amountCents: cents });
  }
  const result = await editDraft(periodId, { amountCents, charges });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}

/** Discard: deletes the draft in HubSpot; the month isn't drafted again unless asked. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { periodId } = await ctx.params;
  const result = await discardDraft(periodId, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
