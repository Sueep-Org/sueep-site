import { NextResponse } from "next/server";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";

export async function GET() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt } });
}