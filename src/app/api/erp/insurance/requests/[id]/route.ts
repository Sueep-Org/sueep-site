import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { REQUEST_STATUSES } from "@/lib/erp/coiRequests";

type Ctx = { params: Promise<{ id: string }> };

/** Body: { status?, projectId? } */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: unknown; projectId?: unknown };

  const data: { status?: string; projectId?: string } = {};
  if (body.status !== undefined) {
    if (!REQUEST_STATUSES.some((s) => s.value === body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    data.status = body.status as string;
  }
  if (body.projectId !== undefined) {
    if (typeof body.projectId !== "string" || !body.projectId) return NextResponse.json({ error: "Pick a project" }, { status: 400 });
    const project = await prisma.project.findUnique({ where: { id: body.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 400 });
    data.projectId = project.id;
  }

  try {
    await prisma.coiRequest.update({ where: { id }, data });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
