import { NextResponse } from "next/server";
import { createErpSessionToken, erpSessionCookieName, erpSessionCookieOptions } from "@/lib/erpSession";

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

/**
 * Verify Firebase ID token by calling the Firebase REST API
 * Reference: https://firebase.google.com/docs/reference/rest/auth#section-verify-custom-token
 */
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  if (!FIREBASE_PROJECT_ID) {
    console.error("FIREBASE_PROJECT_ID not configured");
    return null;
  }

  try {
    // Use Firebase REST API to verify the token
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      console.error("Firebase token verification failed:", response.status);
      return null;
    }

    const data = (await response.json()) as { users?: Array<{ localId: string; email?: string }> };
    const user = data.users?.[0];

    if (!user) {
      return null;
    }

    return {
      uid: user.localId,
      email: user.email,
    };
  } catch (error) {
    console.error("Firebase token verification error:", error);
    return null;
  }
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

  // Verify Firebase ID token
  const firebaseUser = await verifyFirebaseToken(body.idToken);
  if (!firebaseUser) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let token: string;
  try {
    token = await createErpSessionToken();
  } catch {
    return NextResponse.json({ error: "ERP_SESSION_SECRET missing or too short" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(erpSessionCookieName, token, erpSessionCookieOptions(60 * 60 * 24 * 7));
  return res;
}
