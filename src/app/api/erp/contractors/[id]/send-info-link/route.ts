import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildContractorInfoEmail } from "@/lib/email";

const TOKEN_EXPIRY_DAYS = 7;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const contractor = await prisma.contractor.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });

  if (!contractor) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  if (!contractor.email) {
    return NextResponse.json({ error: "Contractor has no email address" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TOKEN_EXPIRY_DAYS);

  await prisma.contractor.update({
    where: { id },
    data: { infoToken: token, infoTokenExpiry: expiry },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const infoUrl = `${siteUrl}/contractor-info/${token}`;

  try {
    await sendEmail({
      type: "CONTRACTOR_INFO_LINK",
      link: `/erp/contractors/${id}`,
      to: contractor.email,
      subject: "Sueep: Complete your contractor information",
      html: buildContractorInfoEmail({
        name: contractor.name,
        infoUrl,
        expiryDays: TOKEN_EXPIRY_DAYS,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("contractor send-info-link error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expiry: expiry.toISOString() });
}
