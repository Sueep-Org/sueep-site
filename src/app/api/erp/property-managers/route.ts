import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { newPropertyManagerToken, parsePropertyManagerBody, propertyManagerLinkUrl } from "@/lib/erp/propertyManagers";
import { sendWelcomeEmail } from "@/lib/erp/propertyManagerAccess";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = await parsePropertyManagerBody(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { buildingIds, ...data } = parsed.data;

  const existing = await prisma.propertyManager.findUnique({ where: { email: data.email }, select: { name: true } });
  if (existing) {
    return NextResponse.json({ error: `${existing.name} already uses this email. Edit them instead.` }, { status: 409 });
  }

  const token = newPropertyManagerToken();
  const pm = await prisma.propertyManager.create({
    data: {
      ...data,
      token,
      createdBy: auth.email,
      buildings: { create: buildingIds.map((buildingId) => ({ buildingId })) },
    },
  });
  // "Email them their link now" on the add form
  const welcome = body.sendWelcome === true ? await sendWelcomeEmail(pm.id) : null;
  return NextResponse.json({
    id: pm.id,
    url: propertyManagerLinkUrl(token),
    emailed: welcome ? "ok" in welcome : false,
    emailError: welcome && "error" in welcome ? welcome.error : null,
  });
}
