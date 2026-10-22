"use client";

import { useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";

const ROLES = ["ADMIN", "PROJECT_MANAGER", "BUSINESS_MANAGER", "SALES", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"] as const;
type ErpRole = (typeof ROLES)[number];

const ROLE_LABELS: Record<ErpRole, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  BUSINESS_MANAGER: "Business Manager",
  SALES: "Sales",
  SUPERVISOR: "Supervisor",
  ESTIMATION: "Estimation",
  EMPLOYEE: "Employee",
};

const ALL_ROLES: ErpRole[] = [...ROLES];
// Same set as PM_LEVEL_ROLES in src/lib/erpRoles.ts.
const PM_LEVEL: ErpRole[] = ["ADMIN", "PROJECT_MANAGER", "BUSINESS_MANAGER"];
const PM_UP: ErpRole[] = [...PM_LEVEL, "SALES"];
const FIELD: ErpRole[] = [...PM_LEVEL, "SALES", "SUPERVISOR"];
const PM_EST: ErpRole[] = [...PM_LEVEL, "SALES", "ESTIMATION"];

const PERMISSION_ROWS: { label: string; roles: ErpRole[] }[] = [
  { label: "Dashboard", roles: ALL_ROLES },
  { label: "View projects", roles: ALL_ROLES },
  { label: "View schedule", roles: ALL_ROLES },
  { label: "Create new project", roles: PM_EST },
  { label: "Add / edit labor logs", roles: FIELD },
  { label: "Labor assignments", roles: FIELD },
  { label: "Quality checks", roles: FIELD },
  { label: "Contractor assignments", roles: PM_UP },
  { label: "View financials (contract value, costs)", roles: PM_UP },
  { label: "Employees", roles: PM_UP },
  // Payroll/Offshore Payroll: same set as canSeePayroll in src/lib/erpAuth.ts,
  // the one place Sales is cut out of the money pages.
  { label: "Payroll", roles: PM_LEVEL },
  { label: "Offshore Payroll", roles: PM_LEVEL },
  { label: "Commission & reimbursements", roles: PM_UP },
  { label: "Project billing", roles: PM_UP },
  { label: "Ready to send (approve invoices)", roles: ["ADMIN", "BUSINESS_MANAGER"] },
  { label: "Janitorial contracts", roles: PM_UP },
  { label: "Property managers", roles: PM_UP },
  { label: "Companies (view, pick on buildings and projects)", roles: PM_UP },
  { label: "Edit companies and billing overrides", roles: ["ADMIN", "BUSINESS_MANAGER"] },
  { label: "Win/loss reports and GC scorecards", roles: PM_UP },
  { label: "Insurance & COIs", roles: PM_UP },
  { label: "Recruitment", roles: PM_UP },
  { label: "Contractor verification", roles: PM_UP },
  { label: "AI Estimator", roles: PM_EST },
  { label: "Edit employee pay info", roles: PM_UP },
  { label: "Finance dashboard", roles: PM_LEVEL },
  { label: "Change cash forecast payment terms", roles: ["ADMIN", "BUSINESS_MANAGER"] },
  { label: "Approve time off", roles: PM_LEVEL },
  { label: "Management calendar", roles: PM_LEVEL },
  { label: "Company info", roles: PM_LEVEL },
  { label: "Notification settings", roles: PM_LEVEL },
  { label: "Listed as PM on the schedule", roles: ["PROJECT_MANAGER"] },
  { label: "Janitorial quality checks (doing them)", roles: ["ADMIN", "PROJECT_MANAGER"] },
  { label: "User management", roles: ["ADMIN"] },
];

type User = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function UsersTable({ users: initialUsers, currentUserId }: { users: User[]; currentUserId: string }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [users, setUsers] = useState(initialUsers);
  const [updating, setUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function changeRole(userId: string, role: string) {
    setUpdating(userId);
    setError("");
    try {
      const res = await fetch(`/api/erp/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as { user?: User; error?: string };
      if (!res.ok) { setError(data.error ?? "Update failed"); return; }
      if (data.user) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.user!.role } : u)));
      }
    } catch {
      setError("Network error");
    } finally {
      setUpdating(null);
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (!(await confirm({ message: `Remove ${email} from the ERP? They will be re-added as Employee on next login.` }))) return;
    setDeleting(userId);
    try {
      const res = await fetch(`/api/erp/users/${userId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast(data.error ?? "Delete failed", "error"); setDeleting(null); return; }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast(`${email} removed.`);
    } catch {
      toast("Network error", "error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Email</th>
              <th className="px-4 py-2.5 text-left font-semibold">Role</th>
              <th className="px-4 py-2.5 text-left font-semibold">Joined</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              const isBusy = updating === user.id || deleting === user.id;
              return (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {user.email}
                    {isSelf ? <span className="ml-2 rounded-full bg-pink-100 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">You</span> : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={user.role}
                      disabled={isSelf || isBusy}
                      onChange={(e) => void changeRole(user.id, e.target.value)}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    {updating === user.id ? <span className="ml-2 text-xs text-gray-400">Saving…</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!isSelf && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void deleteUser(user.id, user.email)}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {deleting === user.id ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">No users yet. Users appear here on first login.</p>
        )}
      </div>

      {/* Role permissions key */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Role Permissions</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-2 pr-4 text-left font-semibold text-gray-700">Feature</th>
                {ROLES.map((r) => (
                  <th key={r} className="pb-2 px-3 text-center font-semibold text-gray-700">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PERMISSION_ROWS.map(({ label, roles }) => (
                <tr key={label} className="hover:bg-gray-50">
                  <td className="py-2 pr-4 text-gray-600">{label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="py-2 px-3 text-center">
                      {roles.includes(r)
                        ? <span className="inline-block h-4 w-4 rounded-full bg-emerald-500" title="Access granted" />
                        : <span className="inline-block h-4 w-4 rounded-full bg-gray-200" title="No access" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" /> Access</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-gray-200" /> No access</span>
        </div>
      </div>
    </div>
  );
}
