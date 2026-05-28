import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { complianceBadgeClasses, complianceLabel, evaluateEmployeeCompliance } from "@/lib/erp/employees";
import { NewEmployeeForm } from "./NewEmployeeForm";

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
  const sortByRaw = firstValue(qp.sortBy);
  const sortDirRaw = firstValue(qp.sortDir).toLowerCase();
  const sortBy = sortByRaw === "hourlyPay" || sortByRaw === "defaultProject" || sortByRaw === "compliance" ? sortByRaw : "name";
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
      return { ...e, compliance };
    })
    .filter((e) => (complianceFilter ? e.compliance === complianceFilter : true));

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
    }
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  const compliantCount = rows.filter((r) => r.compliance === "COMPLIANT").length;
  const nonCompliantCount = rows.filter((r) => r.compliance === "NON_COMPLIANT").length;
  const notConfiguredCount = rows.filter((r) => r.compliance === "NOT_CONFIGURED").length;

  const inactiveCount = employees.filter((e) => e.status === "INACTIVE").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">Employees</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track compliance completion, documentation, and general employee information.
        </p>
      </div>

      <hr className="border-pink-200" />

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/erp/employees"
          className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          <span className="font-medium text-gray-700">{rows.length}</span>
          <span className="text-gray-400 text-xs">total</span>
        </Link>
        <Link
          href="/erp/employees?compliance=COMPLIANT"
          className="flex items-center gap-2.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm hover:bg-emerald-100 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-emerald-700">{compliantCount}</span>
          <span className="text-emerald-600 text-xs">compliant</span>
        </Link>
        <Link
          href="/erp/employees?compliance=NON_COMPLIANT"
          className="flex items-center gap-2.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm hover:bg-red-100 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-medium text-red-700">{nonCompliantCount}</span>
          <span className="text-red-600 text-xs">non-compliant</span>
        </Link>
        <Link
          href="/erp/employees?compliance=NOT_CONFIGURED"
          className="flex items-center gap-2.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm hover:bg-amber-100 transition-colors"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="font-medium text-amber-700">{notConfiguredCount}</span>
          <span className="text-amber-600 text-xs">not configured</span>
        </Link>
        {inactiveCount > 0 && (
          <Link
            href="/erp/employees?compliance=INACTIVE"
            className="flex items-center gap-2.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm hover:bg-gray-100 transition-colors"
          >
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            <span className="font-medium text-gray-500">{inactiveCount}</span>
            <span className="text-gray-400 text-xs">inactive</span>
          </Link>
        )}
        <NewEmployeeForm />
      </div>

      <hr className="border-pink-200" />

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
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-b border-pink-300 bg-pink-600 text-xs uppercase text-white">
              <tr>
                <th className="px-3 py-2 font-medium">
                  <Link href={`/erp/employees?sortBy=name&sortDir=${sortBy === "name" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-900">
                    Name
                  </Link>
                </th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">
                  <Link href={`/erp/employees?sortBy=hourlyPay&sortDir=${sortBy === "hourlyPay" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-900">
                    Hourly pay
                  </Link>
                </th>
                <th className="px-3 py-2 font-medium">
                  <Link href={`/erp/employees?sortBy=defaultProject&sortDir=${sortBy === "defaultProject" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-900">
                    Default project
                  </Link>
                </th>
                <th className="px-3 py-2 font-medium">Start date</th>
                <th className="px-3 py-2 font-medium">
                  <Link href={`/erp/employees?sortBy=compliance&sortDir=${sortBy === "compliance" && sortDir === "asc" ? "desc" : "asc"}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ""}${nameFilter ? `&name=${encodeURIComponent(nameFilter)}` : ""}`} className="hover:text-gray-900">
                    Compliance
                  </Link>
                </th>
                <th className="px-3 py-2 font-medium">Docs on file</th>
                <th className="px-3 py-2 font-medium">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    No employees added yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="even:bg-gray-50 odd:bg-white hover:bg-pink-50 transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/erp/employees/${r.id}`} className="font-medium text-pink-600 hover:underline">
                        {r.firstName} {r.lastName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{r.role || "—"}</td>
                    <td className="px-3 py-2 text-gray-900">{formatHourlyPay(r.hourlyPayCents)}</td>
                    <td className="px-3 py-2 text-gray-900">{r.defaultProject || "—"}</td>
                    <td className="px-3 py-2 text-gray-900">{r.hireDate ? new Date(r.hireDate).toLocaleDateString() : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${complianceBadgeClasses(r.compliance)}`}>
                        {complianceLabel(r.compliance)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-900">{r.documents.length}</td>
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