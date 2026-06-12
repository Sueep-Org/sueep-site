import { NextResponse } from "next/server";
import { createErpSessionToken, erpSessionCookieName, erpSessionCookieOptions, ERP_ROLES, type ErpRole } from "@/lib/erpSession";
import { prisma } from "@/lib/prisma";

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  if (!FIREBASE_PROJECT_ID) {
    console.error("FIREBASE_PROJECT_ID not configured");
    return null;
  }
  try {
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { users?: Array<{ localId: string; email?: string }> };
    const user = data.users?.[0];
    if (!user) return null;
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

function resolveInitialRole(email: string): ErpRole {
  const adminEmails = (process.env.ERP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "ADMIN" : "EMPLOYEE";
}

export async function POST(req: Request) {
  const secret = process.env.ERP_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "ERP not configured (ERP_SESSION_SECRET)" }, { status: 503 });
  }

  let body: { idToken?: string };
  try {
    body = (await req.json()) as { idToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.idToken !== "string") {
    return NextResponse.json({ error: "Missing idToken" }, { status: 400 });
  }

  const firebaseUser = await verifyFirebaseToken(body.idToken);
  if (!firebaseUser) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const email = (firebaseUser.email ?? "").toLowerCase();
  const initialRole = resolveInitialRole(email);
  // If email is in ERP_ADMIN_EMAILS, always enforce ADMIN (handles existing records too)
  const forceAdmin = initialRole === "ADMIN";

  const erpUser = await prisma.erpUser.upsert({
    where: { firebaseUid: firebaseUser.uid },
    update: { email, ...(forceAdmin ? { role: "ADMIN" } : {}) },
    create: {
      firebaseUid: firebaseUser.uid,
      email,
      role: initialRole,
    },
  });

  const role = (ERP_ROLES as readonly string[]).includes(erpUser.role)
    ? (erpUser.role as ErpRole)
    : "EMPLOYEE";

  let token: string;
  try {
    token = await createErpSessionToken({ uid: firebaseUser.uid, email, role });
  } catch {
    return NextResponse.json({ error: "ERP_SESSION_SECRET missing or too short" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(erpSessionCookieName, token, erpSessionCookieOptions(60 * 60 * 24 * 7));
  return res;
}
