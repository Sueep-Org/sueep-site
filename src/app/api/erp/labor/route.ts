import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * GET /api/erp/labor
 * Get all labor entries with optional filtering
 * Query params:
 *   - projectId: Filter by project
 *   - workDate: Filter by work date
 *   - workerName: Filter by worker name
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get("projectId");
    const workDate = searchParams.get("workDate");
    const workerName = searchParams.get("workerName");

    const where: Prisma.LaborEntryWhereInput = {};
    if (projectId) where.projectId = projectId;
    if (workDate) {
      const date = new Date(workDate);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.workDate = {
        gte: date,
        lt: nextDay,
      };
    }
    if (workerName) where.workerName = { contains: workerName, mode: "insensitive" };

    const entries = await prisma.laborEntry.findMany({
      where,
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
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      success: true,
      data: entries.map((e) => ({
        id: e.id,
        projectId: e.projectId,
        employeeId: e.employeeId,
        projectTitle: e.project.jobTitle,
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
