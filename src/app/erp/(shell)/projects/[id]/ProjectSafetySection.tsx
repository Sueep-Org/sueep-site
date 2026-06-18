"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type Employee = { id: string; firstName: string; lastName: string };

type IncidentRow = {
  id: string;
  status: string;
  violationCount: number;
  createdAt: string;
};

type WorkerRow = {
  id: string;
  workerName: string;
  employeeId: string | null;
  hasVest: boolean;
  hasHardHat: boolean;
  hasBoots: boolean;
  hasUniform: boolean;
  hasPhoto: boolean;
  photoUploadedAt: string | null;
  passed: boolean;
  notes: string | null;
  incidents: IncidentRow[];
};

type SafetyCheck = {
  id: string;
  checkDate: string;
  supervisorName: string;
  hasGroupPhoto: boolean;
  groupPhotoUploadedAt: string | null;
  hasArrivalPhoto: boolean;
  siteArrivalPhotoUploadedAt: string | null;
  approvedForWork: boolean;
  approvedAt: string | null;
  notes: string | null;
  workers: WorkerRow[];
};

const PPE_FIELDS: { key: keyof WorkerRow; label: string }[] = [
  { key: "hasVest", label: "Hi-vis vest" },
  { key: "hasHardHat", label: "Hard hat" },
  { key: "hasBoots", label: "Boots" },
  { key: "hasUniform", label: "Uniform" },
];

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EmployeeCombobox({
  employees,
  value,
  onChange,
}: {
  employees: Employee[];
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = employees.find((e) => e.id === value);
  const display = selected ? `${selected.firstName} ${selected.lastName}` : query;

  const filtered = query
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase())
      )
    : employees;

  return (
    <div
      ref={ref}
      className="relative"
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
    >
      <input
        type="text"
        autoComplete="off"
        placeholder="Search employees or type name…"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        value={open ? query : display}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange("", e.target.value); }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {filtered.map((emp) => (
            <li
              key={emp.id}
              onMouseDown={(e) => {
                e.preventDefault();
                const name = `${emp.firstName} ${emp.lastName}`;
                onChange(emp.id, name);
                setQuery(name);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 hover:bg-pink-50 hover:text-pink-700"
            >
              {emp.firstName} {emp.lastName}
            </li>
          ))}
          {query && filtered.length === 0 && (
            <li
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("", query);
                setOpen(false);
              }}
              className="cursor-pointer border-t border-gray-100 px-3 py-2 text-gray-500 hover:bg-pink-50"
            >
              Use &quot;{query}&quot; (not in roster)
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function WorkerCard({
  worker,
  checkId,
  projectId,
  onUpdate,
  onRemove,
}: {
  worker: WorkerRow;
  checkId: string;
  projectId: string;
  onUpdate: (w: WorkerRow) => void;
  onRemove: (id: string) => void;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [photoKey, setPhotoKey] = useState(0);
  const [markingNonCompliant, setMarkingNonCompliant] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const photoSrc = `/api/erp/projects/${projectId}/safety-checks/${checkId}/workers/${worker.id}/photo`;

  async function patchWorker(patch: Partial<WorkerRow>) {
    const res = await fetch(
      `/api/erp/projects/${projectId}/safety-checks/${checkId}/workers/${worker.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }
    );
    if (res.ok) onUpdate({ ...worker, ...patch });
  }

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(photoSrc, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setUploadError(d.error ?? "Upload failed");
        return;
      }
      onUpdate({ ...worker, hasPhoto: true, photoUploadedAt: new Date().toISOString() });
      setPhotoKey((k) => k + 1);
    } catch {
      setUploadError("Network error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete() {
    if (!confirm(`Remove ${worker.workerName} from this check?`)) return;
    await fetch(
      `/api/erp/projects/${projectId}/safety-checks/${checkId}/workers/${worker.id}`,
      { method: "DELETE" }
    );
    onRemove(worker.id);
  }

  return (
    <div className={`rounded-lg border p-4 ${worker.passed ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold ${worker.passed ? "bg-emerald-500" : "bg-amber-400"}`}>
            {worker.passed ? "✓" : "!"}
          </span>
          <p className="text-sm font-semibold text-gray-900">{worker.workerName}</p>
        </div>
        <button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">
          Remove
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {PPE_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={!!worker[key]}
              onChange={(e) => patchWorker({ [key]: e.target.checked } as Partial<WorkerRow>)}
              className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
            />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {worker.hasPhoto && (
          <div className="flex flex-col items-start gap-0.5">
            <a href={photoSrc} target="_blank" rel="noopener noreferrer">
              <img
                key={photoKey}
                src={photoSrc}
                alt={worker.workerName}
                className="h-16 w-16 rounded-md border border-gray-200 object-cover hover:opacity-90"
              />
            </a>
            {worker.photoUploadedAt && (
              <p className="text-[10px] text-gray-400">{formatTimestamp(worker.photoUploadedAt)}</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : worker.hasPhoto ? "Replace photo" : "Add photo"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />

        <button
          type="button"
          onClick={() => patchWorker({ passed: true })}
          className={`rounded-md px-3 py-1.5 text-xs font-medium ${
            worker.passed
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {worker.passed ? "Passed ✓" : "Mark passed"}
        </button>

        {!worker.passed && (
          <button
            type="button"
            disabled={markingNonCompliant}
            onClick={async () => {
              setMarkingNonCompliant(true);
              try {
                const res = await fetch(
                  `/api/erp/projects/${projectId}/safety-checks/${checkId}/workers/${worker.id}`,
                  {
                    method: "PATCH",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ passed: false, nonCompliant: true }),
                  }
                );
                if (res.ok) router.refresh();
              } finally {
                setMarkingNonCompliant(false);
              }
            }}
            className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            {markingNonCompliant ? "Saving…" : "Mark non-compliant"}
          </button>
        )}

        {worker.passed && (
          <button
            type="button"
            onClick={() => patchWorker({ passed: false })}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Undo
          </button>
        )}
      </div>
      {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}

      {/* Incidents */}
      {worker.incidents.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {worker.incidents.map((inc) => (
            <div key={inc.id} className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${inc.status === "ESCALATED" ? "bg-red-100 text-red-700" : inc.status === "RESOLVED" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>
                {inc.status === "ESCALATED" ? `Escalated · #${inc.violationCount}` : inc.status === "RESOLVED" ? "Resolved" : `Incident #${inc.violationCount}`}
              </span>
              <span className="text-[10px] text-gray-400">
                {new Date(inc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              {inc.status === "OPEN" || inc.status === "ESCALATED" ? (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/erp/safety-incidents/${inc.id}`, {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ status: "RESOLVED" }),
                    });
                    if (res.ok) {
                      onUpdate({
                        ...worker,
                        incidents: worker.incidents.map((i) =>
                          i.id === inc.id ? { ...i, status: "RESOLVED" } : i
                        ),
                      });
                    }
                  }}
                  className="text-[10px] font-medium text-pink-600 hover:text-pink-800"
                >
                  Mark resolved
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckCard({
  check,
  projectId,
  employees,
  onUpdate,
  onDelete,
}: {
  check: SafetyCheck;
  projectId: string;
  employees: Employee[];
  onUpdate: (c: SafetyCheck) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [addingWorker, setAddingWorker] = useState(false);
  const [newEmpId, setNewEmpId] = useState("");
  const [newName, setNewName] = useState("");
  const [savingWorker, setSavingWorker] = useState(false);
  const [groupUploading, setGroupUploading] = useState(false);
  const [arrivalUploading, setArrivalUploading] = useState(false);
  const [groupKey, setGroupKey] = useState(0);
  const [arrivalKey, setArrivalKey] = useState(0);
  const groupRef = useRef<HTMLInputElement>(null);
  const arrivalRef = useRef<HTMLInputElement>(null);

  const passedCount = check.workers.filter((w) => w.passed).length;
  const total = check.workers.length;

  const groupSrc = `/api/erp/projects/${projectId}/safety-checks/${check.id}/group-photo`;
  const arrivalSrc = `/api/erp/projects/${projectId}/safety-checks/${check.id}/arrival-photo`;

  async function patchCheck(patch: Partial<SafetyCheck>) {
    const optimistic = { ...check, ...patch };
    if (patch.approvedForWork === true) optimistic.approvedAt = new Date().toISOString();
    if (patch.approvedForWork === false) optimistic.approvedAt = null;
    const res = await fetch(`/api/erp/projects/${projectId}/safety-checks/${check.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) onUpdate(optimistic);
  }

  async function uploadPhoto(
    url: string,
    file: File,
    onDone: () => void,
    setLoading: (v: boolean) => void
  ) {
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await fetch(url, { method: "POST", body: fd });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  async function addWorker() {
    if (!newName.trim()) return;
    setSavingWorker(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/safety-checks/${check.id}/workers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workerName: newName.trim(), employeeId: newEmpId || null }),
      });
      if (res.ok) {
        const worker = (await res.json()) as WorkerRow;
        onUpdate({ ...check, workers: [...check.workers, { ...worker, hasPhoto: false, photoUploadedAt: null, incidents: [] }] });
        setNewEmpId("");
        setNewName("");
        setAddingWorker(false);
      }
    } finally {
      setSavingWorker(false);
    }
  }

  async function deleteCheck() {
    if (!confirm("Delete this safety check?")) return;
    await fetch(`/api/erp/projects/${projectId}/safety-checks/${check.id}`, { method: "DELETE" });
    onDelete(check.id);
  }

  return (
    <div className="rounded-lg border border-gray-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${check.approvedForWork ? "bg-emerald-500" : "bg-gray-400"}`}>
            {check.approvedForWork ? "✓" : "•"}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{formatDate(check.checkDate)}</p>
            <p className="text-xs text-gray-500">
              {check.supervisorName} · {passedCount}/{total} passed
              {check.approvedForWork ? " · Approved" : ""}
            </p>
          </div>
        </div>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Crew</h3>
              <button type="button" onClick={() => setAddingWorker(true)} className="text-xs font-medium text-pink-600 hover:text-pink-800">
                + Add worker
              </button>
            </div>

            {addingWorker && (
              <div className="mb-3 rounded-md border border-pink-100 bg-pink-50 p-3 space-y-2">
                <EmployeeCombobox
                  employees={employees}
                  value={newEmpId}
                  onChange={(id, name) => { setNewEmpId(id); setNewName(name); }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setAddingWorker(false); setNewEmpId(""); setNewName(""); }}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addWorker}
                    disabled={savingWorker || !newName.trim()}
                    className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                  >
                    {savingWorker ? "Adding…" : "Add"}
                  </button>
                </div>
              </div>
            )}

            {check.workers.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No workers added yet.</p>
            ) : (
              <div className="space-y-3">
                {check.workers.map((w) => (
                  <WorkerCard
                    key={w.id}
                    worker={w}
                    checkId={check.id}
                    projectId={projectId}
                    onUpdate={(updated) =>
                      onUpdate({ ...check, workers: check.workers.map((x) => (x.id === updated.id ? updated : x)) })
                    }
                    onRemove={(id) =>
                      onUpdate({ ...check, workers: check.workers.filter((x) => x.id !== id) })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Site photos</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">Group photo</p>
                {check.hasGroupPhoto && (
                  <>
                    <a href={groupSrc} target="_blank" rel="noopener noreferrer">
                      <img key={groupKey} src={groupSrc} alt="Group" className="h-24 w-full rounded-md border border-gray-200 object-cover hover:opacity-90" />
                    </a>
                    {check.groupPhotoUploadedAt && (
                      <p className="text-[10px] text-gray-400">{formatTimestamp(check.groupPhotoUploadedAt)}</p>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => groupRef.current?.click()}
                  disabled={groupUploading}
                  className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-pink-300 hover:text-pink-600 disabled:opacity-50"
                >
                  {groupUploading ? "Uploading…" : check.hasGroupPhoto ? "Replace group photo" : "Upload group photo"}
                </button>
                <input
                  ref={groupRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    uploadPhoto(groupSrc, file, () => { onUpdate({ ...check, hasGroupPhoto: true, groupPhotoUploadedAt: new Date().toISOString() }); setGroupKey((k) => k + 1); }, setGroupUploading);
                    if (groupRef.current) groupRef.current.value = "";
                  }}
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-600">Site arrival photo</p>
                {check.hasArrivalPhoto && (
                  <>
                    <a href={arrivalSrc} target="_blank" rel="noopener noreferrer">
                      <img key={arrivalKey} src={arrivalSrc} alt="Site arrival" className="h-24 w-full rounded-md border border-gray-200 object-cover hover:opacity-90" />
                    </a>
                    {check.siteArrivalPhotoUploadedAt && (
                      <p className="text-[10px] text-gray-400">{formatTimestamp(check.siteArrivalPhotoUploadedAt)}</p>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => arrivalRef.current?.click()}
                  disabled={arrivalUploading}
                  className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-pink-300 hover:text-pink-600 disabled:opacity-50"
                >
                  {arrivalUploading ? "Uploading…" : check.hasArrivalPhoto ? "Replace arrival photo" : "Upload arrival photo"}
                </button>
                <input
                  ref={arrivalRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    uploadPhoto(arrivalSrc, file, () => { onUpdate({ ...check, hasArrivalPhoto: true, siteArrivalPhotoUploadedAt: new Date().toISOString() }); setArrivalKey((k) => k + 1); }, setArrivalUploading);
                    if (arrivalRef.current) arrivalRef.current.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Approve / revoke */}
          {(() => {
            const missing: string[] = [];
            if (check.workers.length === 0) missing.push("add at least one worker");
            else {
              if (!check.workers.every((w) => w.passed)) missing.push("all workers must be marked passed");
              if (!check.workers.every((w) => w.hasPhoto)) missing.push("all workers must have a photo");
            }
            if (!check.hasGroupPhoto) missing.push("group photo required");
            if (!check.hasArrivalPhoto) missing.push("site arrival photo required");
            const canApprove = missing.length === 0;

            return (
              <div className="space-y-3 border-t border-gray-100 pt-4">
                {!check.approvedForWork && missing.length > 0 && (
                  <ul className="space-y-0.5 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                    {missing.map((m) => (
                      <li key={m} className="text-xs text-amber-700">· {m}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={!canApprove && !check.approvedForWork}
                      onClick={() => patchCheck({ approvedForWork: !check.approvedForWork })}
                      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        check.approvedForWork
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-pink-600 text-white hover:bg-pink-500"
                      }`}
                    >
                      {check.approvedForWork ? "Revoke approval" : "Approve crew for work"}
                    </button>
                    {check.approvedForWork && check.approvedAt && (
                      <p className="text-xs text-emerald-600">
                        Approved {formatTimestamp(check.approvedAt)}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={deleteCheck} className="text-xs text-red-400 hover:text-red-600">
                    Delete check
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export function ProjectSafetySection({
  projectId,
  initialChecks,
  defaultSupervisorName,
  employees,
}: {
  projectId: string;
  initialChecks: SafetyCheck[];
  defaultSupervisorName: string;
  employees: Employee[];
}) {
  const [checks, setChecks] = useState(initialChecks);
  const [creating, setCreating] = useState(false);
  const [newSupervisor, setNewSupervisor] = useState(defaultSupervisorName);
  const [newDate, setNewDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function createCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!newSupervisor.trim()) { setError("Supervisor name is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/safety-checks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ supervisorName: newSupervisor.trim(), checkDate: newDate }),
      });
      if (res.ok) {
        const raw = (await res.json()) as { id: string; checkDate: string; supervisorName: string; approvedForWork: boolean; approvedAt: string | null; notes: string | null };
        const check: SafetyCheck = { ...raw, hasGroupPhoto: false, groupPhotoUploadedAt: null, hasArrivalPhoto: false, siteArrivalPhotoUploadedAt: null, workers: [] };
        setChecks((prev) => [check, ...prev]);
        setCreating(false);
        setNewSupervisor(defaultSupervisorName);
        setNewDate(new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Daily safety checks</h2>
          <p className="mt-0.5 text-xs text-gray-400">PPE verification before crew starts work</p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
          >
            + New check
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createCheck} className="rounded-lg border border-pink-100 bg-pink-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New daily check</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600">Date</label>
              <input
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Supervisor name</label>
              <input
                type="text"
                required
                placeholder="Name"
                value={newSupervisor}
                onChange={(e) => setNewSupervisor(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setCreating(false); setError(""); setNewSupervisor(defaultSupervisorName); }}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-pink-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      )}

      {checks.length === 0 && !creating ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
          No safety checks yet. Create one before the crew starts work.
        </p>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              projectId={projectId}
              employees={employees}
              onUpdate={(updated) =>
                setChecks((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
              }
              onDelete={(id) => setChecks((prev) => prev.filter((c) => c.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
