import { NextResponse } from "next/server";
import { getErpAuth, canAssignSchedule } from "@/lib/erpAuth";

/**
 * For the schedule's assignment routes: a 403 response unless the signed-in
 * user may change who's on a day (Admin, PM, Business Manager, Sales), else
 * null. Usage: `const forbidden = await scheduleEditForbidden(); if (forbidden) return forbidden;`
 */
export async function scheduleEditForbidden(): Promise<NextResponse | null> {
  const auth = await getErpAuth();
  if (auth && canAssignSchedule(auth.role)) return null;
  return NextResponse.json(
    { error: "Only an Admin, Project Manager, Business Manager or Sales can change the schedule." },
    { status: 403 },
  );
}
