import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyEstimatorIdToken } from "@/lib/estimatorAuthServer";
import { createEstimatorSessionToken, estimatorSessionCookieName, estimatorSessionCookieOptions } from "@/lib/estimatorSession";

export async function POST(request: Request) {
  let body: { idToken?: string };
  try {
    body = (await request.json()) as { idToken?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

  try {
    const decoded = await verifyEstimatorIdToken(body.idToken);
    if (!decoded.email) return NextResponse.json({ error: "Estimator account has no email" }, { status: 400 });
    const now = new Date();
    const user = await prisma.estimatorUser.upsert({
      where: { firebaseUid: decoded.uid },
      create: { firebaseUid: decoded.uid, email: decoded.email, displayName: decoded.name || null, lastLoginAt: now },
      update: { email: decoded.email, displayName: decoded.name || null, lastLoginAt: now },
    });
    const token = await createEstimatorSessionToken(user.id, user.firebaseUid);
    const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, displayName: user.displayName } });
    response.cookies.set(estimatorSessionCookieName, token, estimatorSessionCookieOptions(60 * 60 * 24 * 7));
    return response;
  } catch (error) {
    console.error("Estimator session creation failed", error);
    return NextResponse.json({ error: "Invalid or expired estimator token" }, { status: 401 });
  }
}