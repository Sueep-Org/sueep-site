import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ERP_ROLES, type ErpRole } from "@/lib/erpSession";

async function requireAdmin(): Promise<{ error: NextResponse } | { uid: string }> {
  const h = await headers();
  const role = h.get("x-erp-role");
  const uid = h.get("x-erp-uid") ?? "";
  if (role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { uid };
}

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const check = await requireAdmin();
  if ("error" in check) return check.error;

  const { id } = await params;

  let body: { role?: string };
  try {
    body = (await req.json()) as { role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.role || !(ERP_ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${ERP_ROLES.join(", ")}` }, { status: 400 });
  }

  const updated = await prisma.erpUser.update({
    where: { id },
    data: { role: body.role as ErpRole },
    select: { id: true, email: true, role: true },
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const check = await requireAdmin();
  if ("error" in check) return check.error;

  const { id } = await params;

  // Prevent self-deletion
  const caller = await prisma.erpUser.findFirst({ where: { firebaseUid: check.uid } });
  if (caller?.id === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.erpUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
