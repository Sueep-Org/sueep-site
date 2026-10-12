/**
 * The button added to an email written on a project's Communications tab.
 * Everyone on an email gets the same content, so the rule is about who it
 * is addressed to:
 * - Someone in To has an ERP login: a button to the project in the ERP.
 *   People copied don't count, since the sender is always copied.
 * - To is one property manager who can see the project's building, and
 *   everyone copied is staff: a button to their own page. That link is
 *   private to them, so it never goes out when anyone else outside Sueep is
 *   on the email. It still asks for their emailed code on a new device.
 * - Otherwise no button.
 */

import { prisma } from "@/lib/prisma";
import { appUrl } from "./scheduleInvites";
import { propertyManagerLinkUrl } from "./propertyManagers";

export type ProjectMessageLink = { kind: "ERP" | "PORTAL"; url: string; label: string; note: string };

const anyOf = (emails: string[]) => emails.map((e) => ({ email: { equals: e, mode: "insensitive" as const } }));

export async function projectMessageLink(opts: { projectId: string; buildingId: string | null; to: string[]; cc: string[] }): Promise<ProjectMessageLink | null> {
  const base = appUrl().replace(/\/$/, "");
  if (base && (await prisma.erpUser.count({ where: { OR: anyOf(opts.to) } })) > 0) {
    return { kind: "ERP", url: `${base}/erp/projects/${opts.projectId}`, label: "Open project", note: "Sueep login required." };
  }

  if (opts.to.length !== 1 || !opts.buildingId) return null;
  const manager = await prisma.propertyManager.findFirst({
    where: { email: { equals: opts.to[0], mode: "insensitive" }, active: true, buildings: { some: { buildingId: opts.buildingId } } },
    select: { token: true },
  });
  if (!manager) return null;
  const staffCopied = opts.cc.length ? await prisma.erpUser.count({ where: { OR: anyOf(opts.cc) } }) : 0;
  if (staffCopied < opts.cc.length) return null;
  return { kind: "PORTAL", url: propertyManagerLinkUrl(manager.token), label: "See my turnovers", note: "Opens your private Sueep page." };
}
