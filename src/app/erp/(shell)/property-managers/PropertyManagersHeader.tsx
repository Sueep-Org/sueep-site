import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";

const TABS = [
  { id: "managers", label: "Property Managers", href: "/erp/property-managers" },
  { id: "requests", label: "Requests", href: "/erp/property-managers/requests" },
] as const;

/** Title and tab bar shared by the Property Managers tabs. */
export function PropertyManagersHeader({ active, requestCount = 0 }: { active: (typeof TABS)[number]["id"]; requestCount?: number }) {
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-1.5 text-2xl font-semibold text-gray-900">
        Property Managers
        <InfoTip text="Outside property managers get a private link to see and request turnovers for their buildings. No login needed." />
      </h1>
      <nav className="flex gap-1 border-b border-gray-200" aria-label="Property manager sections">
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
              {t.id === "requests" && requestCount > 0 && (
                <span className="ml-1.5 rounded-full bg-pink-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{requestCount}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
