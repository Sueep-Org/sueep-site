import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildWorkOrderNotificationEmailHtml } from "@/lib/email";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  const [project, employee] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { id: true, jobTitle: true } }),
    prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, email: true } }),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!employee.email) return NextResponse.json({ error: "Employee has no email address" }, { status: 400 });

  const projectName = String(body.projectName || project.jobTitle || "").trim();
  const siteAddress = String(body.siteAddress || "").trim();
  const contacts = String(body.contacts || "").trim();
  const startDate = String(body.startDate || "").trim();
  const serviceType = String(body.serviceType || "").trim();
  const notes = String(body.notes || "").trim();

  const origin = req.headers.get("origin") || req.headers.get("host") || "";
  const projectUrl = origin ? `${origin}/erp/projects/${id}` : null;

  const recipientName = `${employee.firstName} ${employee.lastName}`.trim();
  const html = buildWorkOrderNotificationEmailHtml({
    recipientName,
    projectName,
    siteAddress,
    contacts,
    startDate,
    serviceType,
    notes,
    projectUrl,
  });

  try {
    await sendEmail({
      to: employee.email,
      subject: `Work Order: ${projectName}`,
      html,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("send-work-order-email", e);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
