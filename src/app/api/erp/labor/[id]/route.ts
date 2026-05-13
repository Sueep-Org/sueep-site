import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/erp/labor/[id]
 * Get a specific labor entry
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const entry = await prisma.laborEntry.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true,
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

    if (!entry) {
      return NextResponse.json(
        { success: false, error: "Labor entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: entry.id,
        projectId: entry.projectId,
        projectTitle: entry.project.jobTitle,
        workDate: entry.workDate.toISOString(),
        workerName: entry.workerName,
        role: entry.role,
        hours: entry.hours,
        hourlyRateCents: entry.hourlyRateCents,
        taskDescription: entry.taskDescription,
        locationLatitude: entry.locationLatitude,
        locationLongitude: entry.locationLongitude,
        locationAccuracy: entry.locationAccuracy,
        lastLocationAt: entry.lastLocationAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Labor GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch labor entry" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/erp/labor/[id]
 * Update a labor entry
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();

    const entry = await prisma.laborEntry.update({
      where: { id },
      data: {
        ...(body.workDate && { workDate: new Date(body.workDate) }),
        ...(body.workerName && { workerName: body.workerName }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.hours && { hours: parseFloat(body.hours) }),
        ...(body.hourlyRateCents && { hourlyRateCents: parseInt(body.hourlyRateCents) }),
        ...(body.taskDescription !== undefined && { taskDescription: body.taskDescription }),
        ...(body.locationLatitude !== undefined && { 
          locationLatitude: body.locationLatitude ? parseFloat(body.locationLatitude) : null 
        }),
        ...(body.locationLongitude !== undefined && { 
          locationLongitude: body.locationLongitude ? parseFloat(body.locationLongitude) : null 
        }),
        ...(body.locationAccuracy !== undefined && { 
          locationAccuracy: body.locationAccuracy ? parseFloat(body.locationAccuracy) : null 
        }),
        ...(body.locationLatitude && body.locationLongitude && { 
          lastLocationAt: new Date() 
        }),
      },
      select: {
        id: true,
        projectId: true,
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
        id: entry.id,
        projectId: entry.projectId,
        projectTitle: entry.project.jobTitle,
        workDate: entry.workDate.toISOString(),
        workerName: entry.workerName,
        role: entry.role,
        hours: entry.hours,
        hourlyRateCents: entry.hourlyRateCents,
        taskDescription: entry.taskDescription,
        locationLatitude: entry.locationLatitude,
        locationLongitude: entry.locationLongitude,
        locationAccuracy: entry.locationAccuracy,
        lastLocationAt: entry.lastLocationAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("Labor PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update labor entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/erp/labor/[id]
 * Delete a labor entry
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.laborEntry.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Labor entry deleted",
    });
  } catch (error) {
    console.error("Labor DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete labor entry" },
      { status: 500 }
    );
  }
}
