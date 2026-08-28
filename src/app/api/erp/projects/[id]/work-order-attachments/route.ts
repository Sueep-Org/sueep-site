import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachments = await prisma.projectWorkOrderAttachment.findMany({
    where: { projectId: id },
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(attachments);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Only PDF and image files are accepted" }, { status: 415 });

  const buffer = Buffer.from(await file.arrayBuffer());

  const attachment = await prisma.projectWorkOrderAttachment.create({
    data: { projectId: id, filename: file.name, mimeType: file.type, size: file.size, data: buffer },
    select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
  });
  return NextResponse.json(attachment, { status: 201 });
}
