import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createProjectFromPayload } from "@/lib/erp/createProject";
import { sendEmail, buildRealEstateConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.projectDate !== "string" || !body.projectDate) {
    return NextResponse.json({ error: "projectDate is required" }, { status: 400 });
  }

  const payload = {
    ...body,
    segment: "REAL_ESTATE",
  };

  try {
    const result = await createProjectFromPayload(payload);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const projectId = "project" in result ? result.project?.id ?? null : result.projects?.[0]?.id ?? null;

    // Store the DocuSeal submission as a signed contract record
    const submissionId = typeof body.docusealSubmissionId === "number" ? body.docusealSubmissionId : null;
    const agentEmailStr = typeof body.agentEmail === "string" ? body.agentEmail.trim() : null;
    if (projectId && submissionId) {
      try {
        await prisma.projectContract.create({
          data: {
            projectId,
            signingStatus: "SIGNED",
            customerEmail: agentEmailStr,
            docusealSubmissionId: submissionId,
            signedAt: new Date(),
          },
        });
      } catch (contractErr) {
        console.error("Failed to create ProjectContract (non-fatal):", contractErr);
      }
    }

    // Send confirmation email to the agent (non-fatal)
    const agentEmail = typeof body.agentEmail === "string" ? body.agentEmail.trim() : "";
    const agentName = typeof body.agentName === "string" ? body.agentName.trim() : "there";
    if (agentEmail) {
      const services: string[] = [];
      if (body.fullClean) services.push("Full clean");
      if (body.fullPaint) services.push("Full paint");
      if (body.touchUpPaint) services.push("Touch-up paint");
      if (body.carpetCleaning) services.push("Carpet cleaning");
      if (body.materialsAdditional) services.push("Additional materials");

      try {
        await sendEmail({
          to: agentEmail,
          subject: "Sueep — Your cleaning request was received",
          html: buildRealEstateConfirmationEmail({
            agentName,
            propertyAddress: typeof body.buildingAddress === "string" ? body.buildingAddress : "",
            propertyType: typeof body.propertyType === "string" ? body.propertyType : null,
            bedrooms: typeof body.bedrooms !== "undefined" ? String(body.bedrooms) : null,
            bathrooms: typeof body.bathrooms !== "undefined" ? String(body.bathrooms) : null,
            services,
            cleanDate: typeof body.projectDate === "string" ? body.projectDate : null,
            moveInDate: typeof body.moveInDate === "string" ? body.moveInDate : null,
            contractValue: typeof body.contractValue === "string" ? body.contractValue : null,
          }),
        });
      } catch (emailErr) {
        console.error("Real estate confirmation email failed (non-fatal):", emailErr);
      }
    }

    return NextResponse.json({ id: projectId, projectId });
  } catch (e) {
    console.error("POST /api/real-estate-projects", e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
