import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { parseTermBody } from "@/lib/erp/insuranceInput";

type Ctx = { params: Promise<{ id: string }> };

/** Adds a past term by hand, for policies renewed before costs were tracked. */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseTermBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const policy = await prisma.insurancePolicy.findUnique({ where: { id }, select: { id: true } });
  if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const term = await prisma.insurancePolicyTerm.create({ data: { policyId: id, ...parsed.data }, select: { id: true } });
  return NextResponse.json({ id: term.id });
}
