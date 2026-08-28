import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ incidentId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { incidentId } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : null;
  if (!status || !["OPEN", "RESOLVED", "ESCALATED"].includes(status)) {
    return NextResponse.json({ error: "status must be OPEN, RESOLVED, or ESCALATED" }, { status: 400 });
  }

  const data: Record<string, unknown> = { status };
  if (status === "RESOLVED") data.resolvedAt = new Date();
  if (status === "ESCALATED") data.escalatedAt = new Date();

  const incident = await prisma.safetyIncident.update({ where: { id: incidentId }, data });
  return NextResponse.json(incident);
}
