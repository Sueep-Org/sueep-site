import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEstimatorUserFromSession } from "@/lib/estimatorAuthServer";
import { createCompanyWithInviteCode } from "@/lib/estimatorCompany";

// Current user's company: invite code (everyone) plus the member list, only
// populated when the caller is the OWNER — members shouldn't see each
// other's emails just by loading this page. Settings hides that section
// client-side for non-owners, but the API enforces it too, not just the UI.
export async function GET() {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.companyId) return NextResponse.json({ company: null });

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (!company) return NextResponse.json({ company: null });

  const members =
    user.role === "OWNER"
      ? await prisma.estimatorUser.findMany({
          where: { companyId: company.id },
          select: { id: true, email: true, displayName: true, role: true },
          orderBy: { email: "asc" },
        })
      : null;

  return NextResponse.json({
    company: { id: company.id, name: company.name, inviteCode: company.inviteCode },
    role: user.role,
    members,
  });
}

// Creates a company for the current user and makes them its OWNER. Only
// valid for a user who isn't already in one, this isn't a "switch company"
// endpoint, use /api/estimator/company/join for that (also only valid for a
// companyless user, see that route).
export async function POST(request: Request) {
  const user = await getEstimatorUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.companyId) return NextResponse.json({ error: "Already in a company" }, { status: 400 });

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

  const company = await createCompanyWithInviteCode(name);
  await prisma.estimatorUser.update({
    where: { id: user.id },
    data: { companyId: company.id, role: "OWNER" },
  });

  return NextResponse.json({ company: { id: company.id, name: company.name, inviteCode: company.inviteCode } });
}
