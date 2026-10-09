import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { normalizeBillingStatus } from "@/lib/erp/billingStatus";
import { coiWarningLabel, projectCoiStatus } from "@/lib/erp/projectCois";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const q = searchParams.get("q")?.trim() || "";

  if (!q && (!startParam || !endParam)) {
    return NextResponse.json(
      { error: "start and end query params required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  let start: Date | null = null;
  let end: Date | null = null;
  if (!q) {
    start = new Date(`${startParam}T00:00:00Z`);
    end = new Date(`${endParam}T23:59:59.999Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
  }

  const cfg = parseHubSpotPipelineStageMap();
  const postConPipelineId = cfg?.postConstruction.pipelineId ?? null;

  const items = await prisma.projectSOVItem.findMany({
    where: {
      completed: true,
      // Searching bypasses the date range entirely (that's the point of a
      // search), it doesn't bypass "is this actually billing-eligible."
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { sov: { project: { jobTitle: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : { updatedAt: { gte: start!, lte: end! } }),
      ...(postConPipelineId
        ? { sov: { project: { hubspotPipelineId: postConPipelineId } } }
        : {}),
    },
    include: {
      sov: {
        select: {
          project: {
            select: {
              id: true,
              jobTitle: true,
              billingStatus: true,
              contractValueCents: true,
            },
          },
        },
      },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // Fetch completed change orders in the same date range (or, when searching,
  // across all time, see the items query above for why).
  // Use completedAt when set; fall back to updatedAt for older records where completedAt was never populated.
  const changeOrders = await prisma.projectChangeOrder.findMany({
    where: {
      status: { in: ["BILLING", "COMPLETED"] },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { project: { jobTitle: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {
            OR: [
              { completedAt: { gte: start!, lte: end! } },
              { completedAt: null, updatedAt: { gte: start!, lte: end! } },
            ],
          }),
      ...(postConPipelineId ? { project: { hubspotPipelineId: postConPipelineId } } : {}),
    },
    select: {
      id: true,
      title: true,
      contractValueCents: true,
      billingStatus: true,
      completedAt: true,
      updatedAt: true,
      projectId: true,
      project: { select: { id: true, jobTitle: true, billingStatus: true } },
    },
    orderBy: { completedAt: "asc" },
  });

  // Invoices linked to each SOV item / change order (HubSpotSovInvoice).
  const linkedInvoices = await prisma.hubSpotSovInvoice.findMany({
    where: { OR: [{ sovItemId: { in: items.map((i) => i.id) } }, { changeOrderId: { in: changeOrders.map((c) => c.id) } }] },
    orderBy: { invoiceDate: "desc" },
  });
  type InvoiceChip = {
    id: string;
    invoiceNumber: string | null;
    status: string | null;
    dueDate: string | null;
    paidDate: string | null;
    amountCents: number;
    viewUrl: string | null;
  };
  const invoicesFor = (key: "sovItemId" | "changeOrderId", id: string): InvoiceChip[] =>
    linkedInvoices
      .filter((r) => r[key] === id)
      .map((r) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        status: r.status,
        dueDate: r.dueDate?.toISOString() ?? null,
        paidDate: r.paidDate?.toISOString() ?? null,
        amountCents: r.amountCents,
        viewUrl: r.viewUrl,
      }));

  type SOVItemRow = { id: string; description: string; scheduledValueCents: number; billingStatus: string; invoices: InvoiceChip[] };
  type CORow = { id: string; projectId: string; title: string; contractValueCents: number; billingStatus: string; completedAt: string; invoices: InvoiceChip[] };

  type ProjectRow = {
    projectId: string;
    jobTitle: string;
    projectBillingStatus: string | null;
    // Only meaningful when items/changeOrders are both empty — the
    // whole-project fallback amount for a project with no SOV/CO detail.
    contractValueCents: number | null;
    items: SOVItemRow[];
    changeOrders: CORow[];
  };

  const projectMap = new Map<string, ProjectRow>();

  for (const item of items) {
    const project = item.sov.project;
    if (!projectMap.has(project.id)) {
      projectMap.set(project.id, {
        projectId: project.id,
        jobTitle: project.jobTitle,
        projectBillingStatus: normalizeBillingStatus(project.billingStatus),
        contractValueCents: null,
        items: [],
        changeOrders: [],
      });
    }
    projectMap.get(project.id)!.items.push({
      id: item.id,
      description: item.description,
      scheduledValueCents: item.scheduledValueCents,
      billingStatus: item.billingStatus,
      invoices: invoicesFor("sovItemId", item.id),
    });
  }

  for (const co of changeOrders) {
    const project = co.project;
    if (!projectMap.has(project.id)) {
      projectMap.set(project.id, {
        projectId: project.id,
        jobTitle: project.jobTitle,
        projectBillingStatus: normalizeBillingStatus(project.billingStatus),
        contractValueCents: null,
        items: [],
        changeOrders: [],
      });
    }
    projectMap.get(project.id)!.changeOrders.push({
      id: co.id,
      projectId: co.projectId,
      title: co.title,
      contractValueCents: co.contractValueCents ?? 0,
      billingStatus: normalizeBillingStatus(co.billingStatus),
      completedAt: (co.completedAt ?? co.updatedAt).toISOString(),
      invoices: invoicesFor("changeOrderId", co.id),
    });
  }

  // A completed post-construction project with no SOV items and no billable
  // change order is otherwise invisible here (there's no item/CO to hang a
  // row on), even though it may still have a real contract value waiting to
  // be billed. Fall back to a single whole-project row using the project's
  // own fields — same "no line-item detail, fall back to the project
  // itself" pattern the janitorial billing tab already uses for units with
  // no turnover request (see buildUnitRow in the janitorial billing route).
  const wholeProjects = await prisma.project.findMany({
    where: {
      status: "COMPLETE",
      ...(postConPipelineId ? { hubspotPipelineId: postConPipelineId } : {}),
      ...(q
        ? { jobTitle: { contains: q, mode: "insensitive" } }
        : {
            OR: [
              { projectEndDate: { gte: start!, lte: end! } },
              { projectEndDate: null, updatedAt: { gte: start!, lte: end! } },
            ],
          }),
    },
    select: { id: true, jobTitle: true, billingStatus: true, contractValueCents: true },
  });

  for (const project of wholeProjects) {
    // Already has real SOV items/COs from above — those are the source of
    // truth for this project, no fallback row needed alongside them.
    if (projectMap.has(project.id)) continue;
    projectMap.set(project.id, {
      projectId: project.id,
      jobTitle: project.jobTitle,
      projectBillingStatus: normalizeBillingStatus(project.billingStatus),
      contractValueCents: project.contractValueCents,
      items: [],
      changeOrders: [],
    });
  }

  // Flag projects whose current COI is expired or expiring, since the GC
  // may hold payment over it.
  const projectCois = await prisma.projectCoi.findMany({
    where: { projectId: { in: [...projectMap.keys()] } },
    select: { id: true, projectId: true, holderId: true, holderName: true, issuedOn: true, createdAt: true, expiresAt: true },
  });
  const coisByProject = new Map<string, typeof projectCois>();
  for (const c of projectCois) coisByProject.set(c.projectId, [...(coisByProject.get(c.projectId) ?? []), c]);

  const rows = Array.from(projectMap.values())
    .sort((a, b) => a.jobTitle.localeCompare(b.jobTitle))
    .map((row) => {
      const status = projectCoiStatus(coisByProject.get(row.projectId) ?? []);
      const label = coiWarningLabel(status);
      return { ...row, coiWarning: label && status ? { label, expired: status.status === "EXPIRED", holderName: status.holderName } : null };
    });

  return NextResponse.json({ start: startParam ?? "", end: endParam ?? "", rows });
}
