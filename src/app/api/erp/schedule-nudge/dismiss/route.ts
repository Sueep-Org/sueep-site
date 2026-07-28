import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, isProjectManager } from "@/lib/erpAuth";
import { dismissProjectForToday } from "@/lib/erp/scheduleNudge";

export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth || !isProjectManager(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  // auth.uid is the Firebase UID (from the session token), not the ErpUser.id
  // the dismissal's dismissedByUserId FK points at — resolve the actual row.
  const erpUser = await prisma.erpUser.findUnique({ where: { firebaseUid: auth.uid }, select: { id: true } });

  const result = await dismissProjectForToday(projectId, erpUser?.id ?? null);
  if (!result.ok) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
