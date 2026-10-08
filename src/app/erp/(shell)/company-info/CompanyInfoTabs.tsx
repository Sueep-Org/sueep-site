import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";

const TABS = [
  { id: "general", label: "General", href: "/erp/company-info" },
  { id: "financial", label: "Financial", href: "/erp/company-info/financial" },
  { id: "logins", label: "Logins", href: "/erp/company-info/logins" },
  { id: "access-log", label: "Access log", href: "/erp/company-info/access-log", adminOnly: true },
] as const;

/** Title and tab bar shared by every Company Info tab. */
export function CompanyInfoHeader({ active, showAccessLog }: { active: (typeof TABS)[number]["id"]; showAccessLog: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-pink-600">Company Info</h1>
        <InfoTip text="Our IDs, licenses, and company details for vendor forms and bids. Admins and PMs only. Locked values are encrypted, and every reveal is logged." />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Company Info sections">
        {TABS.filter((t) => !("adminOnly" in t) || showAccessLog).map((t) => {
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
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
