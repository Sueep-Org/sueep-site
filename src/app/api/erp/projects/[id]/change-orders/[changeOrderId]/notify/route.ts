import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { buildChangeOrderNotificationEmail } from "@/lib/email";
import { centsToDollars } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const employeeId = body.employeeId ? String(body.employeeId) : null;
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  const [changeOrder, employee] = await Promise.all([
    prisma.projectChangeOrder.findUnique({
      where: { id: changeOrderId, projectId: id },
      include: { project: { select: { id: true, jobTitle: true } } },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!changeOrder) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (!employee.email) return NextResponse.json({ error: "This employee has no email address on file" }, { status: 422 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const projectUrl = appUrl ? `${appUrl}/erp/projects/${id}` : null;

  const html = buildChangeOrderNotificationEmail({
    recipientName: `${employee.firstName} ${employee.lastName}`.trim(),
    projectTitle: changeOrder.project.jobTitle,
    coTitle: changeOrder.title,
    coStatus: changeOrder.status,
    estimatedCost: centsToDollars(changeOrder.estimatedCostCents),
    estimatedDays: changeOrder.estimatedDays,
    description: changeOrder.description,
    reason: changeOrder.reason,
    requestedBy: changeOrder.requestedBy,
    projectUrl,
  });

  try {
    await sendEmail({
      to: employee.email,
      subject: `Change Order: ${changeOrder.title} — ${changeOrder.project.jobTitle}`,
      html,
    });
  } catch (e) {
    console.error("notify change order email", e);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentTo: employee.email });
}
