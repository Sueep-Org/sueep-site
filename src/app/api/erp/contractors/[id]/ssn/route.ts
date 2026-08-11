import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canViewSsn } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

// The only place Contractor.ssn is ever returned in full — everywhere else
// (the general contractor GET/PATCH, the info panel's initial props) it's
// stripped, so the real value only reaches the client when explicitly
// requested here, by a role allowed to see it. Same pattern as
// /api/erp/employees/[id]/ssn/route.ts.
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewSsn(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const contractor = await prisma.contractor.findUnique({ where: { id }, select: { ssn: true } });
  if (!contractor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ssn: contractor.ssn });
}
