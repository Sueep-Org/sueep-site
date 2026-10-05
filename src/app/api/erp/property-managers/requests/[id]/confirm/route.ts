import { NextResponse } from "next/server";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { confirmPropertyManagerRequest } from "@/lib/erp/propertyManagerRequests";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { startDate, endDate?, price, message? }. Makes the unit and emails the property manager. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const result = await confirmPropertyManagerRequest(id, body, auth.email);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
