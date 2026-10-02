import { prisma } from "@/lib/prisma";
import { COI_WATCH_PROJECT_WHERE, projectCoiStatus, type ProjectCoiStatus } from "./projectCois";

export type CoiAlert = { projectId: string; jobTitle: string; status: ProjectCoiStatus };

/** Unpaid projects whose current COI is expired or expires within 30 days, most urgent first. */
export async function loadCoiAlerts(): Promise<CoiAlert[]> {
  const projects = await prisma.project.findMany({
    where: { ...COI_WATCH_PROJECT_WHERE, cois: { some: {} } },
    select: {
      id: true,
      jobTitle: true,
      cois: { select: { id: true, holderId: true, holderName: true, issuedOn: true, createdAt: true, expiresAt: true } },
    },
  });
  const alerts: CoiAlert[] = [];
  for (const p of projects) {
    const status = projectCoiStatus(p.cois);
    if (status && status.status !== "CURRENT") alerts.push({ projectId: p.id, jobTitle: p.jobTitle, status });
  }
  return alerts.sort((a, b) => a.status.daysLeft - b.status.daysLeft);
}
