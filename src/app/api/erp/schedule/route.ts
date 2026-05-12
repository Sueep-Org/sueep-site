import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/erp/schedule
 * Returns projects and labor entries for schedule tracking.
 * Query params:
 *   - startDate: ISO string (default: 30 days ago)
 *   - endDate: ISO string (default: 90 days from now)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const now = new Date();
    const startDate = searchParams.get("startDate")
      ? new Date(searchParams.get("startDate")!)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = searchParams.get("endDate")
      ? new Date(searchParams.get("endDate")!)
      : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [projects, laborEntries] = await Promise.all([
      prisma.project.findMany({
        where: {
          status: {
            not: "ARCHIVED",
          },
        },
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
          supervisor: true,
        },
      }),
      prisma.laborEntry.findMany({
        where: {
          workDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
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

    return NextResponse.json({
      success: true,
      data: {
        projects: projects.map((p) => ({
          id: p.id,
          jobTitle: p.jobTitle,
          segment: p.segment,
          status: p.status,
          projectDate: p.projectDate?.toISOString() ?? null,
          projectEndDate: p.projectEndDate?.toISOString() ?? null,
          createdAt: p.createdAt.toISOString(),
          percentDone: p.percentDone,
          supervisor: p.supervisor,
        })),
        laborEntries: laborEntries.map((le) => ({
          id: le.id,
          projectId: le.projectId,
          workDate: le.workDate.toISOString(),
          workerName: le.workerName,
          role: le.role,
          hours: le.hours,
          hourlyRateCents: le.hourlyRateCents,
          taskDescription: le.taskDescription,
        })),
      },
    });
  } catch (error) {
    console.error("Schedule API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch schedule data" },
      { status: 500 }
    );
  }
}
