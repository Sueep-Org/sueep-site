import { prisma } from "@/lib/prisma";
import { loadEmailQuota } from "@/lib/erp/emailQuota";
import { projectEmailsWhere } from "@/lib/erp/projectEmails";
import { NOTIFICATIONS, isEmailType } from "@/lib/notificationTypes";
import { ProjectCommunicationsSection, type CommunicationsContact } from "./ProjectCommunicationsSection";

/** Most recent emails shown in the history. */
const HISTORY_LIMIT = 200;

/** Communications tab on a project: everyone who can be emailed about it. */
export async function ProjectCommunicationsTab({ projectId, canManage, senderEmail }: { projectId: string; canManage: boolean; senderEmail: string }) {
  const [quota, emails, project, contacts, assignments] = await Promise.all([
    loadEmailQuota(),
    prisma.emailLog.findMany({
      where: projectEmailsWhere(projectId),
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { id: true, createdAt: true, type: true, to: true, cc: true, subject: true, status: true, sentBy: true, hasAttachments: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { hubspotDealId: true } }),
    prisma.projectContact.findMany({
      where: { projectId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true, fullName: true, role: true, company: true, email: true, phone: true, source: true, isPrimary: true },
    }),
    prisma.contractorAssignment.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { role: true, contractor: { select: { id: true, name: true, role: true, email: true, phone: true } } },
    }),
  ]);

  // A sub can be on the project more than once (one row per task).
  const contractors = new Map<string, CommunicationsContact>();
  for (const a of assignments) {
    if (contractors.has(a.contractor.id)) continue;
    contractors.set(a.contractor.id, {
      id: a.contractor.id,
      kind: "CONTRACTOR",
      fullName: a.contractor.name,
      role: a.role ?? a.contractor.role,
      company: null,
      email: a.contractor.email,
      phone: a.contractor.phone,
      isPrimary: false,
    });
  }

  return (
    <ProjectCommunicationsSection
      projectId={projectId}
      canManage={canManage}
      canSync={!!project?.hubspotDealId}
      senderEmail={senderEmail}
      quota={quota}
      emails={emails.map((e) => ({
        id: e.id,
        sentAt: e.createdAt.toISOString(),
        written: e.type === "PROJECT_MESSAGE",
        typeLabel: isEmailType(e.type) ? NOTIFICATIONS[e.type].label : e.type,
        to: e.to,
        cc: e.cc,
        subject: e.subject,
        status: e.status,
        sentBy: e.sentBy,
        hasAttachments: e.hasAttachments,
      }))}
      historyLimit={HISTORY_LIMIT}
      contractors={Array.from(contractors.values())}
      initialContacts={contacts.map((c) => ({ ...c, kind: c.source === "HUBSPOT" ? "HUBSPOT" : "MANUAL" }))}
    />
  );
}
