import Link from "next/link";
import { InfoTip } from "@/app/erp/components/ui";

const TABS = [
  { id: "policies", label: "Our Policies", href: "/erp/insurance" },
  { id: "holders", label: "Certificate Holders", href: "/erp/insurance/holders" },
  { id: "requests", label: "Requests", href: "/erp/insurance/requests" },
] as const;

/** Title, tab bar, and an optional main action, shared by every Insurance tab. */
export function InsuranceHeader({
  active,
  action,
  requestCount = 0,
}: {
  active: (typeof TABS)[number]["id"];
  action?: React.ReactNode;
  /** New requests, shown as a badge on the Requests tab */
  requestCount?: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-pink-600">Insurance &amp; COIs</h1>
          <InfoTip text="Our insurance policies and the GCs and property managers we send COIs to. COIs are still made in CoverDash; this page tracks what CoverDash doesn't." />
        </div>
        {action}
      </div>
      <nav className="flex gap-1 border-b border-gray-200" aria-label="Insurance sections">
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
