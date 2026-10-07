/**
 * Each person's Notifications page: the ERP emails sent to their login
 * email, read from the Email Log. Admins also get an "All emails" view.
 * Server only.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ErpAuthContext } from "@/lib/erpAuth";
import { NOTIFICATIONS, type NotificationGroup } from "@/lib/notificationTypes";

/** Never listed: sign-in codes are one-time and shouldn't sit on a page. */
const HIDDEN_TYPES = ["PROPERTY_MANAGER_SIGN_IN_CODE"];

export function inboxEmail(auth: ErpAuthContext): string {
  return auth.email.trim().toLowerCase();
}

export function canSeeAllEmails(auth: ErpAuthContext): boolean {
  return auth.role === "ADMIN";
}

/** Emails that actually went out and belong on a Notifications page. */
const LISTED: Prisma.EmailLogWhereInput = { status: "SENT", type: { notIn: HIDDEN_TYPES } };

/** Sent to this address as to, cc, or bcc. */
export function sentToWhere(email: string): Prisma.EmailLogWhereInput {
  return { ...LISTED, OR: [{ to: { has: email } }, { cc: { has: email } }, { bcc: { has: email } }] };
}

export function allListedWhere(): Prisma.EmailLogWhereInput {
  return LISTED;
}

export function typesInGroup(group: NotificationGroup): string[] {
  return Object.entries(NOTIFICATIONS)
    .filter(([, d]) => d.group === group)
    .map(([k]) => k);
}

export async function unreadCount(email: string): Promise<number> {
  return prisma.emailLog.count({ where: { ...sentToWhere(email), reads: { none: { userEmail: email } } } });
}

/** Marks these emails read for this person, skipping ones already read. */
export async function markRead(email: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.emailLogRead.createMany({ data: ids.map((emailLogId) => ({ emailLogId, userEmail: email })), skipDuplicates: true });
}
