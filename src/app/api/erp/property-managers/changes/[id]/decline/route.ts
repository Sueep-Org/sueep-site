import { NextResponse } from "next/server";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { declineChange } from "@/lib/erp/propertyManagerChanges";

type Ctx = { params: Promise<{ id: string }> };

/** Declines a property manager's cancel or new date. Body: { reason, message? }. Emails the property manager. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await declineChange(id, auth.email, body);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
