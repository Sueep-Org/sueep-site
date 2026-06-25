import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, buildProjectRequestEmail, buildProjectRequestConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

type Body = {
  type: "change-order" | "sov-schedule";
  projectId: string;
  requesterName: string;
  requesterEmail: string;
  // CO fields
  coTitle?: string;
  coDescription?: string;
  // SOV fields
  sovItemId?: string;
  desiredDate?: string;
  comments?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, projectId, requesterEmail, requesterName } = body;
  if (!type || !projectId || !requesterEmail?.trim() || !requesterName?.trim()) {
    return NextResponse.json({ error: "type, projectId, requesterName and requesterEmail are required" }, { status: 400 });
  }
  if (type === "change-order" && !body.coTitle?.trim()) {
    return NextResponse.json({ error: "coTitle is required for change order requests" }, { status: 400 });
  }
  if (type === "sov-schedule" && !body.sovItemId) {
    return NextResponse.json({ error: "sovItemId is required for SOV scheduling" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      jobTitle: true,
      supervisor: true,
      supervisorUser: { select: { email: true } },
    },
  });

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Create a change order record when type is change-order
  let changeOrderId: string | null = null;
  if (type === "change-order") {
    const co = await prisma.projectChangeOrder.create({
      data: {
        projectId,
        title: body.coTitle!.trim(),
        description: body.coDescription?.trim() || null,
        requestedBy: `${requesterName.trim()} <${requesterEmail.trim()}>`,
        status: "SUBMITTED",
        requestedDate: new Date(),
      },
      select: { id: true },
    });
    changeOrderId = co.id;
  }

  // Resolve SOV item description if needed
  let sovDescription: string | undefined;
  if (type === "sov-schedule" && body.sovItemId) {
    const sovItem = await prisma.projectSOVItem.findFirst({
      where: { id: body.sovItemId, sov: { projectId } },
      select: { description: true },
    });
    if (!sovItem) return NextResponse.json({ error: "SOV item not found" }, { status: 404 });
    sovDescription = sovItem.description;
  }

  // Build notification recipients
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const projectUrl = appUrl
    ? changeOrderId
      ? `${appUrl}/erp/projects/${project.id}/change-orders/${changeOrderId}`
      : `${appUrl}/erp/projects/${project.id}`
    : null;

  const recipients: string[] = [];

  // Supervisor (ERP user linked to the project)
  if (project.supervisorUser?.email) {
    recipients.push(project.supervisorUser.email);
  } else if (project.supervisor?.trim()) {
    // Try to find the supervisor by name in the Employee table
    const [firstName, ...rest] = project.supervisor.trim().split(" ");
    const lastName = rest.join(" ");
    const emp = await prisma.employee.findFirst({
      where: {
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
        email: { not: null },
      },
      select: { email: true },
    });
    if (emp?.email) recipients.push(emp.email);
  }

  // Default Sueep PM as fallback/CC
  const sueepEmail = (process.env.DOCUSEAL_SUEEP_SIGNER_EMAIL ?? "david@sueep.com").trim();
  if (!recipients.includes(sueepEmail)) recipients.push(sueepEmail);

  const typeLabel = type === "change-order" ? "Change Order Request" : "SOV Work Scheduling Request";
  const html = buildProjectRequestEmail({
    type,
    projectTitle: project.jobTitle,
    requesterName: requesterName.trim(),
    requesterEmail: requesterEmail.trim(),
    coTitle: body.coTitle,
    coDescription: body.coDescription,
    sovDescription,
    desiredDate: body.desiredDate,
    comments: body.comments,
    projectUrl,
  });

  const confirmationHtml = buildProjectRequestConfirmationEmail({
    type,
    projectTitle: project.jobTitle,
    requesterName: requesterName.trim(),
    coTitle: body.coTitle,
    sovDescription,
    desiredDate: body.desiredDate,
  });

  await Promise.all([
    // Internal notification to supervisors/PM with ERP link
    ...recipients.map((to) =>
      sendEmail({
        to,
        subject: `${typeLabel}: ${project.jobTitle}`,
        html,
        replyTo: requesterEmail.trim(),
      }).catch((err) => console.error(`Failed to send to ${to}:`, err))
    ),
    // Confirmation to the requester — no ERP link
    sendEmail({
      to: requesterEmail.trim(),
      subject: `Your request was received — ${project.jobTitle}`,
      html: confirmationHtml,
    }).catch((err) => console.error("Failed to send requester confirmation:", err)),
  ]);

  return NextResponse.json({ ok: true });
}
