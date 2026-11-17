import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ERP_ROLES } from "@/lib/erpSession";
import { createFirebaseEmailUser, pendingFirebaseUid, sendFirebasePasswordEmail } from "@/lib/firebaseAuthRest";

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

/**
 * Admin adds a staff user: creates their Firebase login (if they don't have
 * one), saves them with the chosen role, and emails them a link to set a
 * password. Someone who already had a Firebase login keeps their password and
 * gets linked by email on their next sign-in.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { email?: string; role?: string };
  try {
    body = (await req.json()) as { email?: string; role?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  if (!body.role || !(ERP_ROLES as readonly string[]).includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${ERP_ROLES.join(", ")}` }, { status: 400 });
  }

  const existing = await prisma.erpUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: `${email} is already a user. Change their role in the table.` }, { status: 409 });
  }

  const created = await createFirebaseEmailUser(email);
  let firebaseUid: string;
  let emailSent = false;
  if (created.ok) {
    firebaseUid = created.uid;
  } else if (created.code === "EMAIL_EXISTS") {
    firebaseUid = pendingFirebaseUid(email);
  } else {
    console.error("Firebase sign-up failed", created.code);
    return NextResponse.json({ error: `Couldn't create the Firebase login (${created.code})` }, { status: 502 });
  }

  const user = await prisma.erpUser.create({
    data: { email, role: body.role, firebaseUid },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  if (created.ok) {
    const sent = await sendFirebasePasswordEmail(email);
    emailSent = sent.ok;
    if (!sent.ok) console.error("Firebase password email failed", sent.code);
  }

  return NextResponse.json({ user: { ...user, createdAt: user.createdAt.toISOString() }, existingLogin: !created.ok, emailSent });
}
