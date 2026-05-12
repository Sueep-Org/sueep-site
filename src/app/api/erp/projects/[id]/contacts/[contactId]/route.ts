import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, contactId } = await ctx.params;
  const existing = await prisma.projectContact.findFirst({
    where: { id: contactId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || "").trim();
    if (!fullName) return NextResponse.json({ error: "fullName is required" }, { status: 400 });
    data.fullName = fullName;
  }
  if (body.role !== undefined) data.role = body.role != null ? String(body.role).trim() || null : null;
  if (body.company !== undefined) data.company = body.company != null ? String(body.company).trim() || null : null;
  if (body.email !== undefined) data.email = body.email != null ? String(body.email).trim() || null : null;
  if (body.phone !== undefined) data.phone = body.phone != null ? String(body.phone).trim() || null : null;
  if (body.notes !== undefined) data.notes = body.notes != null ? String(body.notes).trim() || null : null;
  if (body.isPrimary !== undefined) data.isPrimary = Boolean(body.isPrimary);

  try {
    const updated = await prisma.projectContact.update({
      where: { id: contactId },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH project contact", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}