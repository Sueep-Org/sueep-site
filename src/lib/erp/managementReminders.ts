/**
 * Daily reminder email for the Management calendar. An item is included on
 * the mornings its category's reminder days land on (e.g. 30 and 7 days
 * before), and on the day itself when 0 is in the list. Done items are
 * skipped. Goes to every Admin and Project Manager.
 */

import { prisma } from "@/lib/prisma";
import { buildManagementReminderEmail, sendEmail } from "@/lib/email";
import { todayEasternKey } from "./dates";
import { addDaysKey, daysBetween, formatItemDates } from "./managementCalendar";
import { loadManagementCategories, loadManagementItems } from "./managementCalendarServer";

export async function sendManagementReminders(todayKey: string = todayEasternKey()) {
  const categories = await loadManagementCategories();
  const maxDays = Math.max(-1, ...categories.flatMap((c) => c.remindDays));
  if (maxDays < 0) return { sent: 0, items: 0 };

  const byId = new Map(categories.map((c) => [c.id, c]));
  const items = (await loadManagementItems(todayKey, addDaysKey(todayKey, maxDays), categories)).filter((i) => {
    if (i.done) return false;
    const days = daysBetween(todayKey, i.start);
    return days >= 0 && (byId.get(i.categoryId)?.remindDays ?? []).includes(days);
  });
  if (!items.length) return { sent: 0, items: 0 };

  const recipients = await prisma.erpUser.findMany({ where: { role: { in: ["ADMIN", "PROJECT_MANAGER"] } }, select: { email: true } });
  if (!recipients.length) return { sent: 0, items: items.length };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const html = buildManagementReminderEmail({
    calendarUrl: `${appUrl}/erp/schedule?calendar=management`,
    items: items.map((i) => {
      const days = daysBetween(todayKey, i.start);
      return {
        title: i.title,
        detail: i.detail,
        category: byId.get(i.categoryId)?.name ?? "",
        date: formatItemDates(i.start, i.end),
        when: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`,
      };
    }),
  });
  const subject = `${items.length} upcoming item${items.length === 1 ? "" : "s"} on the Management calendar`;
  const results = await Promise.allSettled(recipients.map((r) => sendEmail({ type: "MANAGEMENT_REMINDERS", link: "/erp/schedule?calendar=management", to: r.email, subject, html })));
  return { sent: results.filter((r) => r.status === "fulfilled").length, items: items.length };
}
