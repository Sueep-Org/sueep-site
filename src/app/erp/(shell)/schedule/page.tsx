import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import type { ScheduleProject } from "@/lib/erp/schedule";
import { SchedulePlanner } from "./SchedulePlanner";
import { LaborTracker } from "./LaborTracker";
import { WorkerTimeline } from "./WorkerTimeline";
import { AddLaborEntryForm } from "./AddLaborEntryForm";
import { LocationTracker } from "./LocationTracker";
import { CollapsibleSection } from "./CollapsibleSection";

export const metadata: Metadata = {
  title: "Schedule",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SchedulePage() {
  const [projectRows, laborEntryRows] = await Promise.all([
    prisma.project.findMany({
      orderBy: [{ projectDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        jobTitle: true,
        segment: true,
        status: true,
        projectDate: true,
        projectEndDate: true,
        createdAt: true,
        percentDone: true,
      },
    }),
    prisma.laborEntry.findMany({
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        projectId: true,
        workDate: true,
        workerName: true,
        role: true,
        hours: true,
        hourlyRateCents: true,
        taskDescription: true,
      },
    }),
  ]);

  const projects: ScheduleProject[] = projectRows.map((r) => ({
    id: r.id,
    jobTitle: r.jobTitle,
    segment: r.segment,
    status: r.status,
    projectDate: r.projectDate ? r.projectDate.toISOString() : null,
    projectEndDate: r.projectEndDate ? r.projectEndDate.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    percentDone: r.percentDone,
  }));

  const laborEntries = laborEntryRows.map((le) => ({
    id: le.id,
    projectId: le.projectId,
    workDate: le.workDate.toISOString(),
    workerName: le.workerName,
    role: le.role,
    hours: le.hours,
    hourlyRateCents: le.hourlyRateCents,
    taskDescription: le.taskDescription,
  }));

  const projectsForTracking = projectRows.map((p) => ({
    id: p.id,
    jobTitle: p.jobTitle,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">Schedule & Labor</h1>
          <p className="mt-1 text-sm text-gray-500">Project timelines, worker schedules, and labor hours.</p>
        </div>
        <div className="flex items-center gap-3">
          <LocationTracker autoStart={true} />
          <AddLaborEntryForm projectId="new" projectTitle="Quick Log" allProjects={projectsForTracking} />
        </div>
      </div>

      <hr className="border-pink-200" />

      {/* Project Schedule */}
      <SchedulePlanner projects={projects} />

      <CollapsibleSection title="Labor Tracking" description="Worker hours, costs, and project labor allocation.">
        <LaborTracker laborEntries={laborEntries} projects={projectsForTracking} />
      </CollapsibleSection>

      <CollapsibleSection title="Worker Timeline" description="Worker assignments over the next 14 days.">
        <WorkerTimeline laborEntries={laborEntries} projects={projectsForTracking} daysToShow={14} />
      </CollapsibleSection>
    </div>
  );
}
