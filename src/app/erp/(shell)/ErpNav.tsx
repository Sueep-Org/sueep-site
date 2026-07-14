"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLogoutButton } from "./ErpLogoutButton";
import type { ErpRole } from "@/lib/erpSession";

type AllRoles = ErpRole[];
const ALL: AllRoles = ["ADMIN", "PROJECT_MANAGER", "FINANCE", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"];
const PM_UP: AllRoles = ["ADMIN", "PROJECT_MANAGER"];
const FIELD: AllRoles = ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR"];
const PM_EST: AllRoles = ["ADMIN", "PROJECT_MANAGER", "ESTIMATION"];
const FINANCE_UP: AllRoles = ["ADMIN", "PROJECT_MANAGER", "FINANCE"];

interface NavItem {
  href: string;
  label: string;
  roles: AllRoles;
}

const topNav: NavItem[] = [
  { href: "/erp", label: "Dashboard", roles: ALL },
];

const projectGroupItems: NavItem[] = [
  { href: "/erp/projects", label: "Projects", roles: ALL },
  { href: "/erp/projects/new", label: "New Project", roles: PM_EST },
  { href: "/erp/schedule", label: "Schedule", roles: ALL },
];

const billingGroupItems: NavItem[] = [
  { href: "/erp/billing", label: "Project Billing", roles: FINANCE_UP },
  { href: "/erp/payroll", label: "Compensation", roles: FINANCE_UP },
];

const employmentGroupItems: NavItem[] = [
  { href: "/erp/employees", label: "Employees", roles: FINANCE_UP },
  { href: "/erp/candidates", label: "Candidates", roles: FINANCE_UP },
  { href: "/erp/contractors", label: "Contractors", roles: FINANCE_UP },
];

const bottomNav: NavItem[] = [
  { href: "/erp/estimator", label: "AI Estimator", roles: PM_EST },
  { href: "/erp/users", label: "User Management", roles: ["ADMIN"] },
];

function allowed(item: NavItem, role: ErpRole): boolean {
  return (item.roles as string[]).includes(role);
}

function isGroupActive(pathname: string, items: NavItem[]) {
  return items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || (href !== "/erp" && pathname.startsWith(href + "/") && href !== "/erp/projects/new");
  return (
    <Link
      href={href}
      className={[
        "rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-pink-50 font-medium text-pink-700"
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={["h-4 w-4 text-gray-400 transition-transform", open ? "rotate-180" : ""].join(" ")}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function NavGroup({ label, items, pathname, role }: { label: string; items: NavItem[]; pathname: string; role: ErpRole }) {
  const visibleItems = items.filter((i) => allowed(i, role));
  const [open, setOpen] = useState(() => isGroupActive(pathname, visibleItems));

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
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>{label}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
          {visibleItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
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

  const visibleTopNav = topNav.filter((i) => allowed(i, role));
  const visibleBottomNav = bottomNav.filter((i) => allowed(i, role));
  const hasBillingGroup = billingGroupItems.some((i) => allowed(i, role));
  const hasEmploymentGroup = employmentGroupItems.some((i) => allowed(i, role));

  function NavContent() {
    return (
      <>
        {visibleTopNav.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
        ))}
        <div className="my-1 border-t border-gray-100" />
        <NavGroup label="Project Information" items={projectGroupItems} pathname={pathname} role={role} />
        {hasBillingGroup && <div className="my-1 border-t border-gray-100" />}
        {hasBillingGroup && <NavGroup label="Billing" items={billingGroupItems} pathname={pathname} role={role} />}
        {hasEmploymentGroup && <div className="my-1 border-t border-gray-100" />}
        {hasEmploymentGroup && <NavGroup label="Employment" items={employmentGroupItems} pathname={pathname} role={role} />}
        {visibleBottomNav.length > 0 && <div className="my-1 border-t border-gray-100" />}
        {visibleBottomNav.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
        ))}
      </>
    );
  }

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <Link href="/erp" className="block">
            <ErpBrandLogo className="h-9 w-auto" priority />
          </Link>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-500">Internal</p>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          <NavContent />
          <div className="mt-2 border-t border-gray-200 pt-2">
            <NavLink href="/erp/help" label="Help Center" pathname={pathname} />
          </div>
          <div className="mt-1 border-t border-gray-200 pt-2">
            <ErpLogoutButton />
          </div>
        </nav>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="md:hidden">
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
            <nav className="flex flex-col gap-1 p-3">
              <NavContent />
            </nav>
            <div className="border-t border-gray-200 p-3 flex flex-col gap-1">
              <NavLink href="/erp/help" label="Help Center" pathname={pathname} />
              <ErpLogoutButton />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
