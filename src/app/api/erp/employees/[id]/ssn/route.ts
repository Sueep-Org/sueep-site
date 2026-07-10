import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canViewEmployeeSsn } from "@/lib/erpAuth";

type Ctx = { params: Promise<{ id: string }> };

// The only place Employee.ssn is ever returned in full — everywhere else
// (the general employee GET/PATCH, the profile editor's initial props) it's
// stripped, so the real value only reaches the client when explicitly
// requested here, by a role allowed to see it.
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canViewEmployeeSsn(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const employee = await prisma.employee.findUnique({ where: { id }, select: { ssn: true } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ssn: employee.ssn });
}
