import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { createLaborEntryForProject } from "@/lib/erp/createLaborEntry";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.laborEntry.findMany({
    where: { projectId: id },
    orderBy: { workDate: "desc" },
    include: { sovItems: { select: { id: true } } },
  });
  return NextResponse.json(entries);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const auth = await getErpAuth();
  const result = await createLaborEntryForProject(id, body, auth);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.entry);
}
