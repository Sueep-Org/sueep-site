"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { UNIT_CHECKLIST_SECTIONS } from "@/lib/erp/unitTurnoverChecklistTemplate";
import type { ChecklistSection } from "@/lib/erp/unitTurnoverChecklistTemplate";
import { SignaturePadInput } from "@/app/erp/(shell)/quality-checks/SignaturePadInput";

type SectionPhotos = Record<string, { before: string[]; after: string[] }>;

type ChecklistData = {
  propertyName: string | null;
  unitNumber: string | null;
  checklistDate: string | null;
  technicianNames: string | null;
  startTime: string | null;
  endTime: string | null;
  photoBefore: boolean;
  photoAfter: boolean;
  conditionScore: number | null;
  issues: string | null;
  addlPaintTouchUp: boolean;
  addlFullRepaint: boolean;
  addlCarpetCleaning: boolean;
  addlMaintenanceRepair: boolean;
  addlTrashOut: boolean;
  technicianSignature: string | null;
  supervisorSignature: string | null;
  sectionPhotos: SectionPhotos;
  completedItems: Record<string, boolean>;
};

const inputCls = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

function sectionProgress(section: ChecklistSection, completed: Record<string, boolean>): { done: number; total: number } {
  const items = section.subsections.flatMap((ss) => ss.items);
  return { done: items.filter((i) => completed[i.id]).length, total: items.length };
}

function totalProgress(completed: Record<string, boolean>): { done: number; total: number } {
  const all = UNIT_CHECKLIST_SECTIONS.flatMap((s) => s.subsections.flatMap((ss) => ss.items));
  return { done: all.filter((i) => completed[i.id]).length, total: all.length };
}

function PhotoUploadArea({
  label,
  photos,
  uploading,
  onUpload,
  onDelete,
}: {
  label: string;
  photos: string[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-gray-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Uploading…
            </>
          ) : (
            <>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.636l2.955 3.129a.75.75 0 0 0 1.09-1.03l-4.25-4.5a.75.75 0 0 0-1.09 0l-4.25 4.5a.75.75 0 1 0 1.09 1.03L9.25 4.636v8.614Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
              Upload
            </>
          )}
        </button>
        {photos.map((url, i) => (
          <div key={url} className="flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-pink-600 hover:underline"
            >
              Photo {i + 1}
            </a>
            <button
              type="button"
              onClick={() => onDelete(url)}
              className="text-gray-400 hover:text-red-500 text-xs leading-none"
              aria-label="Delete photo"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ChecklistSectionBlock({
  section,
  completed,
  photos,
  projectId,
  onToggle,
  onPhotosChange,
}: {
  section: ChecklistSection;
  completed: Record<string, boolean>;
  photos: { before: string[]; after: string[] };
  projectId: string;
  onToggle: (itemId: string, value: boolean) => void;
  onPhotosChange: (sectionId: string, updated: { before: string[]; after: string[] }) => void;
}) {
  const { done, total } = sectionProgress(section, completed);
  const allDone = done === total;
  const [open, setOpen] = useState(!allDone);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleUpload(type: "before" | "after", file: File) {
    const setter = type === "before" ? setUploadingBefore : setUploadingAfter;
    setUploadError("");
    setter(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sectionId", section.id);
      fd.append("photoType", type);
      const res = await fetch(`/api/erp/projects/${projectId}/unit-checklist/photos`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      const updated = { ...photos, [type]: [...(photos[type] ?? []), data.url] };
      onPhotosChange(section.id, updated);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setter(false);
    }
  }

  function handleDelete(type: "before" | "after", url: string) {
    const updated = { ...photos, [type]: (photos[type] ?? []).filter((u) => u !== url) };
    onPhotosChange(section.id, updated);
    // extract photo ID from url and delete from DB
    const photoId = url.split("/").pop();
    if (photoId) {
      fetch(`/api/erp/projects/${projectId}/unit-checklist/photos/${photoId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-semibold text-gray-800">{section.title}</span>
        <div className="flex items-center gap-3">
          {(photos.before.length > 0 || photos.after.length > 0) && (
            <span className="text-xs text-gray-400 tabular-nums">
              {photos.before.length + photos.after.length} photo{photos.before.length + photos.after.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className={`text-xs font-medium tabular-nums ${allDone ? "text-emerald-600" : "text-gray-500"}`}>
            {done}/{total}
          </span>
          {allDone && (
            <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
            </svg>
          )}
          <svg className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-100 px-4 pb-4">
          {/* Checklist items */}
          {section.subsections.map((ss) => (
            <div key={ss.id} className="pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{ss.title}</p>
              <div className="space-y-1.5">
                {ss.items.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={!!completed[item.id]}
                      onChange={(e) => onToggle(item.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                    />
                    <span className={`text-sm ${completed[item.id] ? "text-gray-400 line-through" : "text-gray-700"}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {/* Photos */}
          <div className="pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Photos</p>
            <div className="flex gap-4 flex-wrap">
              <PhotoUploadArea
                label="Before"
                photos={photos.before ?? []}
                uploading={uploadingBefore}
                onUpload={(f) => handleUpload("before", f)}
                onDelete={(url) => handleDelete("before", url)}
              />
              <PhotoUploadArea
                label="After"
                photos={photos.after ?? []}
                uploading={uploadingAfter}
                onUpload={(f) => handleUpload("after", f)}
                onDelete={(url) => handleDelete("after", url)}
              />
            </div>
            {uploadError && (
              <p className="mt-2 text-xs text-red-500">{uploadError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectUnitTurnoverChecklist({ projectId, buildingName }: { projectId: string; buildingName: string | null }) {
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);
  const [search, setSearch] = useState("");

  const [propertyName, setPropertyName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [checklistDate, setChecklistDate] = useState("");
  const [technicianNames, setTechnicianNames] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [conditionScore, setConditionScore] = useState("");
  const [issues, setIssues] = useState("");

  useEffect(() => {
    fetch(`/api/erp/projects/${projectId}/unit-checklist`)
      .then((r) => r.json())
      .then((d: ChecklistData & { completedItems: unknown; sectionPhotos: unknown }) => {
        const completed = (typeof d.completedItems === "object" && d.completedItems !== null && !Array.isArray(d.completedItems))
          ? (d.completedItems as Record<string, boolean>) : {};
        const sp = (typeof d.sectionPhotos === "object" && d.sectionPhotos !== null && !Array.isArray(d.sectionPhotos))
          ? (d.sectionPhotos as SectionPhotos) : {};
        setData({ ...d, completedItems: completed, sectionPhotos: sp });
        setPropertyName(d.propertyName ?? buildingName ?? "");
        setUnitNumber(d.unitNumber ?? "");
        setChecklistDate(d.checklistDate ?? "");
        setTechnicianNames(d.technicianNames ?? "");
        setStartTime(d.startTime ?? "");
        setEndTime(d.endTime ?? "");
        setConditionScore(d.conditionScore != null ? String(d.conditionScore) : "");
        setIssues(d.issues ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const patch = useCallback((body: Record<string, unknown>) => {
    fetch(`/api/erp/projects/${projectId}/unit-checklist`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }, [projectId]);

  function toggleItem(itemId: string, value: boolean) {
    if (!data) return;
    const updated = { ...data.completedItems, [itemId]: value };
    setData((d) => d ? { ...d, completedItems: updated } : d);
    patch({ completedItems: updated });
  }

  function toggleBool(field: keyof ChecklistData, value: boolean) {
    if (!data) return;
    setData((d) => d ? { ...d, [field]: value } : d);
    patch({ [field]: value });
  }

  function handlePhotosChange(sectionId: string, updated: { before: string[]; after: string[] }) {
    if (!data) return;
    const newSectionPhotos = { ...data.sectionPhotos, [sectionId]: updated };
    setData((d) => d ? { ...d, sectionPhotos: newSectionPhotos } : d);
    patch({ sectionPhotos: newSectionPhotos });
  }

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoSaving(true);
    setInfoSaved(false);
    const body = {
      propertyName: propertyName.trim() || null,
      unitNumber: unitNumber.trim() || null,
      checklistDate: checklistDate || null,
      technicianNames: technicianNames.trim() || null,
      startTime: startTime || null,
      endTime: endTime || null,
      conditionScore: conditionScore !== "" ? Number(conditionScore) : null,
      issues: issues.trim() || null,
    };
    await fetch(`/api/erp/projects/${projectId}/unit-checklist`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setData((d) => d ? { ...d, ...body } : d);
    setInfoSaving(false);
    setInfoSaved(true);
    setTimeout(() => setInfoSaved(false), 2000);
  }

  if (loading) return <p className="py-8 text-center text-sm text-gray-400">Loading checklist…</p>;
  if (!data) return <p className="py-8 text-center text-sm text-red-400">Could not load checklist.</p>;

  const { done, total } = totalProgress(data.completedItems);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const query = search.trim().toLowerCase();
  const searchResults = query
    ? UNIT_CHECKLIST_SECTIONS.flatMap((s) =>
        s.subsections.flatMap((ss) =>
          ss.items
            .filter((item) => item.label.toLowerCase().includes(query))
            .map((item) => ({ item, sectionTitle: s.title, subsectionTitle: ss.title }))
        )
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span className="font-medium text-gray-700">Overall progress</span>
          <span className="tabular-nums">{done}/{total} items ({pct}%)</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : "bg-pink-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          placeholder="Search checklist items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Search results */}
      {query && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
          </p>
          {searchResults.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-500">No items match &quot;{search}&quot;.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {searchResults.map(({ item, sectionTitle, subsectionTitle }) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={!!data.completedItems[item.id]}
                    onChange={(e) => toggleItem(item.id, e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                  />
                  <div className="min-w-0">
                    <span className={`text-sm ${data.completedItems[item.id] ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {item.label}
                    </span>
                    <p className="text-xs text-gray-400">{sectionTitle} &rsaquo; {subsectionTitle}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Property info */}
      <form onSubmit={saveInfo} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Property Information</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls} htmlFor="utc-property">Property Name</label>
            <input id="utc-property" className={inputCls} value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="Building name" />
          </div>
          <div>
            <label className={labelCls} htmlFor="utc-unit">Unit Number</label>
            <input id="utc-unit" className={inputCls} value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g. 204" />
          </div>
          <div>
            <label className={labelCls} htmlFor="utc-date">Date</label>
            <input id="utc-date" type="date" className={inputCls} value={checklistDate} onChange={(e) => setChecklistDate(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="utc-techs">Technician(s)</label>
            <input id="utc-techs" className={inputCls} value={technicianNames} onChange={(e) => setTechnicianNames(e.target.value)} placeholder="Names separated by commas" />
          </div>
          <div>
            <label className={labelCls} htmlFor="utc-start">Start Time</label>
            <input id="utc-start" type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="utc-end">End Time</label>
            <input id="utc-end" type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 border-t border-gray-100 pt-4">
          <div>
            <label className={labelCls} htmlFor="utc-score">Unit Condition Score (1–10)</label>
            <input
              id="utc-score"
              type="number"
              min={1}
              max={10}
              step={1}
              className={inputCls}
              value={conditionScore}
              onChange={(e) => setConditionScore(e.target.value)}
              placeholder="1–10"
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="utc-issues">Issues Found</label>
            <input id="utc-issues" className={inputCls} value={issues} onChange={(e) => setIssues(e.target.value)} placeholder="Describe any damage or issues" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={infoSaving} className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50">
            {infoSaving ? "Saving…" : "Save info"}
          </button>
          {infoSaved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
      </form>

      {/* Checklist sections */}
      <div className="space-y-3">
        {UNIT_CHECKLIST_SECTIONS.map((section) => (
          <ChecklistSectionBlock
            key={section.id}
            section={section}
            completed={data.completedItems}
            photos={data.sectionPhotos[section.id] ?? { before: [], after: [] }}
            projectId={projectId}
            onToggle={toggleItem}
            onPhotosChange={handlePhotosChange}
          />
        ))}
      </div>

      {/* Additional services */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Additional Services Needed</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { field: "addlPaintTouchUp", label: "Paint touch-up" },
              { field: "addlFullRepaint", label: "Full repaint" },
              { field: "addlCarpetCleaning", label: "Carpet cleaning" },
              { field: "addlMaintenanceRepair", label: "Maintenance repair" },
              { field: "addlTrashOut", label: "Trash out" },
            ] as { field: keyof ChecklistData; label: string }[]
          ).map(({ field, label }) => (
            <label key={field} className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={!!data[field]}
                onChange={(e) => toggleBool(field, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Signatures */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Signatures</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className={labelCls + " mb-2"}>Technician Signature</p>
            <SignaturePadInput
              value={data.technicianSignature ?? ""}
              onChange={(val) => {
                setData((d) => d ? { ...d, technicianSignature: val || null } : d);
                patch({ technicianSignature: val || null });
              }}
            />
          </div>
          <div>
            <p className={labelCls + " mb-2"}>Supervisor Approval</p>
            <SignaturePadInput
              value={data.supervisorSignature ?? ""}
              onChange={(val) => {
                setData((d) => d ? { ...d, supervisorSignature: val || null } : d);
                patch({ supervisorSignature: val || null });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
