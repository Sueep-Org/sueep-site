import { NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { inboxEmail, unreadCount } from "@/lib/erp/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Unread count for the Notifications badge in the menu. */
export async function GET() {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ count: await unreadCount(inboxEmail(auth)) });
}
