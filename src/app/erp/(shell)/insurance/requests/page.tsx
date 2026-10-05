import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManageInsurance } from "@/lib/erpAuth";
import { GENERAL_TOKEN_KEY, OPEN_STATUSES, requestLinkUrl } from "@/lib/erp/coiRequests";
import { getNotificationSetting } from "@/lib/notificationSettings";
import { InsuranceHeader } from "../InsuranceTabs";
import { RequestsView } from "./RequestsView";
import { REQUEST_SELECT, holderMatcher, toRequestRow } from "./serializeRequest";

export const metadata: Metadata = {
  title: "COI Requests",
};

export const dynamic = "force-dynamic";

export default async function CoiRequestsPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageInsurance(auth.role)) redirect("/erp");

  const [openRequests, closedRequests, profiles, projects, settings, holderContacts, pastRequesters, notify] = await Promise.all([
    prisma.coiRequest.findMany({ where: { status: { in: OPEN_STATUSES } }, orderBy: { createdAt: "asc" }, select: REQUEST_SELECT }),
    prisma.coiRequest.findMany({ where: { status: { notIn: OPEN_STATUSES } }, orderBy: { updatedAt: "desc" }, take: 20, select: REQUEST_SELECT }),
    prisma.coiHolder.findMany({ select: { id: true, name: true, aliases: true } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { jobTitle: "asc" }, select: { id: true, jobTitle: true } }),
    prisma.appSetting.findMany({ where: { key: GENERAL_TOKEN_KEY } }),
    prisma.coiHolder.findMany({ where: { archived: false, contactEmail: { not: null } }, orderBy: { name: "asc" }, select: { name: true, contactName: true, contactEmail: true } }),
    prisma.coiRequest.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { requesterName: true, requesterCompany: true, requesterEmail: true } }),
    getNotificationSetting("COI_REQUEST_RECEIVED"),
  ]);

  // People to suggest when emailing the general link: holder contacts, then
  // anyone who has requested before.
  const seenEmails = new Set<string>();
  const emailSuggestions = [
    ...holderContacts.map((h) => ({ name: h.contactName ? `${h.contactName} (${h.name})` : h.name, email: h.contactEmail! })),
    ...pastRequesters.map((r) => ({ name: r.requesterCompany ? `${r.requesterName} (${r.requesterCompany})` : r.requesterName, email: r.requesterEmail })),
  ]
    .filter((s) => {
      const k = s.email.trim().toLowerCase();
      if (!k || seenEmails.has(k)) return false;
      seenEmails.add(k);
      return true;
    })
    .slice(0, 12);

  const match = holderMatcher(profiles);
  const row = (r: (typeof openRequests)[number]) => toRequestRow({ ...r, hasSample: !!r.sampleFilename }, match);
  const setting = (k: string) => settings.find((s) => s.key === k)?.value ?? null;
  const generalToken = setting(GENERAL_TOKEN_KEY);

  return (
    <div className="space-y-6">
      <InsuranceHeader active="requests" requestCount={openRequests.filter((r) => r.status === "NEW").length} />
      <RequestsView
        open={openRequests.map(row)}
        closed={closedRequests.map(row)}
        projects={projects}
        generalLink={generalToken ? requestLinkUrl(generalToken) : null}
        notifyEmail={notify.to.join(", ")}
        emailSuggestions={emailSuggestions}
      />
    </div>
  );
}
