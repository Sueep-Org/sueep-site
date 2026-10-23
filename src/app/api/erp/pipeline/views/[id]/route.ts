import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManagePipeline, canViewPipelineBoard, getErpAuth } from "@/lib/erpAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** The view, if the viewer may change it: their own, or any shared one for Admins and the Business Manager. */
async function editable(id: string) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return { view: null, auth: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const view = await prisma.savedBoardView.findUnique({ where: { id } });
  if (!view) return { view: null, auth: null, error: NextResponse.json({ error: "View not found" }, { status: 404 }) };
  const mine = view.userEmail === auth.email;
  if (!mine && !(view.shared && canManagePipeline(auth.role))) {
    return { view: null, auth: null, error: NextResponse.json({ error: "That view belongs to someone else" }, { status: 403 }) };
  }
  return { view, auth, error: null };
}

/** PATCH { name?, shared? } */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { view, auth, error } = await editable(id);
  if (error) return error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const data: { name?: string; shared?: boolean } = {};
  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    if (!name) return NextResponse.json({ error: "Give the view a name" }, { status: 400 });
    data.name = name;
  }
  if ("shared" in body) {
    if (!canManagePipeline(auth.role)) return NextResponse.json({ error: "Only Admins and the Business Manager can share views" }, { status: 403 });
    data.shared = body.shared === true;
  }
  await prisma.savedBoardView.update({ where: { id: view.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { view, error } = await editable(id);
  if (error) return error;
  await prisma.savedBoardView.delete({ where: { id: view.id } });
  return NextResponse.json({ ok: true });
}
