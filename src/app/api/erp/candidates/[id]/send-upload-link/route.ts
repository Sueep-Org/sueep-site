import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildPaperworkUploadEmail } from "@/lib/email";

const TOKEN_EXPIRY_DAYS = 7;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const candidate = await prisma.candidateApplication.findUnique({
    where: { id },
    select: { id: true, fullName: true, email: true, status: true, paperwork: true },
  });

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (candidate.status !== "ONBOARDING") {
    return NextResponse.json(
      { error: "Candidate must be in ONBOARDING status to send an upload link" },
      { status: 400 }
    );
  }

  const paperwork = (candidate.paperwork ?? []) as { label: string; url: string }[];
  if (paperwork.length === 0) {
    return NextResponse.json(
      { error: "Add at least one required document before sending the upload link" },
      { status: 400 }
    );
  }

  const token = crypto.randomUUID();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TOKEN_EXPIRY_DAYS);

  await prisma.candidateApplication.update({
    where: { id },
    data: { paperworkUploadToken: token, paperworkUploadTokenExpiry: expiry },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const uploadUrl = `${siteUrl}/candidate-portal/${token}`;

  await sendEmail({
    to: candidate.email,
    subject: "Upload your onboarding documents — Sueep",
    html: buildPaperworkUploadEmail({
      fullName: candidate.fullName,
      uploadUrl,
      documents: paperwork.map((p) => p.label),
      expiryDays: TOKEN_EXPIRY_DAYS,
    }),
  });

  return NextResponse.json({ ok: true, expiry: expiry.toISOString() });
}
