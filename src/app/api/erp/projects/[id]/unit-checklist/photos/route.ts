import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/gif"]);

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: projectId } = await ctx.params;

  const checklist = await prisma.unitTurnoverChecklist.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!checklist) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const sectionId = String(formData.get("sectionId") ?? "").trim();
  const photoType = String(formData.get("photoType") ?? "").trim();
  const file = formData.get("file");

  if (!sectionId || !photoType || !(file instanceof File)) {
    return NextResponse.json({ error: "sectionId, photoType, and file are required" }, { status: 400 });
  }
  if (!["before", "after"].includes(photoType)) {
    return NextResponse.json({ error: "photoType must be before or after" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const photo = await prisma.unitChecklistPhoto.create({
    data: {
      checklistId: checklist.id,
      sectionId,
      photoType,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      data: buffer,
    },
    select: { id: true },
  });

  return NextResponse.json({
    id: photo.id,
    url: `/api/erp/projects/${projectId}/unit-checklist/photos/${photo.id}`,
  });
}
