import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Vercel caps request bodies at ~4.5 MB, so anything bigger never reaches
// this route anyway. The client downscales large photos to fit.
const MAX_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"]);
// Some browsers (notably Chrome/Windows for iPhone HEIC files) send an empty
// file.type, so fall back to the extension.
const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
};

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
    return NextResponse.json({ error: "File too large (max 4 MB)" }, { status: 413 });
  }
  const mimeType = file.type || TYPE_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() ?? ""] || "";
  if (!ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const photo = await prisma.unitChecklistPhoto.create({
    data: {
      checklistId: checklist.id,
      sectionId,
      photoType,
      filename: file.name,
      mimeType,
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
