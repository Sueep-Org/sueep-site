import { notFound } from "next/navigation";
import { resolveShiftResponseByToken, SHIFT_RESPONSE_ENABLED } from "@/lib/erp/shiftResponses";
import { formatInviteWhen } from "@/lib/erp/scheduleInvites";
import { ShiftResponsePortalClient } from "./ShiftResponsePortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function weekdayLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
};

export default async function ShiftResponsePage({ params, searchParams }: PageProps) {
  if (!SHIFT_RESPONSE_ENABLED) notFound();

  const { token } = await params;
  const { action } = await searchParams;

  const shift = await resolveShiftResponseByToken(token);
  if (!shift) notFound();

  return (
    <ShiftResponsePortalClient
      token={token}
      initialAction={action === "accept" || action === "decline" ? action : null}
      shift={{
        jobTitle: shift.jobTitle,
        when: formatInviteWhen(shift.dateKey, shift.startTime, shift.endTime),
        weekday: weekdayLabel(shift.dateKey),
        location: shift.location,
        role: shift.role,
        status: shift.status,
        isPast: shift.isPast,
      }}
    />
  );
}
