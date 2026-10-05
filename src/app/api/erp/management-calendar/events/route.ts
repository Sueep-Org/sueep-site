import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, parseEventBody, requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

/** Adds a manual event to the Management calendar. */
export async function POST(req: Request) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Invalid body");
  const fields = parseEventBody(body);
  if (typeof fields === "string") return badRequest(fields);
  if (!(await prisma.managementCategory.findUnique({ where: { id: fields.categoryId }, select: { id: true } }))) {
    return badRequest("That category no longer exists");
  }

  const event = await prisma.managementEvent.create({ data: { ...fields, createdBy: auth.email }, select: { id: true } });
  return NextResponse.json(event);
}
