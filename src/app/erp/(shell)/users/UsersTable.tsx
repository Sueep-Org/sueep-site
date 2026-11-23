"use client";

import { useState, type FormEvent } from "react";
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
const PM_EST: ErpRole[] = [...PM_LEVEL, "SALES", "ESTIMATION"];
const ADMIN_BM: ErpRole[] = ["ADMIN", "BUSINESS_MANAGER"];
const NOT_EMPLOYEE: ErpRole[] = ROLES.filter((r) => r !== "EMPLOYEE");

/**
 * What each role can do, as the code enforces it (checked 2026-11-23 against
 * src/lib/erpAuth.ts and each page's own check). This table only describes
 * the rules; change the code first, then this. Section rows have no roles.
 */
type PermissionRow = { label: string; roles: ErpRole[] } | { section: string };
const PERMISSION_ROWS: PermissionRow[] = [
  { section: "Projects" },
  { label: "Dashboard, projects and schedule", roles: ALL_ROLES },
  { label: "Projects: only their own by default (can switch to all)", roles: ["SUPERVISOR"] },
  { label: "Project pages: only the Labor and Checklist tabs", roles: ["EMPLOYEE"] },
  { label: "Create projects", roles: PM_EST },
  { label: "Add and edit labor on projects", roles: NOT_EMPLOYEE },
  { label: "Log hours on a building", roles: [...PM_UP, "SUPERVISOR"] },
  { label: "Assign crews on the schedule", roles: ALL_ROLES },
  { label: "Mark a day complete on the schedule", roles: [...PM_UP, "SUPERVISOR"] },
  { label: "Mark a whole job complete (project page only; Supervisors can finish a turnover unit from its Labor tab)", roles: PM_EST },
  { label: "Mark a whole change order complete (calendar or its page)", roles: ALL_ROLES },
  { label: "Set sub pay on the schedule", roles: PM_UP },
  { label: "Drag projects on the timeline to change dates", roles: PM_LEVEL },
  { label: "Contractors, Proposals and Quality Checks tabs on projects", roles: PM_EST },
  { label: "See contract value, costs and margins", roles: PM_EST },
  { label: "See margin as a percent only", roles: ["SUPERVISOR"] },
  { label: "Edit pricing packages", roles: PM_EST },
  { label: "Override the quality checklist, safety check, background check and time off limits", roles: PM_UP },
  { label: "Sub Reviews", roles: PM_LEVEL },
  { label: "Deals board", roles: PM_EST },
  { label: "Deals board settings (shared views, stage rules, bulk edit)", roles: ADMIN_BM },
  { label: "Estimator", roles: PM_EST },
  { label: "HubSpot sync", roles: PM_LEVEL },
  { label: "Janitorial", roles: PM_UP },
  { label: "Do janitorial quality checks", roles: ["ADMIN", "PROJECT_MANAGER"] },
  { label: "Listed as PM on the schedule", roles: ["PROJECT_MANAGER"] },

  { section: "Clients" },
  { label: "Companies, Buildings list, Property Managers and Win/Loss", roles: PM_UP },
  { label: "Edit companies and billing overrides", roles: ADMIN_BM },

  { section: "Finance" },
  { label: "Project Billing", roles: PM_UP },
  { label: "Invoices", roles: PM_LEVEL },
  { label: "Ready to Send (approve and send invoices, Auto-draft)", roles: ADMIN_BM },
  { label: "QuickBooks page", roles: ADMIN_BM },
  { label: "Connect QuickBooks, switch invoices between QuickBooks and HubSpot", roles: ["ADMIN"] },
  { label: "Compensation: Payroll and Offshore Payroll", roles: PM_LEVEL },
  { label: "Compensation: Commission and Reimbursements", roles: PM_UP },
  { label: "Insurance & COIs", roles: PM_UP },
  { label: "Finance dashboard and Overhead", roles: PM_LEVEL },
  { label: "Ad spend", roles: PM_UP },
  { label: "Change cash forecast payment terms", roles: ADMIN_BM },

  { section: "Team" },
  { label: "Employees", roles: PM_UP },
  { label: "Edit employee pay, see SSNs", roles: PM_UP },
  { label: "Approve time off (an Admin approves it for PM-level people)", roles: PM_LEVEL },
  { label: "Recruitment (field)", roles: PM_UP },
  { label: "Recruitment: office hiring and offer letters", roles: PM_LEVEL },
  { label: "Edit offer letter templates", roles: ADMIN_BM },
  { label: "Contractors list", roles: PM_UP },
  { label: "A contractor's own page", roles: PM_EST },

  { section: "Admin" },
  { label: "Management calendar (all of it, and editing)", roles: PM_LEVEL },
  { label: "Management calendar, Bids only (view)", roles: ["SALES", "ESTIMATION"] },
  { label: "Settings", roles: ADMIN_BM },
  { label: "Settings: Holidays", roles: ["ADMIN"] },
  { label: "Sueep Info", roles: PM_LEVEL },
  { label: "Sueep Info access log", roles: ["ADMIN"] },
  { label: "Email Settings", roles: PM_LEVEL },
  { label: "Franchise inquiries", roles: PM_LEVEL },
  { label: "User Management: subs' and property managers' pages", roles: PM_LEVEL },
  { label: "User Management: staff and roles", roles: ["ADMIN"] },
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

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<ErpRole>("EMPLOYEE");
  const [adding, setAdding] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/erp/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail, role: newRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { user?: User; existingLogin?: boolean; emailSent?: boolean; error?: string };
      if (!res.ok || !data.user) { setError(data.error ?? "Couldn't add user"); return; }
      setUsers((prev) => [...prev, data.user!]);
      setNewEmail("");
      setNewRole("EMPLOYEE");
      if (data.existingLogin) {
        toast(`${data.user.email} added. They already have a login, so they sign in with their current password.`);
      } else if (data.emailSent) {
        toast(`${data.user.email} added. They've been emailed a link to set their password.`);
      } else {
        toast(`${data.user.email} added, but the password email failed. Use "Send password email" to retry.`, "error");
      }
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function sendPasswordEmail(userId: string, email: string) {
    setSendingEmail(userId);
    try {
      const res = await fetch(`/api/erp/users/${userId}/password-email`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { toast(data.error ?? "Couldn't send the email", "error"); return; }
      toast(`Password email sent to ${email}.`);
    } catch {
      toast("Network error", "error");
    } finally {
      setSendingEmail(null);
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
      <form onSubmit={(e) => void addUser(e)} className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-medium text-gray-700">
          Email
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="name@sueep.com"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          Role
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as ErpRole)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add user"}
        </button>
        <p className="w-full text-xs text-gray-500">They get an email to set their password, then sign in with this role.</p>
      </form>

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
                  <td className="space-x-4 whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      type="button"
                      disabled={isBusy || sendingEmail === user.id}
                      onClick={() => void sendPasswordEmail(user.id, user.email)}
                      className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
                    >
                      {sendingEmail === user.id ? "Sending…" : "Send password email"}
                    </button>
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
          <p className="py-8 text-center text-sm text-gray-500">No users yet. Add one above.</p>
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
              {PERMISSION_ROWS.map((row) =>
                "section" in row ? (
                  <tr key={row.section}>
                    <td colSpan={ROLES.length + 1} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {row.section}
                    </td>
                  </tr>
                ) : (
                  <tr key={row.label} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-600">{row.label}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="py-2 px-3 text-center">
                        {row.roles.includes(r)
                          ? <span className="inline-block h-4 w-4 rounded-full bg-emerald-500" title="Access granted" />
                          : <span className="inline-block h-4 w-4 rounded-full bg-gray-200" title="No access" />}
                      </td>
                    ))}
                  </tr>
                ),
              )}
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
