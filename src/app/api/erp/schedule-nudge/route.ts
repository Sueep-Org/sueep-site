import { NextResponse } from "next/server";
import { getErpAuth, isProjectManager } from "@/lib/erpAuth";
import { getUnscheduledActiveProjectsToday } from "@/lib/erp/scheduleNudge";

export async function GET() {
  const auth = await getErpAuth();
  if (!auth || !isProjectManager(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const projects = await getUnscheduledActiveProjectsToday();
  return NextResponse.json({ projects });
}
