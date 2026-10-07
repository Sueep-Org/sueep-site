import Link from "next/link";

// Add future calendars here: one entry plus a branch in page.tsx.
const CALENDARS = [
  { id: "projects", label: "Projects", href: "/erp/schedule" },
  { id: "timeline", label: "Gantt", href: "/erp/schedule?calendar=timeline" },
  { id: "janitorial", label: "Janitorial Contracts", href: "/erp/schedule?calendar=janitorial" },
  { id: "management", label: "Management", href: "/erp/schedule?calendar=management" },
] as const;

// Tabs only some roles get (see canManageManagementCalendar).
const RESTRICTED: ReadonlySet<string> = new Set(["management"]);

export type ScheduleCalendarId = (typeof CALENDARS)[number]["id"];

export function ScheduleCalendarTabs({ active, showManagement }: { active: ScheduleCalendarId; showManagement: boolean }) {
  return (
    <nav className="flex gap-1 border-b border-gray-200" aria-label="Calendars">
      {CALENDARS.filter((c) => showManagement || !RESTRICTED.has(c.id)).map((c) => {
        const isActive = c.id === active;
        return (
          <Link
            key={c.id}
            href={c.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              isActive ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}
