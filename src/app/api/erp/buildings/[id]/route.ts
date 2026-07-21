import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditPricing } from "@/lib/erpAuth";
import { sanitizeTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";
import type { ErpRole } from "@/lib/erpSession";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const building = await prisma.building.findUnique({ where: { id } });
  if (!building) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(building);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.building.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const trimmed = String(body.name || "").trim();
    if (!trimmed) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    data.name = trimmed;
  }
  if (body.builder !== undefined) {
    const trimmed = String(body.builder || "").trim();
    data.builder = trimmed || null;
  }
  if (body.address !== undefined) {
    const trimmed = String(body.address || "").trim();
    if (!trimmed) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }
    data.address = trimmed;
  }
  if (body.pmName !== undefined) {
    const trimmed = String(body.pmName || "").trim();
    data.pmName = trimmed || null;
  }
  if (body.pmEmail !== undefined) {
    const trimmed = String(body.pmEmail || "").trim();
    data.pmEmail = trimmed || null;
  }
  if (body.pmPhone !== undefined) {
    const trimmed = String(body.pmPhone || "").trim();
    data.pmPhone = trimmed || null;
  }
  if (body.hubspotDealId !== undefined) {
    const trimmed = String(body.hubspotDealId || "").trim();
    data.hubspotDealId = trimmed || null;
  }
  if (body.pricingPackage !== undefined) {
    if (!canEditPricing((req.headers.get("x-erp-role") as ErpRole) ?? "EMPLOYEE")) {
      return NextResponse.json({ error: "Only Admin, Project Manager, or Estimation roles can edit pricing packages" }, { status: 403 });
    }
    data.pricingPackage =
      body.pricingPackage == null ? null : sanitizeTurnoverPricingPackage(body.pricingPackage);
  }
  if (body.commissionEmployeeId !== undefined) {
    if (!canEditPricing((req.headers.get("x-erp-role") as ErpRole) ?? "EMPLOYEE")) {
      return NextResponse.json({ error: "Only Admin, Project Manager, or Estimation roles can edit the commission owner" }, { status: 403 });
    }
    data.commissionEmployeeId = body.commissionEmployeeId ? String(body.commissionEmployeeId) : null;
  }

  try {
    const building = await prisma.building.update({ where: { id }, data: data as object });
    return NextResponse.json(building);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "That HubSpot deal ID is already linked to a different building" }, { status: 409 });
    }
    console.error("PATCH /api/erp/buildings/[id]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.building.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/erp/buildings/[id]", e);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
