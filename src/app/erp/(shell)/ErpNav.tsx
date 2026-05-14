"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLogoutButton } from "./ErpLogoutButton";

const nav = [
  { href: "/erp", label: "Dashboard" },
  { href: "/erp/hubspot", label: "HubSpot Sync" },
  { href: "/erp/schedule", label: "Schedule" },
  { href: "/erp/projects", label: "Projects" },
  { href: "/erp/employees", label: "Employees" },
  { href: "/erp/buildings", label: "Buildings" },
  { href: "/erp/turnover-requests", label: "Turnover Requests" },
  { href: "/erp/labor-assignments", label: "Labor Assignments" },
  { href: "/erp/projects/new", label: "New Project" },
];

export function ErpNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close menu on navigation
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
        <nav className="flex flex-1 flex-col gap-1 p-3 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-gray-200 p-3">
          <ErpLogoutButton />
        </div>
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
              // X icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // Hamburger icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute left-0 right-0 z-50 border-b border-gray-200 bg-white shadow-lg">
            <nav className="flex flex-col gap-1 p-3 text-sm">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2.5 text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-gray-200 p-3">
              <ErpLogoutButton />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
