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

export type WorkOrderRecord = {
  projectName: string;
  siteAddress: string | null;
  contacts: string | null;
  startDate: string | null;
  serviceType: string | null;
  notes: string | null;
  lastSentToName: string | null;
  lastSentAt: string | null;
};

type Props = {
  projectId: string;
  // Fallback defaults (used only if no saved record exists)
  jobTitle: string;
  description: string | null;
  projectDateIso: string | null;
  contacts: ContactRow[];
  employees: EmployeeRow[];
  savedRecord: WorkOrderRecord | null;
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


function resolveServiceTypeState(st: string | null): { selected: string; custom: string } {
  const val = st ?? "";
  if (!val) return { selected: "", custom: "" };
  if ((SERVICE_TYPE_OPTIONS as readonly string[]).includes(val)) return { selected: val, custom: "" };
  return { selected: "__other__", custom: val };
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
    ? employees.filter(
        (e) =>
          empLabel(e).toLowerCase().includes(query.toLowerCase()) ||
          (e.email || "").toLowerCase().includes(query.toLowerCase()),
      )
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
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No employees found</li>
          ) : (
            filtered.map((emp) => (
              <li
                key={emp.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(emp.id);
                }}
                className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
              >
                <span className="font-medium">{empLabel(emp)}</span>
                {emp.email && <span className="ml-2 text-xs text-gray-400">{emp.email}</span>}
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
  savedRecord,
}: Props) {
  // Derive fallback values from project fields (used when no saved record exists)
  const fallbackAddress = useMemo(() => getDetailLine(description, "Address"), [description]);
  const fallbackServiceType = useMemo(() => extractServiceType(description), [description]);
  const fallbackContacts = useMemo(() => formatContacts(contacts), [contacts]);
  // Keep as YYYY-MM-DD for the date picker — no formatting
  const fallbackStartDate = projectDateIso ? projectDateIso.slice(0, 10) : null;

  // Prefer saved record, fall back to derived values
  const initName = savedRecord?.projectName ?? jobTitle;
  const initAddress = savedRecord?.siteAddress ?? fallbackAddress;
  const initContacts = savedRecord?.contacts ?? fallbackContacts;
  const initStartDateRaw = savedRecord?.startDate ?? fallbackStartDate;
  // If stored value is YYYY-MM-DD it's a precise date; anything else is "other"
  const initStartIsDate = initStartDateRaw ? /^\d{4}-\d{2}-\d{2}$/.test(initStartDateRaw) : true;
  const initServiceType = savedRecord?.serviceType ?? fallbackServiceType;
  const initNotes = savedRecord?.notes ?? "";

  const { selected: initSelected, custom: initCustom } = useMemo(
    () => resolveServiceTypeState(initServiceType),
    [initServiceType],
  );

  const [projectName, setProjectName] = useState(initName);
  const [siteAddress, setSiteAddress] = useState(initAddress);
  const [contactsText, setContactsText] = useState(initContacts);
  const [startDateMode, setStartDateMode] = useState<"date" | "other">(initStartIsDate ? "date" : "other");
  const [startDateValue, setStartDateValue] = useState(initStartIsDate ? (initStartDateRaw ?? "") : "");
  const [startDateOther, setStartDateOther] = useState(!initStartIsDate ? (initStartDateRaw ?? "") : "");
  const [serviceTypeSelected, setServiceTypeSelected] = useState(initSelected);
  const [serviceTypeCustom, setServiceTypeCustom] = useState(initCustom);
  const [notes, setNotes] = useState(initNotes);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [lastSentToName, setLastSentToName] = useState(savedRecord?.lastSentToName ?? null);
  const [lastSentAt, setLastSentAt] = useState(savedRecord?.lastSentAt ?? null);

  const activeEmployeesWithEmail = employees.filter((e) => e.status !== "INACTIVE" && e.email);

  function currentServiceType() {
    return serviceTypeSelected === "__other__" ? serviceTypeCustom.trim() : serviceTypeSelected;
  }

  function getStartDate() {
    return startDateMode === "date" ? (startDateValue || null) : (startDateOther.trim() || null);
  }

  function payload() {
    return {
      projectName,
      siteAddress,
      contacts: contactsText,
      startDate: getStartDate(),
      serviceType: currentServiceType(),
      notes,
    };
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaveSuccess(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/work-order-record`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Save failed"); return; }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId) { setError("Select an employee to notify."); return; }
    setError("");
    setSendSuccess(false);
    setSending(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/send-work-order-email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: selectedEmployeeId, ...payload() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Failed to send"); return; }
      const emp = activeEmployeesWithEmail.find((e) => e.id === selectedEmployeeId);
      if (emp) {
        setLastSentToName(empLabel(emp));
        setLastSentAt(new Date().toISOString());
      }
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 4000);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Work Order</h2>
        {lastSentToName && lastSentAt && (
          <span className="text-xs text-gray-400">
            Last sent to <span className="font-medium text-gray-600">{lastSentToName}</span>{" "}
            on {new Date(lastSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>

      {/* Work order fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="wo-project-name">Project Name</label>
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
          <label className={labelCls} htmlFor="wo-address">Project Site Address</label>
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
          <div className="flex items-center justify-between">
            <label className={labelCls} htmlFor="wo-start-date">Starting Date (Estimated)</label>
            <button
              type="button"
              onClick={() => setStartDateMode((m) => m === "date" ? "other" : "date")}
              className="text-[11px] text-pink-500 hover:underline"
            >
              {startDateMode === "date" ? "Other / TBD" : "Use exact date"}
            </button>
          </div>
          {startDateMode === "date" ? (
            <input
              id="wo-start-date"
              type="date"
              className={inputCls}
              value={startDateValue}
              onChange={(e) => setStartDateValue(e.target.value)}
            />
          ) : (
            <input
              id="wo-start-date"
              type="text"
              className={inputCls}
              value={startDateOther}
              onChange={(e) => setStartDateOther(e.target.value)}
              placeholder="e.g. Early July, TBD, Q3 2026"
            />
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="wo-service-type">Service Type</label>
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
          <label className={labelCls} htmlFor="wo-contacts">Main Point of Contacts</label>
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
          <label className={labelCls} htmlFor="wo-notes">Project Details / Notes for Project Manager</label>
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

      {/* Save bar */}
      <div className="flex items-center gap-3 border-t border-gray-200 pt-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-md bg-gray-200 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saveSuccess && <span className="text-xs text-green-600">Saved.</span>}
      </div>

      {/* Send section */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Send to Employee</h3>
        <div className="grid gap-4 sm:grid-cols-2 items-end">
          <div>
            <label className={labelCls}>Employee</label>
            <EmployeeSearchDropdown
              employees={activeEmployeesWithEmail}
              value={selectedEmployeeId}
              onChange={setSelectedEmployeeId}
            />
          </div>
          <div className="flex flex-col gap-2">
            {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
            {sendSuccess && <p className="text-xs text-green-600">Work order sent.</p>}
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !selectedEmployeeId}
              className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send Work Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
