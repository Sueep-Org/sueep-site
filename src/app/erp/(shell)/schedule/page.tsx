import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import type { ScheduleProject } from "@/lib/erp/schedule";
import { SchedulePlanner } from "./SchedulePlanner";
import { LaborTracker } from "./LaborTracker";
import { WorkerTimeline } from "./WorkerTimeline";
import { AddLaborEntryForm } from "./AddLaborEntryForm";

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
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Schedule & Labor Tracking</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage project timelines, worker schedules, and labor hours.
          </p>
        </div>
        <AddLaborEntryForm projectId="new" projectTitle="Quick Log" />
      </div>

      {/* Project Schedule */}
      <SchedulePlanner projects={projects} />

      {/* Labor Tracking */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Labor Tracking</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Track worker hours, costs, and project labor allocation.
          </p>
        </div>
        <LaborTracker laborEntries={laborEntries} projects={projectsForTracking} />
      </section>

      {/* Worker Timeline */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Worker Timeline</h2>
          <p className="mt-1 text-xs text-zinc-400">
            View worker availability and project assignments over the next 14 days.
          </p>
        </div>
        <WorkerTimeline laborEntries={laborEntries} projects={projectsForTracking} daysToShow={14} />
      </section>
    </div>
  );
}
