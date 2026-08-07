import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  complianceBadgeClasses,
  complianceLabel,
  evaluateEmployeeCompliance,
  backgroundCheckBadgeClasses,
  backgroundCheckLabel,
  type BackgroundCheckStatus,
} from "@/lib/erp/employees";
import { NewEmployeeForm } from "./NewEmployeeForm";

const BACKGROUND_CHECK_ORDER: Record<BackgroundCheckStatus, number> = {
  FAILED: 0,
  PENDING: 1,
  NOT_DONE: 2,
  PASSED: 3,
};

function normalizeBackgroundCheckStatus(status: string | null): BackgroundCheckStatus {
  return status === "PASSED" || status === "FAILED" || status === "PENDING" ? status : "NOT_DONE";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function formatHourlyPay(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function parseRequiredDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const qp = await searchParams;
  const projectFilter = firstValue(qp.project).trim().toLowerCase();
  const nameFilter = firstValue(qp.name).trim().toLowerCase();
  const complianceFilter = firstValue(qp.compliance).trim().toUpperCase();
  const backgroundCheckFilter = firstValue(qp.backgroundCheck).trim().toUpperCase();
  const sortByRaw = firstValue(qp.sortBy);
  const sortDirRaw = firstValue(qp.sortDir).toLowerCase();
  const sortBy =
    sortByRaw === "hourlyPay" || sortByRaw === "defaultProject" || sortByRaw === "compliance" || sortByRaw === "backgroundCheck"
      ? sortByRaw
      : "name";
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : "asc";
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] } },
  });

  const rows = employees
    .filter((e) => (projectFilter ? (e.defaultProject || "").toLowerCase().includes(projectFilter) : true))
    .filter((e) => (nameFilter ? `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameFilter) : true))
    .map((e) => {
      const requiredDocs = parseRequiredDocuments(e.requiredDocuments);
      const compliance = evaluateEmployeeCompliance(e.status, requiredDocs, e.documents);
      const backgroundCheck = normalizeBackgroundCheckStatus(e.backgroundCheckStatus);
      return { ...e, compliance, backgroundCheck };
    })
    .filter((e) => (complianceFilter ? e.compliance === complianceFilter : true))
    .filter((e) => (backgroundCheckFilter ? e.backgroundCheck === backgroundCheckFilter : true));

  const complianceOrder = { NON_COMPLIANT: 0, NOT_CONFIGURED: 1, COMPLIANT: 2, INACTIVE: 3 };

  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "hourlyPay") {
      const av = a.hourlyPayCents ?? -1;
      const bv = b.hourlyPayCents ?? -1;
      if (av !== bv) return (av - bv) * dir;
    } else if (sortBy === "defaultProject") {
      const av = (a.defaultProject || "").toLowerCase();
      const bv = (b.defaultProject || "").toLowerCase();
      if (av !== bv) return av.localeCompare(bv) * dir;
    } else if (sortBy === "compliance") {
      const av = complianceOrder[a.compliance];
      const bv = complianceOrder[b.compliance];
      if (av !== bv) return (av - bv) * dir;
    } else if (sortBy === "backgroundCheck") {
      const av = BACKGROUND_CHECK_ORDER[a.backgroundCheck];
      const bv = BACKGROUND_CHECK_ORDER[b.backgroundCheck];
      if (av !== bv) return (av - bv) * dir;
    }
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return (
    <div className="space-y-6">
      <NewEmployeeForm title={<h1 className="text-2xl font-bold text-pink-600">Employees</h1>} />

      <section className="rounded-lg">
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600" htmlFor="nameFilter">
              Search by name
            </label>
            <input
              id="nameFilter"
              name="name"
              defaultValue={nameFilter}
              placeholder="e.g. John Smith"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600" htmlFor="projectFilter">
              Filter by project
            </label>
            <input
              id="projectFilter"
              name="project"
              defaultValue={projectFilter}
              placeholder="e.g. UDR"
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600" htmlFor="complianceFilter">
              Compliance
            </label>
            <select
              id="complianceFilter"
              name="compliance"
              defaultValue={complianceFilter}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            >
              <option value="">All</option>
              <option value="COMPLIANT">Compliant</option>
              <option value="NON_COMPLIANT">Non-compliant</option>
              <option value="NOT_CONFIGURED">Not configured</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-600" htmlFor="backgroundCheckFilter">
              Background check
            </label>
            <select
              id="backgroundCheckFilter"
              name="backgroundCheck"
              defaultValue={backgroundCheckFilter}
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            >
              <option value="">All</option>
              <option value="PASSED">Passed</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="NOT_DONE">Not done</option>
            </select>
          </div>
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="sortDir" value={sortDir} />
          <button type="submit" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 hover:bg-gray-50">
            Apply
          </button>
          <Link href="/erp/employees" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 hover:bg-gray-50">
            Clear
          </Link>
        </form>
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-300">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-100 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  <Link href={`/erp/employees?sortBy=name&sortDir=${sortBy === "name" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-500">
                    Name
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={`/erp/employees?sortBy=hourlyPay&sortDir=${sortBy === "hourlyPay" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-500">
                    Hourly pay
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={`/erp/employees?sortBy=compliance&sortDir=${sortBy === "compliance" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-500">
                    Compliance
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={`/erp/employees?sortBy=backgroundCheck&sortDir=${sortBy === "backgroundCheck" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-500">
                    Background Check
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No employees added yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="even:bg-gray-50 odd:bg-white hover:bg-gray-100 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/erp/employees/${r.id}`} className="font-medium text-gray-800 hover:underline">
                        {r.firstName} {r.lastName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{r.role || "—"}</td>
                    <td className="px-3 py-2 text-gray-900">{formatHourlyPay(r.hourlyPayCents)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${complianceBadgeClasses(r.compliance)}`}>
                        {complianceLabel(r.compliance)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${backgroundCheckBadgeClasses(r.backgroundCheck)}`}>
                        {backgroundCheckLabel(r.backgroundCheck)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.email || r.phone || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}