import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { sendEmail } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

function clockUrl(token: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sueep.com";
  return `${siteUrl}/clock/${token}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Manages an employee's private clock-in link. Body:
 *   { action: "create" } - makes a link if they don't have one (returns the existing one otherwise)
 *   { action: "reset" }  - replaces it; the old link stops working (e.g. lost phone)
 *   { action: "email" }  - emails the current link to the employee
 *   { action: "disable" } - removes the link entirely
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = String(body.action ?? "");

  const employee = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, email: true, clockToken: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

  if (action === "disable") {
    await prisma.employee.update({ where: { id }, data: { clockToken: null, clockTokenCreatedAt: null } });
    return NextResponse.json({ url: null });
  }

  if (action === "create" || action === "reset") {
    if (action === "create" && employee.clockToken) return NextResponse.json({ url: clockUrl(employee.clockToken) });
    // Unguessable and long-lived, so stronger than the 7-day info-form UUID.
    const token = randomBytes(24).toString("base64url");
    await prisma.employee.update({ where: { id }, data: { clockToken: token, clockTokenCreatedAt: new Date() } });
    return NextResponse.json({ url: clockUrl(token) });
  }

  if (action === "email") {
    if (!employee.clockToken) return NextResponse.json({ error: "Create a link first" }, { status: 400 });
    if (!employee.email) return NextResponse.json({ error: "This employee has no email address" }, { status: 400 });
    const url = clockUrl(employee.clockToken);
    try {
      await sendEmail({
        to: employee.email,
        subject: "Your Sueep clock-in link / Tu enlace para marcar entrada",
        html: `<p>Hi ${escapeHtml(employee.firstName)},</p>
<p>Use this link to clock in and out of your shifts. Save it to your phone's home screen so it's easy to find.</p>
<p><a href="${url}">${url}</a></p>
<p>This link is just for you, so please don't share it.</p>
<hr />
<p>Hola ${escapeHtml(employee.firstName)},</p>
<p>Usa este enlace para marcar tu entrada y salida en tus turnos. Guárdalo en la pantalla de inicio de tu teléfono para encontrarlo fácilmente. La página está disponible en español.</p>
<p>Este enlace es solo para ti, por favor no lo compartas.</p>
<p>Sueep</p>`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Email send failed";
      console.error("clock-link email error:", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
    return NextResponse.json({ url, emailed: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
