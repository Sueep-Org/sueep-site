import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  const co = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
    select: { docusealTemplateId: true },
  });
  if (!co?.docusealTemplateId) {
    return NextResponse.json({ error: "No template found — upload a contract first" }, { status: 404 });
  }

  const secret = new TextEncoder().encode(process.env.DOCUSEAL_API_KEY!);
  const token = await new SignJWT({
    user_email: "erp@sueep.com",
    name: "Sueep Admin",
    template_id: co.docusealTemplateId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("2h")
    .sign(secret);

  return NextResponse.json({ token });
}
