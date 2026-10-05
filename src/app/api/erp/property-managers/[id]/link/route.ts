import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { newPropertyManagerToken, propertyManagerLinkUrl } from "@/lib/erp/propertyManagers";

type Ctx = { params: Promise<{ id: string }> };

/** Replaces this property manager's link so the old one stops working, signs out every device, and voids sign-in buttons in past emails. Returns the new link. */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const token = newPropertyManagerToken();
  try {
    await prisma.$transaction([
      prisma.propertyManager.update({ where: { id }, data: { token } }),
      prisma.propertyManagerDevice.deleteMany({ where: { propertyManagerId: id } }),
      prisma.propertyManagerSignInLink.deleteMany({ where: { propertyManagerId: id } }),
    ]);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ url: propertyManagerLinkUrl(token) });
}
