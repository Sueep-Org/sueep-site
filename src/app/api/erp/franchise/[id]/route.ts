import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canSeeFranchiseInquiries } from "@/lib/erpAuth";

const VALID_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "NOT_A_FIT"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFranchiseInquiries(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = String(body.status).trim();
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = status;
  }

  if (body.internalNotes !== undefined) {
    data.internalNotes = String(body.internalNotes).trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const inquiry = await prisma.franchiseInquiry.update({
    where: { id },
    data,
    select: { id: true, status: true },
  });

  return NextResponse.json(inquiry);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getErpAuth();
  if (!auth || !canSeeFranchiseInquiries(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.franchiseInquiry.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
