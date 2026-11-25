import { NextResponse } from "next/server";
import { getErpAuth, canSeeFinancials } from "@/lib/erpAuth";
import { scheduleEditForbidden } from "@/lib/erp/scheduleAccess";
import { voidJob } from "@/lib/erp/voidJob";
import { cancelUpcomingDaysOfVoidedJob, personName } from "@/lib/erp/scheduleDayRemove";
import { todayEasternAsUtcMidnight } from "@/lib/erp/dates";

type Ctx = { params: Promise<{ id: string }> };

// Voids a whole job, from the project's Lifecycle picker or the calendar's
// Remove dialog: billing (voidJob.ts), then its days after today come off the
// calendar with their invites cancelled, each left as a gray "Job voided"
// day. Today and past days, and removed days with their notes, stay. Billing
// roles and anyone who can edit the schedule.
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canSeeFinancials(auth.role)) {
    const forbidden = await scheduleEditForbidden();
    if (forbidden) return forbidden;
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (reason.length < 3) return NextResponse.json({ error: "Say why it won't be billed" }, { status: 400 });

  const result = await voidJob(id, reason);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.message === "Job not found" ? 404 : 409 });

  const cancelledDays = result.fullyVoided
    ? await cancelUpcomingDaysOfVoidedJob(id, reason, await personName(auth.email), todayEasternAsUtcMidnight())
    : 0;
  return NextResponse.json({ ...result, cancelledDays });
}
