import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRemindDays } from "@/lib/erp/managementCalendar";
import { badRequest, parseColor, requireManagementAuth } from "@/lib/erp/managementCalendarApi";

export const runtime = "nodejs";

/** Adds a category for manual events. Body: { name, color, remindDays } */
export async function POST(req: Request) {
  const auth = await requireManagementAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return badRequest("Name is required");
  if (name.length > 60) return badRequest("Name is too long");
  const color = parseColor(body?.color) ?? "gray";
  const remindDays = parseRemindDays(body?.remindDays ?? []);
  if (!remindDays) return badRequest("Reminders must be whole days, like 30, 7");

  const last = await prisma.managementCategory.aggregate({ _max: { sortOrder: true } });
  const category = await prisma.managementCategory.create({
    data: { name, color, remindDays, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    select: { id: true },
  });
  return NextResponse.json(category);
}
