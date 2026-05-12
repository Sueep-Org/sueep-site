import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.projectImage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageUrl = String(body.imageUrl || "").trim();
  if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });

  const takenAt =
    typeof body.takenAt === "string" && body.takenAt
      ? new Date(body.takenAt)
      : body.takenAt === null || body.takenAt === ""
        ? null
        : null;
  if (takenAt && Number.isNaN(takenAt.getTime())) {
    return NextResponse.json({ error: "Invalid takenAt date" }, { status: 400 });
  }

  try {
    const entry = await prisma.projectImage.create({
      data: {
        projectId: id,
        imageUrl,
        caption: body.caption != null ? String(body.caption).trim() || null : null,
        uploadedBy: body.uploadedBy != null ? String(body.uploadedBy).trim() || null : null,
        takenAt,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST project image", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}