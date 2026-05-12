import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; imageId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, imageId } = await ctx.params;
  const existing = await prisma.projectImage.findFirst({ where: { id: imageId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.imageUrl !== undefined) {
    const imageUrl = String(body.imageUrl || "").trim();
    if (!imageUrl) return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    data.imageUrl = imageUrl;
  }
  if (body.caption !== undefined) data.caption = body.caption != null ? String(body.caption).trim() || null : null;
  if (body.uploadedBy !== undefined) data.uploadedBy = body.uploadedBy != null ? String(body.uploadedBy).trim() || null : null;
  if (body.takenAt !== undefined) {
    if (body.takenAt === null || body.takenAt === "") data.takenAt = null;
    else {
      const d = new Date(String(body.takenAt));
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid takenAt date" }, { status: 400 });
      data.takenAt = d;
    }
  }

  try {
    const updated = await prisma.projectImage.update({
      where: { id: imageId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH project image", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}