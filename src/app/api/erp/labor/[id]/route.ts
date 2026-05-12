import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/erp/labor/[id]
 * Get a specific labor entry
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const entry = await prisma.laborEntry.findUnique({
      where: { id: params.id },
      include: {
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
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const entry = await prisma.laborEntry.update({
      where: { id: params.id },
      data: {
        ...(body.workDate && { workDate: new Date(body.workDate) }),
        ...(body.workerName && { workerName: body.workerName }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.hours && { hours: parseFloat(body.hours) }),
        ...(body.hourlyRateCents && { hourlyRateCents: parseInt(body.hourlyRateCents) }),
        ...(body.taskDescription !== undefined && { taskDescription: body.taskDescription }),
      },
      include: {
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
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.laborEntry.delete({
      where: { id: params.id },
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
