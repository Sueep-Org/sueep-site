import { NextResponse } from "next/server";
import { scheduleEditForbidden } from "@/lib/erp/scheduleAccess";
import { isScheduleRemovalReason } from "@/lib/erp/scheduleRemovals";
import { loadAppLists } from "@/lib/erp/appListsServer";
import { getErpAuth } from "@/lib/erpAuth";
import { personName, removeProjectDay } from "@/lib/erp/scheduleDayRemove";

type Ctx = { params: Promise<{ id: string }> };

// Takes one planned day off the calendar (scheduleDayRemove.ts). Optional
// { reason, note }: any reason except MISTAKE leaves a grayed-out
// ScheduleDayRemoval; no body (older callers) or MISTAKE just deletes.
// Voiding the whole job is its own call (projects/[id]/void).
export async function DELETE(req: Request, ctx: Ctx) {
  const forbidden = await scheduleEditForbidden();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as { reason?: unknown; note?: unknown } | null;
  const removalReasons = (await loadAppLists()).removalReasons;
  const reason = isScheduleRemovalReason(body?.reason, removalReasons) ? body.reason : null;
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const auth = await getErpAuth();

  const done = await removeProjectDay(id, { reason, note, removedByName: await personName(auth?.email) });
  if (!done) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, removal: done.removal });
}
