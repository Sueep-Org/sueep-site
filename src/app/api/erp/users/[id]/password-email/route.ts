import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { sendFirebasePasswordEmail } from "@/lib/firebaseAuthRest";

/** Admin sends a user Firebase's set/reset password email. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const h = await headers();
  if (h.get("x-erp-role") !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const user = await prisma.erpUser.findUnique({ where: { id }, select: { email: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const sent = await sendFirebasePasswordEmail(user.email);
  if (!sent.ok) {
    console.error("Firebase password email failed", sent.code);
    return NextResponse.json({ error: `Couldn't send the email (${sent.code})` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
