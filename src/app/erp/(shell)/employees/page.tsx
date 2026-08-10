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
import { EmployeesFilterBar } from "./EmployeesFilterBar";

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

type PayMode = "HOURLY" | "SALARY" | "OFFSHORE";

// isOffshore is a separate boolean from payType (HOURLY/SALARY) in the
// schema, but the ERP always presents/filters them as one combined
// three-way choice — same derivation EmployeeProfileEditor/NewEmployeeForm
// use for the pay-type toggle on the employee forms themselves.
function payModeOf(e: { payType: string; isOffshore: boolean }): PayMode {
  if (e.isOffshore) return "OFFSHORE";
  return e.payType === "SALARY" ? "SALARY" : "HOURLY";
}

// Every filter/sort link on this page needs to preserve whichever of these
// are currently active — centralized here so each link is one call instead
// of a repeated pile of ternaries.
function employeesHref(params: {
  name?: string;
  compliance?: string;
  backgroundCheck?: string;
  payType?: string;
  sortBy?: string;
  sortDir?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.name) sp.set("name", params.name);
  if (params.compliance) sp.set("compliance", params.compliance);
  if (params.backgroundCheck) sp.set("backgroundCheck", params.backgroundCheck);
  if (params.payType) sp.set("payType", params.payType);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return `/erp/employees${qs ? `?${qs}` : ""}`;
}

const PAY_MODE_OPTIONS: { value: PayMode; label: string }[] = [
  { value: "HOURLY", label: "Hourly" },
  { value: "SALARY", label: "Salary" },
  { value: "OFFSHORE", label: "Offshore" },
];

export default async function EmployeesPage({ searchParams }: PageProps) {
  const qp = await searchParams;
  const nameFilter = firstValue(qp.name).trim().toLowerCase();
  const complianceFilter = firstValue(qp.compliance).trim().toUpperCase();
  const backgroundCheckFilter = firstValue(qp.backgroundCheck).trim().toUpperCase();
  const payTypeRaw = firstValue(qp.payType).trim().toUpperCase();
  const payTypeFilter = payTypeRaw === "HOURLY" || payTypeRaw === "SALARY" || payTypeRaw === "OFFSHORE" ? payTypeRaw : "";
  const sortByRaw = firstValue(qp.sortBy);
  const sortDirRaw = firstValue(qp.sortDir).toLowerCase();
  const sortBy =
    sortByRaw === "hourlyPay" || sortByRaw === "compliance" || sortByRaw === "backgroundCheck"
      ? sortByRaw
      : "name";
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : "asc";
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] } },
  });

  const rows = employees
    .filter((e) => (nameFilter ? `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameFilter) : true))
    .map((e) => {
      const requiredDocs = parseRequiredDocuments(e.requiredDocuments);
      const compliance = evaluateEmployeeCompliance(e.status, requiredDocs, e.documents);
      const backgroundCheck = normalizeBackgroundCheckStatus(e.backgroundCheckStatus);
      const payMode = payModeOf(e);
      return { ...e, compliance, backgroundCheck, payMode };
    })
    .filter((e) => (complianceFilter ? e.compliance === complianceFilter : true))
    .filter((e) => (backgroundCheckFilter ? e.backgroundCheck === backgroundCheckFilter : true))
    .filter((e) => (payTypeFilter ? e.payMode === payTypeFilter : true));

  // Reused by every link below so clicking one filter/sort control never
  // silently drops whatever else is currently applied.
  const currentParams = {
    name: nameFilter,
    compliance: complianceFilter,
    backgroundCheck: backgroundCheckFilter,
    payType: payTypeFilter,
    sortBy,
    sortDir,
  };

  const complianceOrder = { NON_COMPLIANT: 0, NOT_CONFIGURED: 1, COMPLIANT: 2, INACTIVE: 3 };

  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "hourlyPay") {
      const av = a.hourlyPayCents ?? -1;
      const bv = b.hourlyPayCents ?? -1;
      if (av !== bv) return (av - bv) * dir;
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

  const payModeOptions = PAY_MODE_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    href: employeesHref({ ...currentParams, payType: payTypeFilter === opt.value ? "" : opt.value }),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">Employees</h1>

        <div className="mt-3 flex items-center justify-between gap-4">
          <form>
            <input
              name="name"
              defaultValue={nameFilter}
              placeholder="Search by name…"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
            />
            {/* Preserve every other active filter/sort when this form
                submits on its own (e.g. pressing Enter), same reasoning as
                the hidden fields inside EmployeesFilterBar's popover form. */}
            <input type="hidden" name="compliance" value={complianceFilter} />
            <input type="hidden" name="backgroundCheck" value={backgroundCheckFilter} />
            <input type="hidden" name="payType" value={payTypeFilter} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />
          </form>
          <div className="flex items-center gap-2">
            <EmployeesFilterBar
              nameFilter={nameFilter}
              complianceFilter={complianceFilter}
              backgroundCheckFilter={backgroundCheckFilter}
              payTypeFilter={payTypeFilter}
              payModeOptions={payModeOptions}
              sortBy={sortBy}
              sortDir={sortDir}
            />
            <NewEmployeeForm />
          </div>
        </div>
      </div>

      <section className="rounded-lg">
        <div className="overflow-x-auto rounded-lg border border-gray-300">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-100 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-semibold">
                  <Link href={employeesHref({ ...currentParams, sortBy: "name", sortDir: sortBy === "name" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
                    Name
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={employeesHref({ ...currentParams, sortBy: "hourlyPay", sortDir: sortBy === "hourlyPay" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
                    Hourly pay
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={employeesHref({ ...currentParams, sortBy: "compliance", sortDir: sortBy === "compliance" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
                    Compliance
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">
                  <Link href={employeesHref({ ...currentParams, sortBy: "backgroundCheck", sortDir: sortBy === "backgroundCheck" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
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