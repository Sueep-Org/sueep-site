"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadQualityCheckEvidenceFile } from "@/lib/firebaseStorage";
import { SignaturePadInput } from "./SignaturePadInput";

type ProjectOption = { id: string; jobTitle: string };
type TurnoverOption = { id: string; requestType: string; unitNumber: string | null; building: { name: string } };
type Mode = "project" | "turnover";

function SearchCombobox({
  label,
  items,
  loading,
  value,
  onChange,
  placeholder,
  emptyText = "No results found",
  name,
}: {
  label: string;
  items: { id: string; display: string }[];
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyText?: string;
  name?: string;
}) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDisplay = items.find((i) => i.id === value)?.display ?? "";
  const displayValue = dropdownOpen ? query : selectedDisplay;

  const filtered = query.trim()
    ? items.filter((i) => i.display.toLowerCase().includes(query.toLowerCase()))
    : items;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      <div className="relative">
        <input
          type="text"
          readOnly={!dropdownOpen && Boolean(value)}
          value={displayValue}
          placeholder={loading ? `Loading ${label.toLowerCase()}…` : (placeholder ?? `Search ${label.toLowerCase()}…`)}
          disabled={loading}
          onFocus={() => { setDropdownOpen(true); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); if (value) onChange(""); }}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {value ? (
          <button
            type="button"
            onClick={() => { onChange(""); setQuery(""); setDropdownOpen(true); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            aria-label="Clear"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {dropdownOpen && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">{emptyText}</li>
          ) : (
            filtered.map((item) => (
              <li
                key={item.id}
                onMouseDown={(e) => { e.preventDefault(); onChange(item.id); setQuery(""); setDropdownOpen(false); }}
                className={`cursor-pointer px-3 py-2 text-sm hover:bg-pink-50 hover:text-pink-700 ${
                  item.id === value ? "bg-pink-50 font-medium text-pink-700" : "text-gray-900"
                }`}
              >
                {item.display}
              </li>
            ))
          )}
        </ul>
      )}

      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

export function NewQualityCheckForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("project");

  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [turnoverRequestId, setTurnoverRequestId] = useState("");
  const [turnoverRequests, setTurnoverRequests] = useState<TurnoverOption[]>([]);
  const [turnoverLoading, setTurnoverLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pmApproval, setPmApproval] = useState(false);
  const [supervisorSignature, setSupervisorSignature] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;

    setProjectsLoading(true);
    fetch("/api/erp/projects")
      .then((r) => r.json())
      .then((data: ProjectOption[]) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));

    setTurnoverLoading(true);
    fetch("/api/erp/turnover-requests")
      .then((r) => r.json())
      .then((data: TurnoverOption[]) => setTurnoverRequests(data))
      .catch(() => setTurnoverRequests([]))
      .finally(() => setTurnoverLoading(false));
  }, [open]);

  function close() {
    setOpen(false);
    setError("");
    setProjectId("");
    setTurnoverRequestId("");
    setMode("project");
    setSupervisorSignature("");
    setEvidenceFiles([]);
    setUploadProgress(null);
    setPmApproval(false);
  }

  const projectItems = projects.map((p) => ({ id: p.id, display: p.jobTitle }));
  const turnoverItems = turnoverRequests.map((r) => ({
    id: r.id,
    display: `${r.building.name} • ${r.requestType}${r.unitNumber ? ` • ${r.unitNumber}` : ""}`,
  }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (mode === "project" && !projectId) {
      setError("Please select a project.");
      return;
    }
    if (mode === "turnover" && !turnoverRequestId) {
      setError("Please select a turnover request.");
      return;
    }
    setLoading(true);
    setUploadProgress(null);
    const fd = new FormData(e.currentTarget);
    const resolvedProjectId = mode === "project" ? projectId : null;
    const resolvedTurnoverRequestId = mode === "turnover" ? turnoverRequestId : null;

    const uploadKey = resolvedProjectId || resolvedTurnoverRequestId || "new";
    let evidencePhotos: string[] = [];
    try {
      evidencePhotos = await Promise.all(
        evidenceFiles.map((file, index) =>
          uploadQualityCheckEvidenceFile(`${uploadKey}-${index + 1}`, file, (pct) => setUploadProgress(pct))
        )
      );
    } catch {
      setError("Failed to upload evidence photo. Please try again.");
      setLoading(false);
      setUploadProgress(null);
      return;
    }

    const payload = {
      ...(mode === "project" ? { projectId: resolvedProjectId } : { turnoverRequestId: resolvedTurnoverRequestId }),
      supervisorName: fd.get("supervisorName"),
      supervisorSignatureUrl: supervisorSignature || null,
      pmApproval,
      evidencePhotos,
      notes: fd.get("notes") || null,
    };

    try {
      const res = await fetch("/api/erp/quality-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create quality check");
        setLoading(false);
        return;
      }
      close();
      if (data.id) router.push(`/erp/quality-checks/${data.id}`);
      else router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
      >
        + New quality check
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">New quality check</h2>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 px-6 py-5">
              <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setMode("project")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "project" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Project
                </button>
                <button
                  type="button"
                  onClick={() => setMode("turnover")}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "turnover" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Turnover request
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  {mode === "project" ? (
                    <SearchCombobox
                      label="Project"
                      items={projectItems}
                      loading={projectsLoading}
                      value={projectId}
                      onChange={setProjectId}
                      emptyText="No projects found"
                    />
                  ) : (
                    <SearchCombobox
                      label="Turnover request"
                      items={turnoverItems}
                      loading={turnoverLoading}
                      value={turnoverRequestId}
                      onChange={setTurnoverRequestId}
                      emptyText="No turnover requests found"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600" htmlFor="qc-supervisor">
                    Supervisor name
                  </label>
                  <input
                    id="qc-supervisor"
                    name="supervisorName"
                    required
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                    placeholder="Supervisor name"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={pmApproval}
                      onChange={(e) => setPmApproval(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-pink-600"
                    />
                    PM approval
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600">Supervisor signature</label>
                <div className="mt-1">
                  <SignaturePadInput value={supervisorSignature} onChange={setSupervisorSignature} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="qc-evidence">
                  Evidence photos
                </label>
                <p className="mt-0.5 text-xs text-gray-500">Please provide all photos</p>
                <input
                  id="qc-evidence"
                  type="file"
                  accept="image/*"
                  multiple
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
                />
                {evidenceFiles.length > 0 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {evidenceFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`} className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
                        <p className="truncate font-medium text-gray-800">{file.name}</p>
                        <p className="text-gray-400">{Math.round(file.size / 1024)} KB</p>
                      </div>
                    ))}
                  </div>
                )}
                {uploadProgress !== null && (
                  <p className="mt-1 text-xs text-gray-500">Uploading: {uploadProgress}%</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="qc-notes">
                  Notes
                </label>
                <textarea
                  id="qc-notes"
                  name="notes"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  placeholder="Inspection comments, issues found, follow-up items…"
                />
              </div>

              {error && <p className="text-xs text-red-500" role="alert">{error}</p>}

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
                >
                  {loading ? "Saving…" : "Create quality check"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
