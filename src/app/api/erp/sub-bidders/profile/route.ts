import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getErpAuth } from "@/lib/erpAuth";
import { bidderKey, canSeeProposals } from "@/lib/erp/subBids";

/**
 * Make a contractor profile for a sub who only bid so far (Contractors,
 * Bidders tab), and move all of that sub's no-profile bids onto it.
 */
export async function POST(req: Request) {
  const auth = await getErpAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeProposals(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const text = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  const key = text(body.key);
  const name = text(body.name);
  if (!key) return NextResponse.json({ error: "Missing bidder" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Enter a name for the profile" }, { status: 400 });

  const unlinked = await prisma.subBid.findMany({
    where: { contractorId: null },
    select: { id: true, bidderName: true, bidderCompany: true, bidderEmail: true },
  });
  const bidIds = unlinked.filter((b) => bidderKey(b) === key).map((b) => b.id);

  try {
    const contractor = await prisma.$transaction(async (tx) => {
      const c = await tx.contractor.create({
        data: {
          name,
          email: text(body.email)?.toLowerCase() ?? null,
          phone: text(body.phone),
          contractorFullName: text(body.contactName),
          role: text(body.role),
          status: "ACTIVE",
        },
        select: { id: true },
      });
      if (bidIds.length) await tx.subBid.updateMany({ where: { id: { in: bidIds }, contractorId: null }, data: { contractorId: c.id } });
      return c;
    });
    return NextResponse.json({ id: contractor.id, linked: bidIds.length }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "A contractor with this email already exists. Open their profile and use Link past bids." }, { status: 409 });
    }
    console.error("POST /api/erp/sub-bidders/profile", e);
    return NextResponse.json({ error: "Could not create the profile" }, { status: 500 });
  }
}
