import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canViewPipelineBoard, getErpAuth } from "@/lib/erpAuth";
import { cleanCardFields } from "@/lib/erp/boardCardFields";

export const runtime = "nodejs";

/** PUT { pipeline, fields }: the viewer's card details for that pipeline. */
export async function PUT(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const pipeline = body.pipeline === "janitorial" ? "janitorial" : "post-con";
  const cardFields = cleanCardFields(body.fields);
  await prisma.boardPreference.upsert({
    where: { userEmail_pipeline: { userEmail: auth.email, pipeline } },
    create: { userEmail: auth.email, pipeline, cardFields },
    update: { cardFields },
  });
  return NextResponse.json({ fields: cardFields });
}
