/** Request parsing shared by the Management calendar's API routes. */

import { NextResponse } from "next/server";
import { canManageManagementCalendar, getErpAuth, type ErpAuthContext } from "@/lib/erpAuth";
import { parseDateKey } from "./janitorialSchedule";
import { CATEGORY_COLORS, isRepeatValue, type RepeatValue } from "./managementCalendar";

/** The signed-in Admin or PM, or the response to send back instead. */
export async function requireManagementAuth(): Promise<ErpAuthContext | NextResponse> {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageManagementCalendar(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return auth;
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

type EventFields = { title: string; categoryId: string; startDate: Date; endDate: Date | null; repeat: RepeatValue; notes: string | null; link: string | null };

/** Validates a full event from the add/edit form. Returns an error message or the fields to save. */
export function parseEventBody(body: Record<string, unknown>): string | EventFields {
  const title = String(body.title ?? "").trim();
  if (!title) return "Title is required";
  if (title.length > 200) return "Title is too long";
  const categoryId = String(body.categoryId ?? "");
  if (!categoryId) return "Pick a category";
  const startDate = parseDateKey(body.startDate);
  if (!startDate) return "Start date is required";
  let endDate: Date | null = null;
  if (body.endDate) {
    endDate = parseDateKey(body.endDate);
    if (!endDate) return "Invalid end date";
    if (endDate < startDate) return "End date can't be before the start date";
    if (endDate.getTime() === startDate.getTime()) endDate = null;
  }
  const repeat = body.repeat ?? "NONE";
  if (!isRepeatValue(repeat)) return "Invalid repeat";
  const notes = String(body.notes ?? "").trim() || null;
  let link = String(body.link ?? "").trim() || null;
  if (link && !/^(https?:\/\/|\/)/i.test(link)) link = `https://${link}`;
  return { title, categoryId, startDate, endDate, repeat, notes, link };
}

export function parseColor(value: unknown): string | null {
  const c = String(value ?? "");
  return c in CATEGORY_COLORS ? c : null;
}
