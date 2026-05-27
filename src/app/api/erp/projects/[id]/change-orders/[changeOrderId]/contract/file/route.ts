import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { changeOrderId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");

  if (!token) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const secret = new TextEncoder().encode(process.env.ERP_SESSION_SECRET!);
    const { payload } = await jwtVerify(token, secret);
    if (payload.coId !== changeOrderId) return new NextResponse("Forbidden", { status: 403 });
  } catch {
    return new NextResponse("Invalid or expired token", { status: 401 });
  }

  const co = await prisma.projectChangeOrder.findUnique({
    where: { id: changeOrderId },
    select: { contractPdfData: true, contractPdfFilename: true },
  });

  if (!co?.contractPdfData) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(co.contractPdfData as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${co.contractPdfFilename ?? "contract.pdf"}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
