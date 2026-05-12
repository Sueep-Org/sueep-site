import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function parsePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const entries = await prisma.projectWorkOrder.findMany({
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

  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const priorityCandidate = String(body.priority || "MEDIUM").toUpperCase();
  const priority = PRIORITIES.includes(priorityCandidate as (typeof PRIORITIES)[number])
    ? priorityCandidate
    : "MEDIUM";

  const dueDateRaw = body.dueDate;
  const dueDate =
    typeof dueDateRaw === "string" && dueDateRaw
      ? new Date(dueDateRaw)
      : dueDateRaw === null || dueDateRaw === ""
        ? null
        : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Invalid dueDate" }, { status: 400 });
  }

  const photoUrls = parsePhotoUrls(body.photoUrls);

  try {
    const entry = await prisma.projectWorkOrder.create({
      data: {
        projectId: id,
        title,
        location: body.location != null ? String(body.location).trim() || null : null,
        requestedBy: body.requestedBy != null ? String(body.requestedBy).trim() || null : null,
        priority,
        dueDate,
        scopeDetails: body.scopeDetails != null ? String(body.scopeDetails).trim() || null : null,
        specifications: body.specifications != null ? String(body.specifications).trim() || null : null,
        supportInfo: body.supportInfo != null ? String(body.supportInfo).trim() || null : null,
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      },
    });
    return NextResponse.json(entry);
  } catch (e) {
    console.error("POST work order", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}