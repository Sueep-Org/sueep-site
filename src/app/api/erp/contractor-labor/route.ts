import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET /api/erp/contractor-labor
 * Mirrors GET /api/erp/labor's shape (success/data/hasMore, skip+take
 * pagination) and its "merge two tables into one feed" approach: a
 * contractor's work lives in ContractorAssignment (project/building level)
 * and ChangeOrderContractorAssignment (CO level) separately, same split as
 * Employee's LaborEntry vs ProjectChangeOrderLaborer. This is cost/role/date
 * work, not hour-by-hour logged time though, that's the real difference
 * from the Employee Labor tab it's modeled after, not just a naming swap.
 * Query params:
 *   - contractorId: Filter by contractor
 *   - projectId: Filter by project
 *   - startDate / endDate: Filter by assignment start date range (inclusive)
 *   - skip / take: Pagination, same convention as /api/erp/labor
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const contractorId = searchParams.get("contractorId");
    const projectId = searchParams.get("projectId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const skip = Number(searchParams.get("skip") ?? "0") || 0;
    const takeParam = searchParams.get("take");
    const take = takeParam ? Math.min(200, Math.max(1, Number(takeParam) || 0)) : null;

    let dateFilter: Prisma.DateTimeFilter | undefined;
    if (startDate || endDate) {
      dateFilter = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lt: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }

    const where: Prisma.ContractorAssignmentWhereInput = {};
    if (contractorId) where.contractorId = contractorId;
    if (projectId) where.projectId = projectId;
    if (dateFilter) where.startDate = dateFilter;

    const coWhere: Prisma.ChangeOrderContractorAssignmentWhereInput = {};
    if (contractorId) coWhere.contractorId = contractorId;
    if (projectId) coWhere.changeOrder = { projectId };
    if (dateFilter) coWhere.startDate = dateFilter;

    const [rows, coRows] = await Promise.all([
      prisma.contractorAssignment.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          role: true,
          startDate: true,
          endDate: true,
          assignedDate: true,
          costCents: true,
          taskDescription: true,
          createdAt: true,
          project: { select: { id: true, jobTitle: true } },
          building: { select: { id: true, name: true } },
        },
      }),
      prisma.changeOrderContractorAssignment.findMany({
        where: coWhere,
        select: {
          id: true,
          role: true,
          startDate: true,
          endDate: true,
          assignedDate: true,
          costCents: true,
          notes: true,
          createdAt: true,
          changeOrder: { select: { id: true, title: true, project: { select: { id: true, jobTitle: true } } } },
        },
      }),
    ]);

    const combined = [
      ...rows.map((r) => ({
        id: r.id,
        source: "PROJECT" as const,
        projectId: r.project?.id ?? null,
        projectTitle: r.project?.jobTitle ?? null,
        buildingName: r.building?.name ?? null,
        changeOrderTitle: null as string | null,
        role: r.role,
        // Falls back to assignedDate for older rows created before
        // startDate/endDate existed on this form.
        date: r.startDate ?? r.assignedDate,
        endDate: r.endDate,
        costCents: r.costCents,
        taskDescription: r.taskDescription,
        createdAt: r.createdAt,
      })),
      ...coRows.map((r) => ({
        id: r.id,
        source: "CHANGE_ORDER" as const,
        projectId: r.changeOrder.project.id,
        projectTitle: r.changeOrder.project.jobTitle,
        buildingName: null as string | null,
        changeOrderTitle: r.changeOrder.title,
        role: r.role,
        date: r.startDate ?? r.assignedDate,
        endDate: r.endDate,
        costCents: r.costCents,
        // ChangeOrderContractorAssignment has no taskDescription field, notes is its closest equivalent.
        taskDescription: r.notes,
        createdAt: r.createdAt,
      })),
    ].sort((a, b) => {
      const dateDiff = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
      if (dateDiff !== 0) return dateDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const totalCount = combined.length;
    const pageRows = take != null ? combined.slice(skip, skip + take) : combined.slice(skip);

    return NextResponse.json({
      success: true,
      hasMore: take != null && skip + pageRows.length < totalCount,
      data: pageRows.map((r) => ({
        id: r.id,
        source: r.source,
        projectId: r.projectId,
        projectTitle: r.projectTitle,
        buildingName: r.buildingName,
        changeOrderTitle: r.changeOrderTitle,
        role: r.role,
        date: r.date?.toISOString() ?? null,
        endDate: r.endDate?.toISOString() ?? null,
        costCents: r.costCents,
        taskDescription: r.taskDescription,
      })),
    });
  } catch (error) {
    console.error("Contractor labor GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch contractor labor" }, { status: 500 });
  }
}
