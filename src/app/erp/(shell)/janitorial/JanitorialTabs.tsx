import Link from "next/link";

const TABS = [
  { id: "today", label: "Today", href: "/erp/janitorial/today" },
  { id: "contracts", label: "Contracts", href: "/erp/janitorial" },
  { id: "hours", label: "Hours", href: "/erp/janitorial/hours" },
] as const;

/** Title, tab bar, and an optional main action, shared by every Janitorial Contracts tab. */
export function JanitorialHeader({ active, action }: { active: (typeof TABS)[number]["id"]; action?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-pink-600">Janitorial Contracts</h1>
        {action}
      </div>
      <nav className="flex gap-1 border-b border-gray-200" aria-label="Janitorial sections">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                isActive ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
