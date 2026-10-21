import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildEmployeeInfoEmail } from "@/lib/email";
import { parseLang, tr } from "@/lib/erp/language";

const TOKEN_EXPIRY_DAYS = 7;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, email: true, language: true },
  });

  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!employee.email) {
    return NextResponse.json({ error: "Employee has no email address" }, { status: 400 });
  }

  const token = crypto.randomUUID();
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + TOKEN_EXPIRY_DAYS);

  await prisma.employee.update({
    where: { id },
    data: { infoToken: token, infoTokenExpiry: expiry },
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  const infoUrl = `${siteUrl}/employee-info/${token}`;

  try {
    await sendEmail({
      type: "EMPLOYEE_INFO_LINK",
      link: `/erp/employees/${id}`,
      to: employee.email,
      subject: tr(parseLang(employee.language), { en: "Sueep: Complete your employee information", es: "Sueep: Completa tu información de empleado" }),
      lang: parseLang(employee.language),
      html: buildEmployeeInfoEmail({
        lang: parseLang(employee.language),
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        infoUrl,
        expiryDays: TOKEN_EXPIRY_DAYS,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("employee send-info-link error:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, expiry: expiry.toISOString() });
}
