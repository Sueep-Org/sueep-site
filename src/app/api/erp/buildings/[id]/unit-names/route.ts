import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { buildingUnitNames } from "@/lib/erp/unitNamesDb";

type Ctx = { params: Promise<{ id: string }> };

/** The unit names this building already uses, for the unit box's suggestions (see UnitNameInput). */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ names: await buildingUnitNames(id) });
}
