import { NextResponse } from "next/server";
import { getErpAuth, canApproveInvoices } from "@/lib/erpAuth";
import { redraftPeriod } from "@/lib/erp/janitorialInvoiceDrafts";

type Ctx = { params: Promise<{ periodId: string }> };

/** Undo a discard (or retry a failed draft) and draft the month now. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canApproveInvoices(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { periodId } = await ctx.params;
  const outcome = await redraftPeriod(periodId);
  return outcome.result === "error" ? NextResponse.json({ error: outcome.note }, { status: 400 }) : NextResponse.json({ outcome });
}
