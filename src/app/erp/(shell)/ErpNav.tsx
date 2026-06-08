"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLogoutButton } from "./ErpLogoutButton";

const topNav = [
  { href: "/erp", label: "Dashboard" },
];

const projectGroup = {
  label: "Project Information",
  items: [
    { href: "/erp/projects", label: "Projects" },
    { href: "/erp/projects/new", label: "New Project" },
    { href: "/erp/labor-assignments", label: "Labor Assignments" },
    { href: "/erp/contractor-assignments", label: "Contractor Assignments" },
    { href: "/erp/quality-checks", label: "Quality Checks" },
    { href: "/erp/schedule", label: "Schedule" },
  ],
};

const bottomNav = [
  { href: "/erp/employees", label: "Employees" },
  { href: "/erp/payroll", label: "Payroll Export" },
  { href: "/erp/candidates", label: "Candidates" },
  { href: "/erp/contractors", label: "Contractor Verification" },
  { href: "/erp/estimator", label: "AI Estimator" },
];

function isGroupActive(pathname: string) {
  return projectGroup.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
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

function ProjectGroup({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(() => isGroupActive(pathname));

  useEffect(() => {
    if (isGroupActive(pathname)) setOpen(true);
  }, [pathname]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>Project Information</span>
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
      </button>
      {open && (
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-2">
          {projectGroup.items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ErpNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

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
          {topNav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
          ))}
          <div className="my-1 border-t border-gray-100" />
          <ProjectGroup pathname={pathname} />
          <div className="my-1 border-t border-gray-100" />
          {bottomNav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
          ))}
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
              {topNav.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
              ))}
              <div className="my-1 border-t border-gray-100" />
              <ProjectGroup pathname={pathname} />
              <div className="my-1 border-t border-gray-100" />
              {bottomNav.map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} pathname={pathname} />
              ))}
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
