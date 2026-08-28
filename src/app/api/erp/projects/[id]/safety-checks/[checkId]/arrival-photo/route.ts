import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

type Ctx = { params: Promise<{ checkId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { checkId } = await params;
  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Images only" }, { status: 415 });

  const data = Buffer.from(await file.arrayBuffer());
  await prisma.dailySafetyCheck.update({
    where: { id: checkId },
    data: { siteArrivalPhotoData: data, siteArrivalPhotoMimeType: file.type, siteArrivalPhotoUploadedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { checkId } = await params;
  const check = await prisma.dailySafetyCheck.findUnique({
    where: { id: checkId },
    select: { siteArrivalPhotoData: true, siteArrivalPhotoMimeType: true },
  });
  if (!check?.siteArrivalPhotoData) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(check.siteArrivalPhotoData), {
    headers: { "Content-Type": check.siteArrivalPhotoMimeType ?? "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
