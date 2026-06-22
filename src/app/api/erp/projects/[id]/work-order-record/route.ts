import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const record = await prisma.projectWorkOrderRecord.findUnique({ where: { projectId: id } });
  return NextResponse.json(record ?? null);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const str = (v: unknown) => (v !== undefined ? (v ? String(v).trim() : null) : undefined);

  const projectName = String(body.projectName || "").trim();
  const startDate = str(body.startDate) ?? null;
  const data = {
    siteAddress: str(body.siteAddress),
    contacts: str(body.contacts),
    startDate,
    serviceType: str(body.serviceType),
    notes: str(body.notes),
  };

  // Determine the project date to set:
  // precise YYYY-MM-DD → sync to project; anything else → clear project date
  const projectDate = startDate && ISO_DATE.test(startDate) ? new Date(startDate) : null;

  const [record] = await prisma.$transaction([
    prisma.projectWorkOrderRecord.upsert({
      where: { projectId: id },
      create: { projectId: id, projectName, ...data },
      update: { projectName: projectName || undefined, ...data },
    }),
    prisma.project.update({
      where: { id },
      data: { projectDate },
    }),
  ]);

  return NextResponse.json(record);
}
