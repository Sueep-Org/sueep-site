import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import { findCompanyByInviteCode } from "@/lib/estimatorCompany";
import { effectiveSeatLimit } from "@/lib/estimatorBilling";

// Joins the current user to a company by invite code, as a MEMBER (this
// endpoint never grants OWNER, that only happens at creation). Only valid
// for a user who isn't already in a company, covers both the normal
// first-time signup case and a removed member re-joining somewhere new.
export async function POST(request: Request) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.companyId) return NextResponse.json({ error: "Already in a company" }, { status: 400 });

  let body: { inviteCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.inviteCode?.trim()) return NextResponse.json({ error: "Invite code is required" }, { status: 400 });

  const company = await findCompanyByInviteCode(body.inviteCode);
  if (!company) return NextResponse.json({ error: "That invite code doesn't match a company" }, { status: 404 });

  const seatLimit = effectiveSeatLimit(company);
  const memberCount = await prisma.estimatorUser.count({ where: { companyId: company.id } });
  if (memberCount >= seatLimit) {
    return NextResponse.json(
      {
        error: `This company is at its ${seatLimit}-seat limit. Ask the owner to remove someone or upgrade to Pro for more seats.`,
        code: "SEAT_LIMIT_REACHED",
      },
      { status: 403 },
    );
  }

  await prisma.estimatorUser.update({
    where: { id: user.id },
    data: { companyId: company.id, role: "MEMBER" },
  });

  return NextResponse.json({ company: { id: company.id, name: company.name } });
}
