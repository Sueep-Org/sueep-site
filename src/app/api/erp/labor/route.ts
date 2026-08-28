import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET /api/erp/labor
 * Get all labor entries with optional filtering. Merges plain project labor
 * (LaborEntry) with change-order labor (ProjectChangeOrderLaborer) into one
 * feed, since payroll counts both toward an employee's hours/pay (see
 * /api/erp/payroll) but they live in separate tables.
 * Query params:
 *   - projectId: Filter by project
 *   - employeeId: Filter by employee
 *   - workDate: Filter by a single work date
 *   - startDate / endDate: Filter by a work date range (inclusive)
 *   - workerName: Filter by worker name
 *   - skip / take: Pagination — when `take` is omitted, all matching rows are returned
 *     (existing behavior); when provided, one extra row is fetched to compute `hasMore`.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("projectId");
    const employeeId = searchParams.get("employeeId");
    const workDate = searchParams.get("workDate");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const workerName = searchParams.get("workerName");
    const skip = Number(searchParams.get("skip") ?? "0") || 0;
    const takeParam = searchParams.get("take");
    const take = takeParam ? Math.min(200, Math.max(1, Number(takeParam) || 0)) : null;

    let workDateFilter: Prisma.DateTimeFilter | undefined;
    if (workDate) {
      const date = new Date(workDate);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      workDateFilter = { gte: date, lt: nextDay };
    } else if (startDate || endDate) {
      workDateFilter = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lt: new Date(new Date(endDate).getTime() + 24 * 60 * 60 * 1000) } : {}),
      };
    }

    const where: Prisma.LaborEntryWhereInput = {};
    if (projectId) where.projectId = projectId;
    if (employeeId) where.employeeId = employeeId;
    if (workerName) where.workerName = { contains: workerName, mode: "insensitive" };
    if (workDateFilter) where.workDate = workDateFilter;

    const changeOrderWhere: Prisma.ProjectChangeOrderLaborerWhereInput = {};
    if (projectId) changeOrderWhere.changeOrder = { projectId };
    if (employeeId) changeOrderWhere.employeeId = employeeId;
    if (workerName) changeOrderWhere.name = { contains: workerName, mode: "insensitive" };
    if (workDateFilter) changeOrderWhere.workDate = workDateFilter;

    const [entries, changeOrderEntries] = await Promise.all([
      prisma.laborEntry.findMany({
        where,
        select: {
          id: true,
          projectId: true,
          employeeId: true,
          workDate: true,
          createdAt: true,
          workerName: true,
          role: true,
          hours: true,
          hourlyRateCents: true,
          taskDescription: true,
          locationLatitude: true,
          locationLongitude: true,
          locationAccuracy: true,
          lastLocationAt: true,
          project: {
            select: {
              id: true,
              jobTitle: true,
            },
          },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.projectChangeOrderLaborer.findMany({
        where: changeOrderWhere,
        select: {
          id: true,
          employeeId: true,
          workDate: true,
          createdAt: true,
          name: true,
          role: true,
          hours: true,
          hourlyRateCents: true,
          taskDescription: true,
          changeOrder: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, jobTitle: true } },
            },
          },
        },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const combined = [
      ...entries.map((e) => ({
        id: e.id,
        source: "PROJECT" as const,
        projectId: e.projectId,
        employeeId: e.employeeId,
        projectTitle: e.project.jobTitle,
        workDate: e.workDate,
        createdAt: e.createdAt,
        workerName: e.workerName,
        role: e.role,
        hours: e.hours,
        hourlyRateCents: e.hourlyRateCents,
        taskDescription: e.taskDescription,
        locationLatitude: e.locationLatitude,
        locationLongitude: e.locationLongitude,
        locationAccuracy: e.locationAccuracy,
        lastLocationAt: e.lastLocationAt,
        changeOrderTitle: null as string | null,
      })),
      ...changeOrderEntries.map((e) => ({
        id: e.id,
        source: "CHANGE_ORDER" as const,
        projectId: e.changeOrder.project.id,
        employeeId: e.employeeId,
        projectTitle: e.changeOrder.project.jobTitle,
        workDate: e.workDate,
        createdAt: e.createdAt,
        workerName: e.name,
        role: e.role,
        hours: e.hours,
        hourlyRateCents: e.hourlyRateCents,
        taskDescription: e.taskDescription,
        locationLatitude: null as number | null,
        locationLongitude: null as number | null,
        locationAccuracy: null as number | null,
        lastLocationAt: null as Date | null,
        changeOrderTitle: e.changeOrder.title,
      })),
    ].sort((a, b) => {
      const workDateDiff = b.workDate.getTime() - a.workDate.getTime();
      if (workDateDiff !== 0) return workDateDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const hasMore = take != null && combined.length > skip + take;
    const pageEntries = take != null ? combined.slice(skip, skip + take) : combined.slice(skip);

    return NextResponse.json({
      success: true,
      hasMore,
      data: pageEntries.map((e) => ({
        id: e.id,
        source: e.source,
        projectId: e.projectId,
        employeeId: e.employeeId,
        projectTitle: e.projectTitle,
        changeOrderTitle: e.changeOrderTitle,
        workDate: e.workDate.toISOString(),
        workerName: e.workerName,
        role: e.role,
        hours: e.hours,
        hourlyRateCents: e.hourlyRateCents,
        taskDescription: e.taskDescription,
        locationLatitude: e.locationLatitude,
        locationLongitude: e.locationLongitude,
        locationAccuracy: e.locationAccuracy,
        lastLocationAt: e.lastLocationAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Labor GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch labor entries" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/erp/labor
 * Create a new labor entry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      projectId, 
      employeeId,
      workDate, 
      workerName, 
      role, 
      hours, 
      hourlyRateCents, 
      taskDescription,
      locationLatitude,
      locationLongitude,
      locationAccuracy,
    } = body;

    if (!projectId || !workDate || !workerName || !hours) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    let employeeName = workerName;
    let employeeRole = role || null;
    let employeeRateCents = parseInt(hourlyRateCents) || 0;
    let linkedEmployeeId: string | undefined;
    if (employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: String(employeeId) },
        select: { id: true, firstName: true, lastName: true, role: true, hourlyPayCents: true },
      });
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 }
        );
      }
      linkedEmployeeId = employee.id;
      employeeName = `${employee.firstName} ${employee.lastName}`.trim() || workerName;
      employeeRole = employeeRole || employee.role || null;
      employeeRateCents = employee.hourlyPayCents ?? employeeRateCents;
    }

    const laborEntry = await prisma.laborEntry.create({
      data: {
        projectId,
        employeeId: linkedEmployeeId,
        workDate: new Date(workDate),
        workerName: employeeName,
        role: employeeRole,
        hours: parseFloat(hours),
        hourlyRateCents: employeeRateCents,
        taskDescription: taskDescription || null,
        locationLatitude: locationLatitude ? parseFloat(locationLatitude) : null,
        locationLongitude: locationLongitude ? parseFloat(locationLongitude) : null,
        locationAccuracy: locationAccuracy ? parseFloat(locationAccuracy) : null,
        lastLocationAt: locationLatitude && locationLongitude ? new Date() : null,
      },
      select: {
        id: true,
        projectId: true,
        employeeId: true,
        workDate: true,
        workerName: true,
        role: true,
        hours: true,
        hourlyRateCents: true,
        taskDescription: true,
        locationLatitude: true,
        locationLongitude: true,
        locationAccuracy: true,
        lastLocationAt: true,
        project: {
          select: {
            id: true,
            jobTitle: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: laborEntry.id,
        projectId: laborEntry.projectId,
        employeeId: laborEntry.employeeId,
        projectTitle: laborEntry.project.jobTitle,
        workDate: laborEntry.workDate.toISOString(),
        workerName: laborEntry.workerName,
        role: laborEntry.role,
        hours: laborEntry.hours,
        hourlyRateCents: laborEntry.hourlyRateCents,
        taskDescription: laborEntry.taskDescription,
        locationLatitude: laborEntry.locationLatitude,
        locationLongitude: laborEntry.locationLongitude,
        locationAccuracy: laborEntry.locationAccuracy,
      },
    });
  } catch (error) {
    console.error("Labor POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create labor entry" },
      { status: 500 }
    );
  }
}
