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

  const raw = body.employeeIds;
  const employeeIds: string[] =
    Array.isArray(raw) ? raw.map(String).filter(Boolean) :
    body.employeeId ? [String(body.employeeId)] : [];

  if (employeeIds.length === 0) {
    return NextResponse.json({ error: "At least one employeeId is required" }, { status: 400 });
  }

  const [changeOrder, employees] = await Promise.all([
    prisma.projectChangeOrder.findUnique({
      where: { id: changeOrderId, projectId: id },
      include: { project: { select: { id: true, jobTitle: true } } },
    }),
    prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  if (!changeOrder) return NextResponse.json({ error: "Change order not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const projectUrl = appUrl ? `${appUrl}/erp/projects/${id}/change-orders/${changeOrderId}` : null;

  const results: { email: string; ok: boolean }[] = [];

  for (const employee of employees) {
    if (!employee.email) continue;
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
      changeOrderUrl: projectUrl,
    });
    try {
      await sendEmail({
        to: employee.email,
        subject: `Change Order: ${changeOrder.title} — ${changeOrder.project.jobTitle}`,
        html,
      });
      results.push({ email: employee.email, ok: true });
    } catch (e) {
      console.error("notify change order email", e);
      results.push({ email: employee.email, ok: false });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length === results.length && results.length > 0) {
    return NextResponse.json({ error: "Failed to send all emails" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentTo: results.filter((r) => r.ok).map((r) => r.email) });
}
