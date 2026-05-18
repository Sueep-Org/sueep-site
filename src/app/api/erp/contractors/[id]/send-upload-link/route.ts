import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildContractorDocUploadEmail } from "@/lib/email";

const TOKEN_EXPIRY_DAYS = 7;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contractor = await prisma.contractor.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, paperwork: true },
  });

  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  if (!contractor.email) {
    return NextResponse.json({ error: "Contractor has no email address" }, { status: 400 });
  }

  const paperwork = (contractor.paperwork ?? []) as { label: string; url: string }[];
  if (paperwork.length === 0) {
    return NextResponse.json(
      { error: "Add at least one required document before sending the upload link" },
      { status: 400 }
    );
  }

  const token = crypto.randomUUID();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TOKEN_EXPIRY_DAYS);

  await prisma.contractor.update({
    where: { id },
    data: { paperworkUploadToken: token, paperworkUploadTokenExpiry: expiry },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const uploadUrl = `${siteUrl}/contractor-portal/${token}`;

  try {
    await sendEmail({
      to: contractor.email,
      subject: "Upload your documents — Sueep",
      html: buildContractorDocUploadEmail({
        name: contractor.name,
        uploadUrl,
        documents: paperwork.map((p) => p.label),
        expiryDays: TOKEN_EXPIRY_DAYS,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("contractor send-upload-link error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expiry: expiry.toISOString() });
}
