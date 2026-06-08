import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inputToCents } from "@/lib/erp/money";
import { sendEmail, buildChangeOrderNotificationEmail } from "@/lib/email";
import { centsToDollars } from "@/lib/erp/money";

type Ctx = { params: Promise<{ id: string; changeOrderId: string }> };

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID", "BILLING"] as const;
const BILLING_STATUSES = ["BILLING", "INVOICE_PAID", "INACTIVE"] as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const existing = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
    data.title = title;
  }
  if (body.description !== undefined) data.description = body.description != null ? String(body.description).trim() || null : null;
  if (body.requestedBy !== undefined) data.requestedBy = body.requestedBy != null ? String(body.requestedBy).trim() || null : null;
  if (body.supervisor !== undefined) data.supervisor = body.supervisor != null ? String(body.supervisor).trim() || null : null;
  if (body.reason !== undefined) data.reason = body.reason != null ? String(body.reason).trim() || null : null;
  if (body.resolutionNotes !== undefined) {
    data.resolutionNotes = body.resolutionNotes != null ? String(body.resolutionNotes).trim() || null : null;
  }
  if (body.status !== undefined) {
    const statusRaw = String(body.status || "").toUpperCase();
    if (!STATUSES.includes(statusRaw as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    data.status = statusRaw;
  }
  if (body.billingStatus !== undefined) {
    if (body.billingStatus === null || body.billingStatus === "") {
      data.billingStatus = null;
    } else {
      const bs = String(body.billingStatus).toUpperCase();
      if (!BILLING_STATUSES.includes(bs as (typeof BILLING_STATUSES)[number])) {
        return NextResponse.json({ error: "Invalid billingStatus" }, { status: 400 });
      }
      data.billingStatus = bs;
    }
  }
  if (body.percentInvoiced !== undefined) {
    const n = Number(body.percentInvoiced);
    data.percentInvoiced = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  if (body.estimatedCost !== undefined) data.estimatedCostCents = inputToCents(body.estimatedCost);
  if (body.contractValue !== undefined) data.contractValueCents = inputToCents(body.contractValue);
  if (body.estMaterial !== undefined) data.estMaterialCents = inputToCents(body.estMaterial);
  if (body.estTravel !== undefined) data.estTravelCents = inputToCents(body.estTravel);
  if (body.estLabor !== undefined) data.estLaborCents = inputToCents(body.estLabor);
  if (body.actualLabor !== undefined) data.actualLaborCents = inputToCents(body.actualLabor);
  if (body.actualMaterial !== undefined) data.actualMaterialCents = inputToCents(body.actualMaterial);
  if (body.actualTravel !== undefined) data.actualTravelCents = inputToCents(body.actualTravel);
  if (body.estimatedDays !== undefined) {
    if (body.estimatedDays === null || body.estimatedDays === "") {
      data.estimatedDays = null;
    } else {
      const n = Number(body.estimatedDays);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "estimatedDays must be a non-negative number" }, { status: 400 });
      }
      data.estimatedDays = Math.round(n);
    }
  }

  const laborersRaw = Array.isArray(body.laborers)
    ? (body.laborers as unknown[]).flatMap((l) => {
        if (typeof l !== "object" || l === null) return [];
        const lo = l as Record<string, unknown>;
        const name = String(lo.name || "").trim();
        if (!name) return [];
        return [{ name, employeeId: lo.employeeId ? String(lo.employeeId) : null, role: lo.role ? String(lo.role).trim() || null : null }];
      })
    : null;

  const becomingApproved = data.status === "APPROVED" && existing.status !== "APPROVED";

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (laborersRaw !== null) {
        await tx.projectChangeOrderLaborer.deleteMany({ where: { changeOrderId } });
        if (laborersRaw.length) {
          await tx.projectChangeOrderLaborer.createMany({
            data: laborersRaw.map(({ name, employeeId, role }) => ({ changeOrderId, name, employeeId, role })),
          });
        }
      }
      return tx.projectChangeOrder.update({
        where: { id: changeOrderId },
        data,
        include: { laborers: { orderBy: { createdAt: "asc" } } },
      });
    });

    // Fire approval notification to the project's PM — non-blocking, best effort
    if (becomingApproved) {
      try {
        const project = await prisma.project.findUnique({
          where: { id },
          select: { jobTitle: true, supervisor: true },
        });
        const supervisorName = project?.supervisor?.trim() || "";
        if (supervisorName) {
          const [firstName, ...rest] = supervisorName.split(" ");
          const lastName = rest.join(" ");
          const pmEmployee = await prisma.employee.findFirst({
            where: {
              firstName: { equals: firstName, mode: "insensitive" },
              lastName: { equals: lastName, mode: "insensitive" },
              email: { not: null },
            },
            select: { firstName: true, lastName: true, email: true },
          });
          if (pmEmployee?.email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
            const changeOrderUrl = appUrl
              ? `${appUrl}/erp/projects/${id}/change-orders/${changeOrderId}`
              : null;
            const html = buildChangeOrderNotificationEmail({
              recipientName: `${pmEmployee.firstName} ${pmEmployee.lastName}`.trim(),
              projectTitle: project?.jobTitle ?? "",
              coTitle: updated.title,
              coStatus: updated.status,
              estimatedCost: centsToDollars(updated.estimatedCostCents),
              estimatedDays: updated.estimatedDays,
              description: updated.description,
              reason: updated.reason,
              requestedBy: updated.requestedBy,
              changeOrderUrl,
            });
            await sendEmail({
              to: pmEmployee.email,
              subject: `Change Order Approved: ${updated.title} — ${project?.jobTitle ?? ""}`,
              html,
            });
          }
        }
      } catch (emailErr) {
        console.error("approval notification email failed", emailErr);
      }
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH project change order", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, changeOrderId } = await ctx.params;
  const existing = await prisma.projectChangeOrder.findFirst({
    where: { id: changeOrderId, projectId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await prisma.projectChangeOrder.delete({ where: { id: changeOrderId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("DELETE project change order", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}