import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { erpSessionCookieName } from "@/lib/erpSession";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(erpSessionCookieName);

  if (!token) {
    return NextResponse.json({ error: "No session cookie" }, { status: 401 });
  }

  // If we have a valid cookie, the session is valid
  // (More sophisticated validation with JWT could be added here)
  return NextResponse.json({ ok: true });
}
