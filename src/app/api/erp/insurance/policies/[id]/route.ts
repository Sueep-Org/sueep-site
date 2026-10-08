import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { parsePolicyBody } from "@/lib/erp/insuranceInput";
import { loadReissueList } from "@/lib/erp/coiRenewals";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
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

  const parsed = parsePolicyBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const before = await prisma.insurancePolicy.findUnique({
    where: { id },
    select: { effectiveDate: true, expiresAt: true, premiumCents: true, auditAdjustmentCents: true, auditDate: true, cancelledOn: true },
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const renewed = parsed.data.expiresAt.getTime() > before.expiresAt.getTime();

  if (renewed) {
    // Keep the old term and its cost so past months on the Finance
    // dashboard don't change. Its audit and cancel date belong to it, not
    // the new term, even if the form sent them back unchanged.
    const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
    const data = { ...parsed.data };
    if (data.auditAdjustmentCents === before.auditAdjustmentCents && same(data.auditDate, before.auditDate)) {
      data.auditAdjustmentCents = null;
      data.auditDate = null;
    }
    if (same(data.cancelledOn, before.cancelledOn)) data.cancelledOn = null;
    await prisma.$transaction([
      prisma.insurancePolicyTerm.create({ data: { policyId: id, ...before } }),
      prisma.insurancePolicy.update({ where: { id }, data }),
    ]);
  } else {
    await prisma.insurancePolicy.update({ where: { id }, data: parsed.data });
  }

  // Renewed (expiration moved later): count the COIs that now need a new
  // version, so the page can point to the Renewals tab.
  let reissueCount = 0;
  if (renewed) {
    reissueCount = (await loadReissueList()).filter((r) => r.renewedPolicyIds.includes(id)).length;
  }
  return NextResponse.json({ ok: true, reissueCount, renewed });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  try {
    await prisma.insurancePolicy.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
