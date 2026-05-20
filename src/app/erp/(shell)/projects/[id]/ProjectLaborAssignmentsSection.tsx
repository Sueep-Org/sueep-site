"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ProjectLaborAssignmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string | null;
  assignedDate: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
};

export type ProjectLaborAssignmentEmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

function employeeName(employee: ProjectLaborAssignmentEmployeeOption) {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

export function ProjectLaborAssignmentsSection({
  projectId,
  initialAssignments,
  employees,
}: {
  projectId: string;
  initialAssignments: ProjectLaborAssignmentRow[];
  employees: ProjectLaborAssignmentEmployeeOption[];
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setAssignments(initialAssignments);
  }, [initialAssignments]);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const employeeId = String(fd.get("employeeId") || "");
    if (!employeeId) {
      setError("Select a laborer.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/erp/projects/${projectId}/labor-assignments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId,
          role: String(fd.get("role") || "").trim() || undefined,
          assignedDate: String(fd.get("assignedDate") || "") || undefined,
          startDate: String(fd.get("startDate") || "") || undefined,
          endDate: String(fd.get("endDate") || "") || undefined,
          notes: String(fd.get("notes") || "").trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        employeeId?: string;
        employee?: { id: string; firstName: string; lastName: string };
        role?: string | null;
        assignedDate?: string | null;
        startDate?: string | null;
        endDate?: string | null;
        notes?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Failed to assign laborer");
        setLoading(false);
        return;
      }
      const employee = employees.find((e) => e.id === employeeId);
      const row: ProjectLaborAssignmentRow = {
        id: data.id!,
        employeeId: data.employee?.id ?? data.employeeId ?? employeeId,
        employeeName: data.employee
          ? `${data.employee.firstName} ${data.employee.lastName}`.trim()
          : employee
            ? employeeName(employee)
            : employeeId,
        role: data.role ?? null,
        assignedDate: data.assignedDate ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        notes: data.notes ?? null,
      };
      setAssignments((prev) => [row, ...prev]);
      e.currentTarget.reset();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onRemove(id: string) {
    if (!confirm("Remove this laborer from the project?")) return;
    const res = await fetch(`/api/erp/project-labor-assignments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
  }

  const activeEmployees = employees.filter((employee) => employee.status !== "INACTIVE");
  const assignedEmployeeIds = new Set(assignments.map((assignment) => assignment.employeeId));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assigned laborers</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Laborer</th>
                <th className="py-2 pr-2 font-medium">Role</th>
                <th className="py-2 pr-2 font-medium">Start</th>
                <th className="py-2 pr-2 font-medium">End</th>
                <th className="py-2 font-medium">Notes</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    No laborers assigned to this project yet.
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="py-2 pr-2 font-medium text-gray-900">{assignment.employeeName}</td>
                    <td className="py-2 pr-2 text-gray-500">{assignment.role || "-"}</td>
                    <td className="py-2 pr-2 text-gray-600">{displayDate(assignment.startDate)}</td>
                    <td className="py-2 pr-2 text-gray-600">{displayDate(assignment.endDate)}</td>
                    <td className="py-2 text-gray-500">{assignment.notes || "-"}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onRemove(assignment.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onAdd} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Assign laborer</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-2">
            <label className={label} htmlFor="pla-employee">
              Laborer *
            </label>
            <select id="pla-employee" name="employeeId" required className={input}>
              <option value="" disabled>
                Select laborer...
              </option>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id} disabled={assignedEmployeeIds.has(employee.id)}>
                  {employeeName(employee)}
                  {assignedEmployeeIds.has(employee.id) ? " (already assigned)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="pla-role">
              Role
            </label>
            <input id="pla-role" name="role" className={input} placeholder="Cleaner, lead, helper..." />
          </div>
          <div>
            <label className={label} htmlFor="pla-assigned">
              Assigned date
            </label>
            <input id="pla-assigned" name="assignedDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="pla-start">
              Start date
            </label>
            <input id="pla-start" name="startDate" type="date" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="pla-end">
              End date
            </label>
            <input id="pla-end" name="endDate" type="date" className={input} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={label} htmlFor="pla-notes">
              Notes
            </label>
            <input id="pla-notes" name="notes" className={input} placeholder="Units, access notes, scope..." />
          </div>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Assigning..." : "Assign laborer"}
        </button>
      </form>
    </div>
  );
}
