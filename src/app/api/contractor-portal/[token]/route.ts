import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type PaperworkItem = { label: string; url: string };
type Ctx = { params: Promise<{ token: string }> };

async function resolveContractor(token: string) {
  const contractor = await prisma.contractor.findUnique({
    where: { paperworkUploadToken: token },
    select: {
      id: true,
      name: true,
      paperwork: true,
      paperworkUploadTokenExpiry: true,
    },
  });
  if (!contractor) return null;
  if (!contractor.paperworkUploadTokenExpiry || contractor.paperworkUploadTokenExpiry < new Date()) {
    return null;
  }
  return contractor;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { token } = await params;
  const contractor = await resolveContractor(token);
  if (!contractor) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });

  return NextResponse.json({
    name: contractor.name,
    paperwork: (contractor.paperwork ?? []) as PaperworkItem[],
    expiry: contractor.paperworkUploadTokenExpiry!.toISOString(),
  });
}
