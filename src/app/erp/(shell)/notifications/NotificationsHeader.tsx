import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";

const TABS = [
  { id: "settings", label: "Settings", href: "/erp/notifications" },
  { id: "log", label: "Email Log", href: "/erp/notifications/log" },
] as const;

export function NotificationsHeader({ active, failedCount = 0 }: { active: (typeof TABS)[number]["id"]; failedCount?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-pink-600">Notification Management</h1>
        <InfoTip text="Every email the ERP and website send. Turn emails on or off, change who gets them, and see what went out." />
      </div>
      <nav className="flex gap-1 border-b border-gray-200" aria-label="Notification sections">
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
              {t.id === "log" && failedCount > 0 && (
                <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white" title="Failed in the last 7 days">
                  {failedCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
