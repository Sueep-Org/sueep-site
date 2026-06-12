"use client";

import { useState } from "react";

const ROLES = ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR", "ESTIMATION", "EMPLOYEE"] as const;
type ErpRole = (typeof ROLES)[number];

const ROLE_LABELS: Record<ErpRole, string> = {
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  SUPERVISOR: "Supervisor",
  ESTIMATION: "Estimation",
  EMPLOYEE: "Employee",
};

type User = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

export function UsersTable({ users: initialUsers, currentUserId }: { users: User[]; currentUserId: string }) {
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
    if (!window.confirm(`Remove ${email} from the ERP? They will be re-added as Employee on next login.`)) return;
    setDeleting(userId);
    setError("");
    try {
      const res = await fetch(`/api/erp/users/${userId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error ?? "Delete failed"); setDeleting(null); return; }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      setError("Network error");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
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
    </div>
  );
}
