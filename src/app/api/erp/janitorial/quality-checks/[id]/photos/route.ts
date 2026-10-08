import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { MAX_PHOTOS_PER_CHECK } from "@/lib/erp/janitorialQualityShared";

export const runtime = "nodejs";

// Photos are shrunk in the browser first; this is the backstop (Vercel caps bodies at ~4.5 MB).
const MAX_SIZE = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

type Ctx = { params: Promise<{ id: string }> };

/** Adds a photo to a quality check, optionally for one area. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Pick a photo" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Photo too large (max 4 MB)" }, { status: 413 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: "Photos only (JPG, PNG, WEBP, HEIC)" }, { status: 415 });
  const area = String(form.get("area") ?? "").trim().slice(0, 80) || null;

  const check = await prisma.janitorialQualityCheck.findUnique({ where: { id }, select: { _count: { select: { photos: true } } } });
  if (!check) return NextResponse.json({ error: "Quality check not found" }, { status: 404 });
  if (check._count.photos >= MAX_PHOTOS_PER_CHECK) {
    return NextResponse.json({ error: `Up to ${MAX_PHOTOS_PER_CHECK} photos per check` }, { status: 400 });
  }

  const photo = await prisma.janitorialQualityPhoto.create({
    data: { qualityCheckId: id, area, data: Buffer.from(await file.arrayBuffer()), mimeType: file.type, uploadedBy: auth.email },
    select: { id: true, area: true },
  });
  return NextResponse.json(photo);
}
