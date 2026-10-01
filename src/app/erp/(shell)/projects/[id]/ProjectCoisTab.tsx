import { prisma } from "@/lib/prisma";
import { utcDateKey } from "@/lib/erp/dates";
import { expiryStatus } from "@/lib/erp/insurance";
import { currentCoiIds } from "@/lib/erp/projectCois";
import { OPEN_STATUSES } from "@/lib/erp/coiRequests";
import { REQUEST_SELECT, holderMatcher, toRequestRow } from "../../insurance/requests/serializeRequest";
import { toHolderRow, toPolicyRow } from "../../insurance/serialize";
import { ProjectCoisSection, type ProjectCoiRow } from "./ProjectCoisSection";

/** COIs tab on a project: loads its COIs plus the holders and policies to pick from. */
export async function ProjectCoisTab({ projectId }: { projectId: string }) {
  const [cois, holders, policies, requests] = await Promise.all([
    prisma.projectCoi.findMany({
      where: { projectId },
      orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        holderId: true,
        holderName: true,
        issuedOn: true,
        createdAt: true,
        expiresAt: true,
        sentOn: true,
        sentTo: true,
        notes: true,
        filename: true,
        policies: { select: { policyType: true, carrier: true, policyNumber: true, expiresAt: true } },
      },
    }),
    prisma.coiHolder.findMany({ where: { archived: false }, orderBy: { name: "asc" } }),
    prisma.insurancePolicy.findMany({ where: { active: true }, orderBy: { expiresAt: "asc" } }),
    prisma.coiRequest.findMany({ where: { projectId, status: { in: OPEN_STATUSES } }, orderBy: { createdAt: "asc" }, select: REQUEST_SELECT }),
  ]);
  const match = holderMatcher(holders);

  const current = currentCoiIds(cois);
  const rows: ProjectCoiRow[] = cois.map((c) => ({
    id: c.id,
    holderName: c.holderName,
    issuedOn: utcDateKey(c.issuedOn),
    expiresAt: utcDateKey(c.expiresAt),
    sentOn: c.sentOn ? utcDateKey(c.sentOn) : null,
    sentTo: c.sentTo,
    notes: c.notes,
    filename: c.filename,
    policies: c.policies.map((p) => ({ ...p, expiresAt: utcDateKey(p.expiresAt) })),
    current: current.has(c.id),
    status: expiryStatus(c.expiresAt),
  }));

  return (
    <ProjectCoisSection
      projectId={projectId}
      cois={rows}
      holders={holders.map(toHolderRow)}
      policies={policies.map(toPolicyRow)}
      requests={requests.map((r) => toRequestRow({ ...r, hasSample: !!r.sampleFilename }, match))}
    />
  );
}
