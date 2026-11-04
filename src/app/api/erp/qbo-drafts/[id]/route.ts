import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { discardQboDraft, editQboItemsDraft, editQboMonthDraft } from "@/lib/erp/qboInvoiceDrafts";

type Ctx = { params: Promise<{ id: string }> };

const MAX_CENTS = 10_000_000_00;

/** Edit a month draft's base amount and extras (saved on the month), or a picked-work draft's lines. */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { amountCents?: unknown; charges?: unknown; lines?: unknown } | null;
  if (Array.isArray(body?.lines)) {
    const lines: { itemKey: string; name: string; amountCents: number }[] = [];
    for (const l of body.lines) {
      const itemKey = typeof l?.itemKey === "string" ? l.itemKey : "";
      const name = typeof l?.name === "string" ? l.name.trim().slice(0, 300) : "";
      const cents = Number(l?.amountCents);
      if (!name) return NextResponse.json({ error: "Each line needs a name." }, { status: 400 });
      if (!Number.isInteger(cents) || Math.abs(cents) > MAX_CENTS) return NextResponse.json({ error: `Check the amount for "${name}".` }, { status: 400 });
      lines.push({ itemKey, name, amountCents: cents });
    }
    if (!lines.length) return NextResponse.json({ error: "Keep at least one line." }, { status: 400 });
    const result = await editQboItemsDraft(id, lines);
    return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
  }
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
  const result = await editQboMonthDraft(id, { amountCents, charges });
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}

/** Discard a QuickBooks draft; picked items go back on Ready to bill. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const result = await discardQboDraft(id, auth.email);
  return "error" in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
