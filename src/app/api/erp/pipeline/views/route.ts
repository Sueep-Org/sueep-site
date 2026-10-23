import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManagePipeline, canViewPipelineBoard, getErpAuth } from "@/lib/erpAuth";

export const runtime = "nodejs";

const MAX_VIEWS_PER_PERSON = 30;
const MAX_FILTER_BYTES = 4000;

/** POST { pipeline, name, filters, closed, shared }: save the board's current filters as a view. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !canViewPipelineBoard(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return NextResponse.json({ error: "Give the view a name" }, { status: 400 });
  if (!body.filters || typeof body.filters !== "object" || JSON.stringify(body.filters).length > MAX_FILTER_BYTES) {
    return NextResponse.json({ error: "Invalid filters" }, { status: 400 });
  }
  const pipeline = body.pipeline === "janitorial" ? "janitorial" : "post-con";
  const shared = body.shared === true;
  if (shared && !canManagePipeline(auth.role)) return NextResponse.json({ error: "Only Admins and the Business Manager can share views" }, { status: 403 });

  const count = await prisma.savedBoardView.count({ where: { userEmail: auth.email } });
  if (count >= MAX_VIEWS_PER_PERSON) return NextResponse.json({ error: `You have ${MAX_VIEWS_PER_PERSON} views already. Delete one first.` }, { status: 409 });

  const view = await prisma.savedBoardView.create({
    data: {
      userEmail: auth.email,
      pipeline,
      name,
      filters: body.filters as Prisma.InputJsonValue,
      closed: body.closed === "all" ? "all" : "recent",
      shared,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: view.id }, { status: 201 });
}
