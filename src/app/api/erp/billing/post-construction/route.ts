import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: "start and end query params required (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  const start = new Date(`${startParam}T00:00:00Z`);
  const end = new Date(`${endParam}T23:59:59.999Z`);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const cfg = parseHubSpotPipelineStageMap();
  const postConPipelineId = cfg?.postConstruction.pipelineId ?? null;

  const items = await prisma.projectSOVItem.findMany({
    where: {
      completed: true,
      updatedAt: { gte: start, lte: end },
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

  // Fetch completed change orders in the same date range
  const changeOrders = await prisma.projectChangeOrder.findMany({
    where: {
      status: "BILLING",
      completedAt: { gte: start, lte: end },
      ...(postConPipelineId ? { project: { hubspotPipelineId: postConPipelineId } } : {}),
    },
    select: {
      id: true,
      title: true,
      contractValueCents: true,
      billingStatus: true,
      completedAt: true,
      projectId: true,
      project: { select: { id: true, jobTitle: true, billingStatus: true } },
    },
    orderBy: { completedAt: "asc" },
  });

  type SOVItemRow = { id: string; description: string; scheduledValueCents: number; billingStatus: string };
  type CORow = { id: string; projectId: string; title: string; contractValueCents: number; billingStatus: string; completedAt: string };

  type ProjectRow = {
    projectId: string;
    jobTitle: string;
    projectBillingStatus: string | null;
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
        projectBillingStatus: project.billingStatus,
        items: [],
        changeOrders: [],
      });
    }
    projectMap.get(project.id)!.items.push({
      id: item.id,
      description: item.description,
      scheduledValueCents: item.scheduledValueCents,
      billingStatus: item.billingStatus,
    });
  }

  for (const co of changeOrders) {
    const project = co.project;
    if (!projectMap.has(project.id)) {
      projectMap.set(project.id, {
        projectId: project.id,
        jobTitle: project.jobTitle,
        projectBillingStatus: project.billingStatus,
        items: [],
        changeOrders: [],
      });
    }
    projectMap.get(project.id)!.changeOrders.push({
      id: co.id,
      projectId: co.projectId,
      title: co.title,
      contractValueCents: co.contractValueCents ?? 0,
      billingStatus: co.billingStatus ?? "NOT_BILLED",
      completedAt: co.completedAt!.toISOString(),
    });
  }

  const rows = Array.from(projectMap.values()).sort((a, b) =>
    a.jobTitle.localeCompare(b.jobTitle),
  );

  return NextResponse.json({ start: startParam, end: endParam, rows });
}
