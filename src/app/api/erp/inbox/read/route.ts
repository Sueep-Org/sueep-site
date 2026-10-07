import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { inboxEmail, markRead, sentToWhere } from "@/lib/erp/inbox";

export const runtime = "nodejs";

/** Marks emails read: `{ ids }` for specific ones, `{ all: true }` for every unread one. Only the caller's own emails count. */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; all?: unknown };
  const email = inboxEmail(auth);

  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
  if (!ids.length && body.all !== true) return NextResponse.json({ error: "Nothing to mark" }, { status: 400 });

  const mine = await prisma.emailLog.findMany({
    where: { ...sentToWhere(email), ...(body.all === true ? { reads: { none: { userEmail: email } } } : { id: { in: ids } }) },
    select: { id: true },
  });
  await markRead(email, mine.map((m) => m.id));
  return NextResponse.json({ marked: mine.length });
}
