import Link from "next/link";

// Add future calendars here: one entry plus a branch in page.tsx.
const CALENDARS = [
  { id: "projects", label: "Projects", href: "/erp/schedule" },
  { id: "janitorial", label: "Janitorial Contracts", href: "/erp/schedule?calendar=janitorial" },
] as const;

export type ScheduleCalendarId = (typeof CALENDARS)[number]["id"];

export function ScheduleCalendarTabs({ active }: { active: ScheduleCalendarId }) {
  return (
    <nav className="flex gap-1 border-b border-gray-200" aria-label="Calendars">
      {CALENDARS.map((c) => {
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
