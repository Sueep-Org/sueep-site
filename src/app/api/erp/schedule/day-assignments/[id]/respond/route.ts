import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { recordShiftResponse, ShiftAlreadyPassedError, SHIFT_RESPONSE_ENABLED } from "@/lib/erp/shiftResponses";

type Ctx = { params: Promise<{ id: string }> };

/** A supervisor accepting/declining their own assignment from inside the
 * ERP (see the dashboard's "My projects" feed) — same underlying write as
 * the public /shift-response/[token] link, just reached without a token
 * since they're already authenticated. */
export async function POST(req: Request, ctx: Ctx) {
  if (!SHIFT_RESPONSE_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { id } = await ctx.params;
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be \"accept\" or \"decline\"" }, { status: 400 });
  }

  const assignment = await prisma.projectDayAssignment.findUnique({
    where: { id },
    select: { supervisorUserId: true },
  });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the supervisor this specific day is assigned to can respond for
  // it, or an admin — this is a personal RSVP, not a scheduling permission,
  // so it deliberately doesn't reuse the broader PM/SALES override set that
  // gates actual scheduling actions elsewhere in this app.
  const supervisorUser = await prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } });
  const isOwnAssignment = !!supervisorUser && supervisorUser.id === assignment.supervisorUserId;
  if (!isOwnAssignment && auth.role !== "ADMIN") {
    return NextResponse.json({ error: "You can only respond to your own assignments" }, { status: 403 });
  }

  try {
    const updated = await recordShiftResponse("day", id, action);
    return NextResponse.json({ status: updated.status });
  } catch (e) {
    if (e instanceof ShiftAlreadyPassedError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("POST /api/erp/schedule/day-assignments/[id]/respond", e);
    return NextResponse.json({ error: "Failed to save your response" }, { status: 500 });
  }
}
