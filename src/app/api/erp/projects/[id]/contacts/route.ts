import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const contacts = await prisma.projectContact.findMany({
    where: { projectId: id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(contacts);
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

  const fullName = String(body.fullName || "").trim();
  if (!fullName) return NextResponse.json({ error: "fullName is required" }, { status: 400 });

  try {
    const contact = await prisma.projectContact.create({
      data: {
        projectId: id,
        fullName,
        role: body.role != null ? String(body.role).trim() || null : null,
        company: body.company != null ? String(body.company).trim() || null : null,
        email: body.email != null ? String(body.email).trim() || null : null,
        phone: body.phone != null ? String(body.phone).trim() || null : null,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        isPrimary: Boolean(body.isPrimary),
      },
    });
    return NextResponse.json(contact);
  } catch (e) {
    console.error("POST project contact", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}