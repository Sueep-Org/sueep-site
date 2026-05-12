import Link from "next/link";
import { ErpBrandLogo } from "@/app/erp/components/ErpBrandLogo";
import { ErpLogoutButton } from "./ErpLogoutButton";

/** Neon cold start / Prisma can exceed default on first request after idle. */
export const maxDuration = 60;

const nav = [
  { href: "/erp", label: "Dashboard" },
  { href: "/erp/hubspot", label: "HubSpot sync" },
  { href: "/erp/schedule", label: "Schedule" },
  { href: "/erp/projects", label: "Projects" },
  { href: "/erp/employees", label: "Employees" },
  { href: "/erp/projects/new", label: "New project" },
];

export default function ErpShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
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
      <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
