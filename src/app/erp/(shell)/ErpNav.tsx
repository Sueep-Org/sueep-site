"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLogoutButton } from "./ErpLogoutButton";
import type { ErpRole } from "@/lib/erpSession";

type AllRoles = ErpRole[];
const ALL: AllRoles = ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"];
const PM_EST: AllRoles = ["ADMIN", "PROJECT_MANAGER", "SALES", "ESTIMATION"];
const FINANCE_UP: AllRoles = ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"];

// Small outline icon set, same 24x24/stroke-based convention already used
// for the hamburger/X/chevron icons elsewhere in this file — one per nav
// item so the sidebar reads like the sueep design reference.
type IconProps = { className?: string };
const iconCls = "h-5 w-5";

function HomeIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.5 1.5 0 012.122 0L22.25 12M4.5 9.75V21a.75.75 0 00.75.75H9.75v-6a1.5 1.5 0 011.5-1.5h1.5a1.5 1.5 0 011.5 1.5v6h4.5a.75.75 0 00.75-.75V9.75" />
    </svg>
  );
}
function BuildingIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 21V4.5a.75.75 0 01.75-.75h9a.75.75 0 01.75.75V21M4.5 21h15M4.5 21H3M19.5 21H21M14.25 21v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21M7.5 7.5h1.5M7.5 11h1.5M7.5 14.5h1.5M12 7.5h1.5M12 11h1.5M15.75 3.75H19.5a.75.75 0 01.75.75V21" />
    </svg>
  );
}
function FolderIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75a2.25 2.25 0 012.25-2.25h4.19a1.5 1.5 0 011.06.44l1.62 1.62a1.5 1.5 0 001.06.44H18a2.25 2.25 0 012.25 2.25v8.25A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
    </svg>
  );
}
function PlusCircleIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v7.5M8.25 12h7.5" />
    </svg>
  );
}
function CalendarIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6h15a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-15a.75.75 0 01-.75-.75V6.75A.75.75 0 014.5 6z" />
    </svg>
  );
}
function DocumentIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7.19a1.5 1.5 0 011.06.44l2.56 2.56a1.5 1.5 0 01.44 1.06V19.5a.75.75 0 01-.75.75H7a.75.75 0 01-.75-.75V4.5A.75.75 0 017 3.75zM9.5 12h5M9.5 15.25h5" />
    </svg>
  );
}
function UsersIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 11a3 3 0 100-6 3 3 0 000 6zM2.5 20a6.5 6.5 0 0113 0M16 11a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM15 14.5c2.9.3 5.5 2.3 6 5.5" />
    </svg>
  );
}
function CreditCardIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="2.25" y="6" width="19.5" height="12" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 10.25h19.5M5.25 15h3" />
    </svg>
  );
}
function BanknotesIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="2.25" y="7.5" width="19.5" height="10.5" rx="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12.75" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 7.5v10.5M18.5 7.5v10.5" />
    </svg>
  );
}
function UserCircleIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.3 18.2a6 6 0 0111.4 0" />
    </svg>
  );
}
function UserPlusIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="9" cy="8" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19a5.5 5.5 0 0111 0M17.5 8v5M20 10.5h-5" />
    </svg>
  );
}
function BriefcaseIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="8.25" width="18" height="11.25" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25V6a1.5 1.5 0 011.5-1.5h4.5A1.5 1.5 0 0115.75 6v2.25M3 13.5h18" />
    </svg>
  );
}
function IdCardIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="11" r="2" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 16c.5-1.6 1.8-2.5 3-2.5s2.5.9 3 2.5M14.5 9.5h4M14.5 13h4" />
    </svg>
  );
}
function SparklesIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.25 3l1.2 3.3L13.75 7.5l-3.3 1.2L9.25 12 8.05 8.7 4.75 7.5l3.3-1.2L9.25 3zM17.5 13.5l.75 2 2 .75-2 .75-.75 2-.75-2-2-.75 2-.75.75-2z" />
    </svg>
  );
}
function QuestionMarkCircleIcon({ className = iconCls }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 114.13 1.9c-.7.6-1.63 1.02-1.63 2.1M12 17h.01" />
    </svg>
  );
}
function ChevronRightIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={["h-4 w-4 text-gray-400 transition-transform shrink-0", open ? "rotate-90" : ""].join(" ")}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  roles: AllRoles;
  icon: (props: IconProps) => ReactNode;
}

const dashboardItem: NavItem = { href: "/erp", label: "Dashboard", roles: ALL, icon: HomeIcon };

const projectGroupItems: NavItem[] = [
  { href: "/erp/projects", label: "Projects", roles: ALL, icon: FolderIcon },
  { href: "/erp/projects/new", label: "New Project", roles: PM_EST, icon: PlusCircleIcon },
  { href: "/erp/schedule", label: "Schedule", roles: ALL, icon: CalendarIcon },
];

const billingGroupItems: NavItem[] = [
  { href: "/erp/billing", label: "Project Billing", roles: FINANCE_UP, icon: DocumentIcon },
  { href: "/erp/payroll", label: "Compensation", roles: FINANCE_UP, icon: BanknotesIcon },
];

const employmentGroupItems: NavItem[] = [
  { href: "/erp/employees", label: "Employees", roles: FINANCE_UP, icon: UserCircleIcon },
  { href: "/erp/candidates", label: "Candidates", roles: FINANCE_UP, icon: UserPlusIcon },
  { href: "/erp/contractors", label: "Contractors", roles: FINANCE_UP, icon: BriefcaseIcon },
];

const teamExtraItems: NavItem[] = [
  { href: "/erp/users", label: "User Management", roles: ["ADMIN"], icon: IdCardIcon },
];

const aiEstimatorItem: NavItem = { href: "/erp/estimator", label: "AI Estimator", roles: PM_EST, icon: SparklesIcon };
const helpCenterItem: NavItem = { href: "/erp/help", label: "Help Center", roles: ALL, icon: QuestionMarkCircleIcon };

function allowed(item: NavItem, role: ErpRole): boolean {
  return (item.roles as string[]).includes(role);
}

function isGroupActive(pathname: string, items: NavItem[]) {
  return items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

const rowCls = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    pathname === item.href ||
    (item.href !== "/erp" && pathname.startsWith(item.href + "/") && item.href !== "/erp/projects/new");
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        rowCls,
        active ? "bg-pink-50 font-medium text-pink-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
      ].join(" ")}
    >
      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-pink-600" : "text-gray-400"}`} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 first:mt-0">{children}</p>;
}

// ── Icon-only desktop rail, expanding to a flyout panel on hover ──

const railIconBtnCls =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors";

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active =
    pathname === item.href ||
    (item.href !== "/erp" && pathname.startsWith(item.href + "/"));
  const Icon = item.icon;
  return (
    <div className="group relative flex justify-center">
      <Link
        href={item.href}
        aria-label={item.label}
        className={[
          railIconBtnCls,
          active ? "bg-pink-50 text-pink-600" : "text-gray-400 hover:bg-gray-50 hover:text-gray-900",
        ].join(" ")}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </Link>
      <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {item.label}
      </div>
    </div>
  );
}

function RailGroup({
  label,
  icon: Icon,
  items,
  pathname,
}: {
  label: string;
  icon: (props: IconProps) => ReactNode;
  items: NavItem[];
  pathname: string;
}) {
  const active = isGroupActive(pathname, items);
  if (items.length === 0) return null;

  return (
    <div className="group relative flex justify-center">
      <Link
        href={items[0].href}
        aria-label={label}
        className={[
          railIconBtnCls,
          active ? "bg-pink-50 text-pink-600" : "text-gray-400 hover:bg-gray-50 hover:text-gray-900",
        ].join(" ")}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </Link>

      {/* Flush hover bridge (no gap) so the pointer can travel from icon to panel. */}
      <div className="invisible absolute left-full top-0 z-50 pl-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
        <div className="w-56 rounded-xl border border-gray-100 bg-white py-2 shadow-xl">
          <p className="px-3.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <div className="flex flex-col gap-0.5 px-2">
            {items.map((item) => {
              const itemActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "rounded-lg px-2.5 py-2 text-sm transition-colors",
                    itemActive ? "bg-pink-50 font-medium text-pink-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  icon: Icon,
  items,
  pathname,
  role,
}: {
  label: string;
  icon: (props: IconProps) => ReactNode;
  items: NavItem[];
  pathname: string;
  role: ErpRole;
}) {
  const visibleItems = items.filter((i) => allowed(i, role));
  const groupActive = isGroupActive(pathname, visibleItems);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (isGroupActive(pathname, visibleItems)) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (visibleItems.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "w-full justify-between",
          rowCls,
          groupActive ? "bg-pink-50 font-medium text-pink-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
        ].join(" ")}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon className={`h-5 w-5 shrink-0 ${groupActive ? "text-pink-600" : "text-gray-400"}`} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </span>
        <ChevronRightIcon open={open} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-gray-100 pl-3">
          {visibleItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErpNav({ role }: { role: ErpRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  const showDashboard = allowed(dashboardItem, role);
  const visibleProjectItems = projectGroupItems.filter((i) => allowed(i, role));
  const visibleBillingItems = billingGroupItems.filter((i) => allowed(i, role));
  const hasEmploymentGroup = employmentGroupItems.some((i) => allowed(i, role));
  const visibleTeamExtras = teamExtraItems.filter((i) => allowed(i, role));
  const hasTeamSection = hasEmploymentGroup || visibleTeamExtras.length > 0;
  const visibleTeamItems = [...employmentGroupItems, ...teamExtraItems].filter((i) => allowed(i, role));
  const showAiEstimator = allowed(aiEstimatorItem, role);
  const showHelpCenter = allowed(helpCenterItem, role);

  function NavContent() {
    return (
      <>
        {showDashboard && <NavLink item={dashboardItem} pathname={pathname} />}

        {visibleProjectItems.length > 0 && (
          <>
            <SectionLabel>Projects</SectionLabel>
            <NavGroup label="Project Info" icon={BuildingIcon} items={projectGroupItems} pathname={pathname} role={role} />
          </>
        )}

        {visibleBillingItems.length > 0 && (
          <>
            <SectionLabel>Finance</SectionLabel>
            <NavGroup label="Billing" icon={CreditCardIcon} items={billingGroupItems} pathname={pathname} role={role} />
          </>
        )}

        {hasTeamSection && (
          <>
            <SectionLabel>Team</SectionLabel>
            {hasEmploymentGroup && (
              <NavGroup label="Employment" icon={UsersIcon} items={employmentGroupItems} pathname={pathname} role={role} />
            )}
            {visibleTeamExtras.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </>
        )}

        {showAiEstimator && <NavLink item={aiEstimatorItem} pathname={pathname} />}
        {showHelpCenter && <NavLink item={helpCenterItem} pathname={pathname} />}
      </>
    );
  }

  return (
    <>
      {/* ── Desktop icon rail: icons only, hover to reveal each section's flyout ── */}
      <aside className="hidden sm:flex w-[68px] shrink-0 flex-col items-center border-r border-gray-200 bg-white py-3">
        <Link href="/erp" className="mb-3 block shrink-0" aria-label="Sueep dashboard">
          <Image src="/sueepicon.jpeg" alt="Sueep" width={36} height={36} className="h-9 w-9 rounded-lg object-cover" priority />
        </Link>

        {/* No overflow-y here on purpose: overflow-y:auto forces overflow-x to
            clip too, which would cut off the flyout panels below. The rail's
            icon count is small and fixed, so it never needs to scroll. */}
        <nav className="flex flex-1 flex-col items-center gap-1">
          {showDashboard && <RailLink item={dashboardItem} pathname={pathname} />}

          {(visibleProjectItems.length > 0 || visibleBillingItems.length > 0 || hasTeamSection) && (
            <div className="my-1 h-px w-8 shrink-0 bg-gray-100" />
          )}

          {visibleProjectItems.length > 0 && (
            <RailGroup label="Projects" icon={BuildingIcon} items={visibleProjectItems} pathname={pathname} />
          )}
          {visibleBillingItems.length > 0 && (
            <RailGroup label="Finance" icon={CreditCardIcon} items={visibleBillingItems} pathname={pathname} />
          )}
          {hasTeamSection && (
            <RailGroup label="Team" icon={UsersIcon} items={visibleTeamItems} pathname={pathname} />
          )}
          {showAiEstimator && <RailLink item={aiEstimatorItem} pathname={pathname} />}
        </nav>

        {showHelpCenter && (
          <div className="shrink-0 border-t border-gray-100 pt-2">
            <RailLink item={helpCenterItem} pathname={pathname} />
          </div>
        )}

        <div className="mt-1 shrink-0 border-t border-gray-100 pt-3">
          <ErpLogoutButton compact />
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <Link href="/erp">
            <ErpBrandLogo className="h-8 w-auto" priority />
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            {open ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 z-50 border-b border-gray-200 bg-white shadow-lg">
            <nav className="flex flex-col gap-0.5 p-3">
              <NavContent />
            </nav>
            <div className="border-t border-gray-100 p-3">
              <ErpLogoutButton />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
