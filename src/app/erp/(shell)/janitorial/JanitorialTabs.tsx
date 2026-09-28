import Link from "next/link";

const TABS = [
  { id: "today", label: "Today", href: "/erp/janitorial/today" },
  { id: "contracts", label: "Contracts", href: "/erp/janitorial" },
  { id: "hours", label: "Hours", href: "/erp/janitorial/hours" },
] as const;

export function JanitorialTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
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
  );
}
