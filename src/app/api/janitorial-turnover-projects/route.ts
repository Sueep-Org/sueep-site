import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { createProjectFromPayload } from "@/lib/erp/createProject";
import { notifyJanitorialTurnoverCreated } from "@/lib/erp/notifyJanitorialTurnover";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const unitScopes = Array.isArray(body.unitScopes) ? (body.unitScopes as Record<string, unknown>[]) : [];
  if (unitScopes.some((u) => !u.startDate)) {
    return NextResponse.json({ error: "startDate is required for every unit" }, { status: 400 });
  }

  const cfg = parseHubSpotPipelineStageMap();
  const notifyEmployeeIds = Array.isArray(body.notifyEmployeeIds) ? (body.notifyEmployeeIds as string[]) : [];
  const docusealSubmissionId = typeof body.docusealSubmissionId === "number" ? body.docusealSubmissionId : null;
  const pmEmail = typeof body.pmEmail === "string" ? body.pmEmail.trim() : null;

  const payload = {
    ...body,
    segment: "JANITORIAL_TURNOVER_REQUESTS",
    ...(cfg?.janitorial.pipelineId ? { hubspotPipelineId: cfg.janitorial.pipelineId } : {}),
  };

  try {
    const result = await createProjectFromPayload(payload);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    if ("turnoverRequests" in result && result.turnoverRequests && result.building) {
      await notifyJanitorialTurnoverCreated({
        body: payload,
        building: result.building,
        requests: result.turnoverRequests,
        notifyEmployeeIds,
      });

      // Create a signed contract record for each project (one per unit)
      if (docusealSubmissionId) {
        const projectIds = result.projects.map((p) => p.id);
        for (const [i, pid] of projectIds.entries()) {
          try {
            await prisma.projectContract.create({
              data: {
                projectId: pid,
                signingStatus: "SIGNED",
                customerEmail: pmEmail,
                // Only attach the submission ID to the first project to keep the unique constraint
                docusealSubmissionId: i === 0 ? docusealSubmissionId : null,
                signedAt: new Date(),
              },
            });
          } catch (err) {
            console.error("Failed to create ProjectContract (non-fatal):", err);
          }
        }
      }

      const projectIds = result.projects.map((p) => p.id);
      return NextResponse.json({
        projectId: projectIds[0] ?? null,
        projectIds,
        buildingId: result.building.id,
        ids: result.turnoverRequests.map((request) => request.id),
      });
    }
    return NextResponse.json({ id: result.project.id });
  } catch (e) {
    console.error("POST /api/janitorial-turnover-projects", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
