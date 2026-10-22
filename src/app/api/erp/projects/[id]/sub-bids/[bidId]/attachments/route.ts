import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { SUB_BID_FILE_MAX_BYTES, SUB_BID_FILE_TYPES, canSeeProposals } from "@/lib/erp/subBids";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; bidId: string }> };

/** Browsers aren't consistent about CSV and Excel types, so the extension counts too. Returns the type to store, or null if not allowed. */
function allowedType(file: File): string | null {
  if (file.type in SUB_BID_FILE_TYPES) return file.type;
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!ext) return null;
  return Object.entries(SUB_BID_FILE_TYPES).find(([, exts]) => exts.split(",").includes(ext))?.[0] ?? null;
}

/** Add one file to a bid. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, bidId } = await ctx.params;
  const bid = await prisma.subBid.findFirst({ where: { id: bidId, projectId: id }, select: { id: true } });
  if (!bid) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a file" }, { status: 400 });
  if (file.size > SUB_BID_FILE_MAX_BYTES) return NextResponse.json({ error: `${file.name} is too big (max 4 MB)` }, { status: 413 });
  const mimeType = allowedType(file);
  if (!mimeType) return NextResponse.json({ error: `${file.name}: only PDF, image, Excel, Word or CSV files` }, { status: 415 });

  const attachment = await prisma.subBidAttachment.create({
    data: { bidId, filename: file.name, mimeType, size: file.size, data: Buffer.from(await file.arrayBuffer()), uploadedBy: auth.email },
    select: { id: true, filename: true, mimeType: true, size: true },
  });
  return NextResponse.json(attachment, { status: 201 });
}
