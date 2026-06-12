import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ERP_ROLES, type ErpRole } from "@/lib/erpSession";

async function requireAdmin(): Promise<NextResponse | null> {
  const h = await headers();
  const role = h.get("x-erp-role");
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await prisma.erpUser.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, createdAt: true, updatedAt: true, firebaseUid: true },
  });

  return NextResponse.json({ users });
}
