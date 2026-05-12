import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.distanceEntry.findMany({
    where: { projectId: id },
    orderBy: { travelDate: "desc" },
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

  const travelDateRaw = body.travelDate;
  if (typeof travelDateRaw !== "string" || !travelDateRaw) {
    return NextResponse.json({ error: "travelDate is required (ISO date)" }, { status: 400 });
  }
  const travelDate = new Date(travelDateRaw);
  if (Number.isNaN(travelDate.getTime())) {
    return NextResponse.json({ error: "Invalid travelDate" }, { status: 400 });
  }

  const miles = typeof body.miles === "number" ? body.miles : Number(body.miles);
  if (!Number.isFinite(miles) || miles <= 0) {
    return NextResponse.json({ error: "miles must be a positive number" }, { status: 400 });
  }

  try {
    const entry = await prisma.distanceEntry.create({
      data: {
        projectId: id,
        travelDate,
        miles,
        personName: body.personName != null ? String(body.personName).trim() || null : null,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST distances", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}