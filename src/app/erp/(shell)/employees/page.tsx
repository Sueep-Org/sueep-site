import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  evaluateEmployeeCompliance,
  activityStatusBadgeClasses,
  activityStatusLabel,
  type BackgroundCheckStatus,
} from "@/lib/erp/employees";
import { getErpAuth, canSeeFinancials, canEditPayInfo } from "@/lib/erpAuth";
import { NewEmployeeForm } from "./NewEmployeeForm";
import { EmployeesFilterBar } from "./EmployeesFilterBar";

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

function allValues(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];
}

// Date-only inputs (<input type="date">) follow the same convention as
// workDate itself (see src/lib/erp/createLaborEntry.ts) — a fixed Eastern
// offset, not real UTC — so a "worked between" range lines up with the
// calendar day a shift was actually logged under instead of drifting a day
// off near midnight.
function parseWorkedDateOnly(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00-05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatHourlyPay(cents: number | null): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function parseRequiredDocuments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

type PayMode = "HOURLY" | "SALARY" | "OFFSHORE" | "JANITORIAL";

// isOffshore/isJanitorialContract are separate booleans from payType
// (HOURLY/SALARY) in the schema, but the ERP always presents/filters them as
// one combined choice — same derivation EmployeeProfileEditor/NewEmployeeForm
// use for the pay-type toggle on the employee forms themselves. Checked
// before the payType fallback, same precedence as OFFSHORE.
function payModeOf(e: { payType: string; isOffshore: boolean; isJanitorialContract: boolean }): PayMode {
  if (e.isOffshore) return "OFFSHORE";
  if (e.isJanitorialContract) return "JANITORIAL";
  return e.payType === "SALARY" ? "SALARY" : "HOURLY";
}

// Every filter/sort link on this page needs to preserve whichever of these
// are currently active — centralized here so each link is one call instead
// of a repeated pile of ternaries.
function employeesHref(params: {
  name?: string;
  status?: string;
  compliance?: string;
  backgroundCheck?: string;
  payType?: string;
  role?: string[];
  workedFrom?: string;
  workedTo?: string;
  sortBy?: string;
  sortDir?: string;
}): string {
  const sp = new URLSearchParams();
  if (params.name) sp.set("name", params.name);
  if (params.status) sp.set("status", params.status);
  if (params.compliance) sp.set("compliance", params.compliance);
  if (params.backgroundCheck) sp.set("backgroundCheck", params.backgroundCheck);
  if (params.payType) sp.set("payType", params.payType);
  for (const r of params.role ?? []) sp.append("role", r);
  if (params.workedFrom) sp.set("workedFrom", params.workedFrom);
  if (params.workedTo) sp.set("workedTo", params.workedTo);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return `/erp/employees${qs ? `?${qs}` : ""}`;
}

const PAY_MODE_OPTIONS: { value: PayMode; label: string }[] = [
  { value: "HOURLY", label: "Hourly" },
  { value: "SALARY", label: "Salary" },
  { value: "OFFSHORE", label: "Offshore" },
  { value: "JANITORIAL", label: "Janitorial" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export default async function EmployeesPage({ searchParams }: PageProps) {
  // This page had no auth guard at all before — reachable and fully
  // rendered (including the Hourly pay column) for any authenticated ERP
  // session regardless of role. canSeeFinancials matches the role set the
  // nav already restricts the Employees link to (FINANCE_UP).
  const auth = await getErpAuth();
  if (!auth || !canSeeFinancials(auth.role)) redirect("/erp");
  const canSeePay = canEditPayInfo(auth.role);

  const qp = await searchParams;
  const nameFilter = firstValue(qp.name).trim().toLowerCase();
  const statusRaw = firstValue(qp.status).trim().toUpperCase();
  const statusFilter = statusRaw === "ACTIVE" || statusRaw === "INACTIVE" ? statusRaw : "";
  const complianceFilter = firstValue(qp.compliance).trim().toUpperCase();
  const backgroundCheckFilter = firstValue(qp.backgroundCheck).trim().toUpperCase();
  const payTypeRaw = firstValue(qp.payType).trim().toUpperCase();
  const payTypeFilter =
    payTypeRaw === "HOURLY" || payTypeRaw === "SALARY" || payTypeRaw === "OFFSHORE" || payTypeRaw === "JANITORIAL"
      ? payTypeRaw
      : "";
  // Role values are free text (see Employee.role), so the filter is a
  // checklist of the exact distinct values in use today rather than a fixed
  // enum — matched case-insensitively so "Painter/Cleaner" and
  // "painter/cleaner" collapse into one option. See roleOptions below.
  const roleFilter = new Set(allValues(qp.role).map((r) => r.trim().toLowerCase()).filter(Boolean));
  const workedFrom = firstValue(qp.workedFrom).trim();
  const workedTo = firstValue(qp.workedTo).trim();
  const workedFromDate = parseWorkedDateOnly(workedFrom);
  const workedToDate = parseWorkedDateOnly(workedTo);
  // Exclusive upper bound (start of the day after "to") so the "to" date
  // itself is included regardless of what time of day a shift was logged.
  const workedToExclusive = workedToDate ? new Date(workedToDate.getTime() + 24 * 60 * 60 * 1000) : null;
  const sortByRaw = firstValue(qp.sortBy);
  const sortDirRaw = firstValue(qp.sortDir).toLowerCase();
  // Defaults to grouping Active before Inactive (each group alphabetical,
  // see the sort comparator below) rather than a flat alphabetical list.
  // Sorting by hourlyPay when the viewer can't see pay is a minor side
  // channel (row order would still leak relative pay), so it's excluded
  // from the valid values entirely rather than just hiding the column.
  const sortBy =
    (sortByRaw === "hourlyPay" && canSeePay) || sortByRaw === "name"
      ? sortByRaw
      : "activityStatus";
  const sortDir = sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : "asc";
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { documents: { orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }] } },
  });

  // Only hit LaborEntry when a "worked between" bound is actually set —
  // otherwise every employee passes this filter and the query is skipped.
  const workedEmployeeIds =
    workedFromDate || workedToExclusive
      ? new Set(
          (
            await prisma.laborEntry.findMany({
              where: {
                employeeId: { not: null },
                workDate: {
                  ...(workedFromDate ? { gte: workedFromDate } : {}),
                  ...(workedToExclusive ? { lt: workedToExclusive } : {}),
                },
              },
              select: { employeeId: true },
              distinct: ["employeeId"],
            })
          ).map((e) => e.employeeId as string)
        )
      : null;

  // Distinct role values in use today, case-insensitively deduped (first
  // casing seen wins for the display label), for the Role filter checklist —
  // Employee.role is free text, not an enum, so this reflects real data
  // instead of a guessed-at taxonomy.
  const roleOptionsByKey = new Map<string, { value: string; label: string; count: number }>();
  for (const e of employees) {
    const trimmed = e.role?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const existing = roleOptionsByKey.get(key);
    if (existing) existing.count += 1;
    else roleOptionsByKey.set(key, { value: key, label: trimmed, count: 1 });
  }
  const roleOptions = Array.from(roleOptionsByKey.values()).sort((a, b) => a.label.localeCompare(b.label));

  const rows = employees
    .filter((e) => (nameFilter ? `${e.firstName} ${e.lastName}`.toLowerCase().includes(nameFilter) : true))
    .filter((e) => (statusFilter ? e.status === statusFilter : true))
    .filter((e) => (roleFilter.size > 0 ? Boolean(e.role && roleFilter.has(e.role.trim().toLowerCase())) : true))
    .filter((e) => (workedEmployeeIds ? workedEmployeeIds.has(e.id) : true))
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
  const roleFilterList = Array.from(roleFilter);
  const currentParams = {
    name: nameFilter,
    status: statusFilter,
    compliance: complianceFilter,
    backgroundCheck: backgroundCheckFilter,
    payType: payTypeFilter,
    role: roleFilterList,
    workedFrom,
    workedTo,
    sortBy,
    sortDir,
  };

  const activityStatusOrder: Record<string, number> = { ACTIVE: 0, INACTIVE: 1 };

  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "hourlyPay") {
      const av = a.hourlyPayCents ?? -1;
      const bv = b.hourlyPayCents ?? -1;
      if (av !== bv) return (av - bv) * dir;
    } else if (sortBy === "activityStatus") {
      const av = activityStatusOrder[a.status] ?? 0;
      const bv = activityStatusOrder[b.status] ?? 0;
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
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="compliance" value={complianceFilter} />
            <input type="hidden" name="backgroundCheck" value={backgroundCheckFilter} />
            <input type="hidden" name="payType" value={payTypeFilter} />
            {roleFilterList.map((r) => (
              <input key={r} type="hidden" name="role" value={r} />
            ))}
            <input type="hidden" name="workedFrom" value={workedFrom} />
            <input type="hidden" name="workedTo" value={workedTo} />
            <input type="hidden" name="sortBy" value={sortBy} />
            <input type="hidden" name="sortDir" value={sortDir} />
          </form>
          <div className="flex items-center gap-2">
            <EmployeesFilterBar
              nameFilter={nameFilter}
              statusFilter={statusFilter}
              statusOptions={STATUS_OPTIONS}
              complianceFilter={complianceFilter}
              backgroundCheckFilter={backgroundCheckFilter}
              payTypeFilter={payTypeFilter}
              payModeOptions={payModeOptions}
              roleFilter={roleFilterList}
              roleOptions={roleOptions}
              workedFrom={workedFrom}
              workedTo={workedTo}
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
                {canSeePay && (
                  <th className="px-3 py-2 font-semibold">
                    <Link href={employeesHref({ ...currentParams, sortBy: "hourlyPay", sortDir: sortBy === "hourlyPay" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
                      Hourly pay
                    </Link>
                  </th>
                )}
                <th className="px-3 py-2 font-semibold">
                  <Link href={employeesHref({ ...currentParams, sortBy: "activityStatus", sortDir: sortBy === "activityStatus" && sortDir === "asc" ? "desc" : "asc" })} className="hover:text-gray-500">
                    Activity status
                  </Link>
                </th>
                <th className="px-3 py-2 font-semibold">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canSeePay ? 5 : 4} className="px-3 py-8 text-center text-gray-500">
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
                    {canSeePay && <td className="px-3 py-2 text-gray-900">{formatHourlyPay(r.hourlyPayCents)}</td>}
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${activityStatusBadgeClasses(r.status)}`}>
                        {activityStatusLabel(r.status, r.statusSource)}
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