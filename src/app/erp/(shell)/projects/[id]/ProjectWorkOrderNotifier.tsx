"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

type ContactRow = {
  id: string;
  fullName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
};

type EmployeeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
};

type Props = {
  projectId: string;
  jobTitle: string;
  description: string | null;
  projectDateIso: string | null;
  contacts: ContactRow[];
  employees: EmployeeRow[];
};

function getDetailLine(description: string | null, label: string) {
  const prefix = `${label}:`;
  return (
    (description || "")
      .split(/\r?\n/)
      .find((line) => line.trim().toLowerCase().startsWith(prefix.toLowerCase()))
      ?.replace(new RegExp(`^${label}:\\s*`, "i"), "")
      .trim() || ""
  );
}

function extractServiceType(description: string | null): string {
  if (!description) return "";
  const fromLabel = getDetailLine(description, "Service Type");
  if (fromLabel) return fromLabel;
  const trimmed = description.trim();
  if ((SERVICE_TYPE_OPTIONS as readonly string[]).includes(trimmed)) return trimmed;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length === 1 && !lines[0].includes(":")) return lines[0];
  return "";
}

function formatContacts(contacts: ContactRow[]): string {
  return contacts
    .map((c) => {
      const parts: string[] = [c.fullName];
      if (c.role) parts.push(c.role);
      if (c.email) parts.push(c.email);
      if (c.phone) parts.push(c.phone);
      return parts.join(" · ");
    })
    .join("\n");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function empLabel(emp: EmployeeRow) {
  return `${emp.firstName} ${emp.lastName}`.trim();
}

function EmployeeSearchDropdown({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = employees.find((e) => e.id === value);
  const displayName = selected ? empLabel(selected) : "";

  const filtered = query.trim()
    ? employees.filter((e) => empLabel(e).toLowerCase().includes(query.toLowerCase()) || (e.email || "").toLowerCase().includes(query.toLowerCase()))
    : employees;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={inputCls}
        placeholder={displayName || "Search by name or email…"}
        value={open ? query : displayName}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No employees found</li>
          ) : (
            filtered.map((emp) => (
              <li
                key={emp.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(emp.id); }}
                className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
              >
                <span className="font-medium">{empLabel(emp)}</span>
                {emp.email && <span className="ml-2 text-gray-400 text-xs">{emp.email}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function ProjectWorkOrderNotifier({
  projectId,
  jobTitle,
  description,
  projectDateIso,
  contacts,
  employees,
}: Props) {
  const initialAddress = useMemo(() => getDetailLine(description, "Address"), [description]);
  const initialServiceType = useMemo(() => extractServiceType(description), [description]);
  const initialContacts = useMemo(() => formatContacts(contacts), [contacts]);
  const initialStartDate = useMemo(() => formatDate(projectDateIso), [projectDateIso]);

  const isKnownServiceType = (SERVICE_TYPE_OPTIONS as readonly string[]).includes(initialServiceType);

  const [projectName, setProjectName] = useState(jobTitle);
  const [siteAddress, setSiteAddress] = useState(initialAddress);
  const [contactsText, setContactsText] = useState(initialContacts);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [serviceTypeSelected, setServiceTypeSelected] = useState(
    initialServiceType && isKnownServiceType ? initialServiceType : initialServiceType ? "__other__" : "",
  );
  const [serviceTypeCustom, setServiceTypeCustom] = useState(
    initialServiceType && !isKnownServiceType ? initialServiceType : "",
  );
  const [notes, setNotes] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const activeEmployeesWithEmail = employees.filter(
    (e) => e.status !== "INACTIVE" && e.email,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!selectedEmployeeId) {
      setError("Please select an employee to notify.");
      return;
    }

    setLoading(true);
    try {
      const serviceType = serviceTypeSelected === "__other__" ? serviceTypeCustom.trim() : serviceTypeSelected;
      const res = await fetch(`/api/erp/projects/${projectId}/send-work-order-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          projectName,
          siteAddress,
          contacts: contactsText,
          startDate,
          serviceType,
          notes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to send email");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Work Order</h2>
        {success && (
          <span className="text-xs font-medium text-green-600">Work order sent successfully.</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="wo-project-name">
            Project Name
          </label>
          <input
            id="wo-project-name"
            type="text"
            className={inputCls}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Project name"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="wo-address">
            Project Site Address
          </label>
          <input
            id="wo-address"
            type="text"
            className={inputCls}
            value={siteAddress}
            onChange={(e) => setSiteAddress(e.target.value)}
            placeholder="123 Main St, City, State"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="wo-start-date">
            Starting Date (Estimated)
          </label>
          <input
            id="wo-start-date"
            type="text"
            className={inputCls}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="e.g. June 15, 2025"
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="wo-service-type">
            Service Type
          </label>
          <select
            id="wo-service-type"
            className={inputCls}
            value={serviceTypeSelected}
            onChange={(e) => setServiceTypeSelected(e.target.value)}
          >
            <option value="">— None —</option>
            {SERVICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
            <option value="__other__">Other…</option>
          </select>
          {serviceTypeSelected === "__other__" && (
            <input
              type="text"
              className={inputCls}
              value={serviceTypeCustom}
              onChange={(e) => setServiceTypeCustom(e.target.value)}
              placeholder="Describe the work"
            />
          )}
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="wo-contacts">
            Main Point of Contacts
          </label>
          <textarea
            id="wo-contacts"
            rows={3}
            className={inputCls}
            value={contactsText}
            onChange={(e) => setContactsText(e.target.value)}
            placeholder="Name · Role · email@example.com · phone"
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="wo-notes">
            Project Details / Notes for Project Manager
          </label>
          <textarea
            id="wo-notes"
            rows={4}
            className={inputCls}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details, access instructions, special requirements…"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Notify Employee
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 items-end">
          <div>
            <label className={labelCls}>
              Select employee to email
            </label>
            <EmployeeSearchDropdown
              employees={activeEmployeesWithEmail}
              value={selectedEmployeeId}
              onChange={setSelectedEmployeeId}
            />
          </div>

          <div>
            {error && (
              <p className="mb-2 text-xs text-red-500" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !selectedEmployeeId}
              className="w-full rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send Work Order"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
