/**
 * Who a waiting draft is emailed to, set on Ready to send. Saved on the draft
 * (a janitorial month's HubSpot draft keeps it on the month); Approve uses it
 * instead of the billing settings (withDraftRecipients). "Also use for future
 * invoices" saves it as the building's or job's billing override too.
 */
import { prisma } from "@/lib/prisma";
import { EMAIL_RE } from "./clientCompanies";
import { qboEnvironment } from "./qboClient";

export type RecipientDraftKind = "month" | "items" | "qbo";

/** Someone the invoice can go to, from the client company or the job brief. */
export type RecipientContact = { name: string; role: string | null; email: string; from: "Company" | "Job" };

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The client company's contacts, then the job's, each email once. */
export async function recipientContacts(companyId: string | null, projectId: string | null): Promise<RecipientContact[]> {
  const [company, job] = await Promise.all([
    companyId ? prisma.clientCompanyContact.findMany({ where: { companyId, email: { not: null } }, select: { name: true, role: true, email: true }, orderBy: { name: "asc" } }) : [],
    projectId ? prisma.projectContact.findMany({ where: { projectId, email: { not: null } }, select: { fullName: true, role: true, email: true }, orderBy: { fullName: "asc" } }) : [],
  ]);
  const out: RecipientContact[] = [];
  const add = (c: RecipientContact) => {
    if (EMAIL_RE.test(c.email) && !out.some((x) => sameEmail(x.email, c.email))) out.push(c);
  };
  for (const c of company) add({ name: c.name, role: c.role, email: c.email!.trim(), from: "Company" });
  for (const c of job) add({ name: c.fullName, role: c.role, email: c.email!.trim(), from: "Job" });
  return out;
}

/** The waiting draft's building or job, or null when it isn't waiting. */
async function draftGroup(kind: RecipientDraftKind, rowId: string): Promise<{ type: "BUILDING" | "PROJECT"; id: string } | null> {
  if (kind === "month") {
    const p = await prisma.recurringContractPeriod.findUnique({ where: { id: rowId }, select: { billingStatus: true, recurringContract: { select: { buildingId: true } } } });
    return p && p.billingStatus === "NOT_BILLED" ? { type: "BUILDING", id: p.recurringContract.buildingId } : null;
  }
  const d =
    kind === "qbo"
      ? await prisma.qboInvoiceDraft.findFirst({ where: { id: rowId, environment: qboEnvironment(), status: "DRAFT" }, select: { groupType: true, groupId: true } })
      : await prisma.itemInvoiceDraft.findFirst({ where: { id: rowId, status: "DRAFT" }, select: { groupType: true, groupId: true } });
  return d ? { type: d.groupType === "PROJECT" ? "PROJECT" : "BUILDING", id: d.groupId } : null;
}

/** Cleans a list: trimmed, valid, each email once, in the order given. */
function cleanList(v: unknown): { value: string[] } | { error: string } {
  const out: string[] = [];
  for (const e of Array.isArray(v) ? v : []) {
    const t = typeof e === "string" ? e.trim() : "";
    if (!t) continue;
    if (!EMAIL_RE.test(t)) return { error: `"${t}" isn't an email address.` };
    if (!out.some((x) => sameEmail(x, t))) out.push(t);
  }
  return { value: out };
}

/**
 * Sets the draft's To and Cc (someone in both stays in To only). With
 * `forFuture`, also saves them as the building's or job's billing override.
 */
export async function setDraftRecipients(
  kind: RecipientDraftKind,
  rowId: string,
  input: { to: unknown; cc: unknown; forFuture: boolean },
  email: string,
): Promise<{ ok: true } | { error: string }> {
  const to = cleanList(input.to);
  if ("error" in to) return to;
  const cc = cleanList(input.cc);
  if ("error" in cc) return cc;
  if (!to.value.length) return { error: "Add at least one person to To." };
  const ccOnly = cc.value.filter((c) => !to.value.some((t) => sameEmail(t, c)));
  const group = await draftGroup(kind, rowId);
  if (!group) return { error: "This draft isn't waiting anymore." };

  const now = new Date();
  const set = { sendTo: to.value, cc: ccOnly, recipientsSetAt: now, recipientsSetByEmail: email };
  await prisma.$transaction([
    kind === "month"
      ? prisma.recurringContractPeriod.update({ where: { id: rowId }, data: { draftSendTo: to.value, draftCc: ccOnly, draftRecipientsSetAt: now, draftRecipientsSetByEmail: email } })
      : kind === "qbo"
        ? prisma.qboInvoiceDraft.update({ where: { id: rowId }, data: set })
        : prisma.itemInvoiceDraft.update({ where: { id: rowId }, data: set }),
    ...(input.forFuture
      ? [
          group.type === "PROJECT"
            ? prisma.project.update({ where: { id: group.id }, data: { billingOverrideSendTo: to.value, billingOverrideCc: ccOnly } })
            : prisma.building.update({ where: { id: group.id }, data: { billingOverrideSendTo: to.value, billingOverrideCc: ccOnly } }),
        ]
      : []),
  ]);
  return { ok: true };
}

/** Back to the billing settings' Send to and cc. */
export async function resetDraftRecipients(kind: RecipientDraftKind, rowId: string): Promise<{ ok: true } | { error: string }> {
  if (!(await draftGroup(kind, rowId))) return { error: "This draft isn't waiting anymore." };
  const clear = { sendTo: [], cc: [], recipientsSetAt: null, recipientsSetByEmail: null };
  if (kind === "month") {
    await prisma.recurringContractPeriod.update({ where: { id: rowId }, data: { draftSendTo: [], draftCc: [], draftRecipientsSetAt: null, draftRecipientsSetByEmail: null } });
  } else if (kind === "qbo") {
    await prisma.qboInvoiceDraft.update({ where: { id: rowId }, data: clear });
  } else {
    await prisma.itemInvoiceDraft.update({ where: { id: rowId }, data: clear });
  }
  return { ok: true };
}
