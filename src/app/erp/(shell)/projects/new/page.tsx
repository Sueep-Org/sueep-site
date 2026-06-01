import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewProjectPage() {
  const cfg = parseHubSpotPipelineStageMap();
  const janitorialSegments = cfg?.janitorial.pipelineId
    ? ["JANITORIAL_TURNOVER_REQUESTS"]
    : ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];

  const postConstructionFilter = cfg?.postConstruction.pipelineId
    ? { hubspotPipelineId: cfg.postConstruction.pipelineId }
    : {};

  const [buildings, allProjects, employees] = await Promise.all([
    prisma.building.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true },
    }),
    prisma.project.findMany({
      where: postConstructionFilter,
      orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
      select: { id: true, jobTitle: true },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);
  const scheduleBuildings = await prisma.project.findMany({
    where: {
      status: { notIn: ["COMPLETE", "ARCHIVED"] },
      OR: [
        { segment: { in: janitorialSegments } },
        ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
      ],
    },
    orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      jobTitle: true,
      description: true,
      supervisor: true,
    },
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-0">
      <div>
        <Link href="/erp/projects" className="text-xs text-pink-600 hover:underline">
          ← Projects
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">New project</h1>
            <p className="mt-1 text-sm text-gray-500">Match fields from your PM spreadsheet; more modules can layer on later.</p>
          </div>
          <Link
            href="/janitorial-turnover"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md border border-pink-200 bg-white px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-50 sm:w-auto"
          >
            Open external janitorial link
          </Link>
        </div>
      </div>
      <NewProjectForm
        initialBuildings={buildings}
        initialScheduleBuildings={scheduleBuildings}
        janitorialPipelineId={cfg?.janitorial.pipelineId || null}
        allProjects={allProjects}
        employees={employees}
      />
    </div>
  );
}
