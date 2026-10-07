import { NOTIFICATIONS, isEmailType, type NotificationGroup } from "@/lib/notificationTypes";

/** Dot color per email area. Full class strings so Tailwind keeps them. */
export const AREA_DOT: Record<NotificationGroup, string> = {
  "Projects & schedule": "bg-sky-400",
  Turnovers: "bg-teal-400",
  People: "bg-violet-400",
  Insurance: "bg-amber-400",
  Reminders: "bg-rose-400",
  Website: "bg-lime-500",
  Admin: "bg-gray-400",
};

export function emailMeta(type: string): { label: string; group: NotificationGroup | null } {
  return isEmailType(type) ? { label: NOTIFICATIONS[type].label, group: NOTIFICATIONS[type].group } : { label: type, group: null };
}

const NY = "America/New_York";

export function nyDayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: NY });
}

/** "2:15 PM" for today, "Oct 5, 2:15 PM" otherwise. */
export function shortWhen(d: Date, todayKey: string): string {
  return nyDayKey(d) === todayKey
    ? d.toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" })
    : d.toLocaleString("en-US", { timeZone: NY, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fullWhen(d: Date): string {
  return d.toLocaleString("en-US", { timeZone: NY, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Tells the menu badge to recount after something is marked read. */
export const INBOX_CHANGED_EVENT = "erp-inbox-changed";
