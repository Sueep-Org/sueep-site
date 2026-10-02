"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { InfoTip } from "@/app/erp/components/ui";

type PaperworkItem = { label: string; url: string };

type Props = {
  id: string;
  email: string | null;
  paperwork: PaperworkItem[];
  paperworkUploadToken: string | null;
  paperworkUploadTokenExpiry: string | null;
  resendConfigured: boolean;
  siteUrl: string;
};

function formatDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ContractorPaperworkPanel({
  id,
  email,
  paperwork: initial,
  paperworkUploadToken,
  paperworkUploadTokenExpiry,
  resendConfigured,
  siteUrl,
}: Props) {
  const router = useRouter();
  const [paperwork, setPaperwork] = useState<PaperworkItem[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendOk, setSendOk] = useState(false);
  const [sendError, setSendError] = useState("");
  const [uploadingLabels, setUploadingLabels] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Checklist view by default; adding/removing required documents only in
  // edit mode. Starts editing when nothing is required yet.
  const [editing, setEditing] = useState(initial.length === 0);
  const [showLink, setShowLink] = useState(false);

  const savedLabels = new Set(initial.map((p) => p.label));

  const uploadLink = paperworkUploadToken
    ? `${siteUrl.replace(/\/$/, "")}/contractor-portal/${paperworkUploadToken}`
    : null;
  const isExpired = paperworkUploadTokenExpiry ? new Date(paperworkUploadTokenExpiry) < new Date() : false;

  function addItem() {
    const label = newLabel.trim();
    if (!label) return;
    if (paperwork.some((p) => p.label.toLowerCase() === label.toLowerCase())) return;
    setPaperwork((prev) => [...prev, { label, url: "" }]);
    setNewLabel("");
  }

  function removeItem(i: number) {
    setPaperwork((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveRequirements() {
    setSaving(true);
    setSaveOk(false);
    setSaveError("");
    const res = await fetch(`/api/erp/contractors/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paperwork }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(j.error ?? "Save failed");
      return;
    }
    setSaveOk(true);
    setEditing(false);
    router.refresh();
    setTimeout(() => setSaveOk(false), 2000);
  }

  async function sendLink() {
    setSending(true);
    setSendOk(false);
    setSendError("");
    const res = await fetch(`/api/erp/contractors/${id}/send-upload-link`, { method: "POST" });
    setSending(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setSendError(j.error ?? "Send failed");
      return;
    }
    setSendOk(true);
    router.refresh();
    setTimeout(() => setSendOk(false), 3000);
  }

  // Several documents can upload at once, so each row tracks its own
  // spinner, and a finished upload marks its row right away instead of
  // waiting on a refresh (which never resets this component's local list).
  async function uploadFile(label: string, file: File) {
    setUploadingLabels((prev) => new Set(prev).add(label));
    setUploadError((prev) => ({ ...prev, [label]: "" }));
    try {
      const fd = new FormData();
      fd.append("label", label);
      fd.append("file", file);
      const res = await fetch(`/api/erp/contractors/${id}/upload-document`, { method: "POST", body: fd });
      // A rejection from the hosting layer (e.g. 413) is plain text, not JSON.
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        const message = res.status === 413 ? "File too large (max 4 MB)" : j.error ?? "Upload failed";
        setUploadError((prev) => ({ ...prev, [label]: message }));
        return;
      }
      const url = j.url;
      setPaperwork((prev) => prev.map((p) => (p.label === label ? { ...p, url } : p)));
      router.refresh();
    } catch {
      setUploadError((prev) => ({ ...prev, [label]: "Network error" }));
    } finally {
      setUploadingLabels((prev) => {
        const next = new Set(prev);
        next.delete(label);
        return next;
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs font-medium text-gray-700">
            Required documents
            <InfoTip text="Pick which documents this contractor must provide, then send them the upload link. No account needed; the link expires after 7 days." />
          </p>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-gray-500 hover:text-[#E73C6E]">
              Edit list
            </button>
          )}
        </div>

        {paperwork.length > 0 ? (
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {paperwork.map((item, i) => (
              <li key={i} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className={item.url ? "font-bold text-emerald-600" : "font-bold text-amber-500"}>{item.url ? "✓" : "○"}</span>
                    <span className="text-gray-800">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-[#E73C6E] hover:underline">
                        View
                      </a>
                    )}
                    {savedLabels.has(item.label) ? (
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[item.label]?.click()}
                        disabled={uploadingLabels.has(item.label)}
                        className="text-xs text-gray-500 hover:text-[#E73C6E] disabled:opacity-50"
                      >
                        {uploadingLabels.has(item.label) ? "Uploading…" : item.url ? "Replace" : "Upload"}
                      </button>
                    ) : (
                      <span className="text-xs text-amber-500">Save first</span>
                    )}
                    <input
                      ref={(el) => {
                        fileInputRefs.current[item.label] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadFile(item.label, file);
                        e.target.value = "";
                      }}
                    />
                    {editing && (
                      <button type="button" onClick={() => removeItem(i)} className="text-xs text-gray-400 hover:text-red-500">
                        Remove
                      </button>
                    )}
                  </span>
                </div>
                {uploadError[item.label] && <p className="mt-0.5 pl-5 text-xs text-red-500">{uploadError[item.label]}</p>}
              </li>
            ))}
          </ul>
        ) : (
          !editing && <p className="text-sm text-gray-400">No documents required yet.</p>
        )}

        {editing && (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder="Document name, e.g. W-9"
                className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
              />
              <button type="button" onClick={addItem} className="rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                Add
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void saveRequirements()}
                disabled={saving}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save list"}
              </button>
              {initial.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPaperwork(initial);
                    setEditing(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
              {saveError && <span className="text-xs text-red-500">{saveError}</span>}
            </div>
          </>
        )}
        {saveOk && <p className="text-xs text-emerald-600">Saved.</p>}
      </div>

      {paperwork.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-600">
            Upload link:{" "}
            {uploadLink && !isExpired ? (
              <>
                sent, expires {formatDt(paperworkUploadTokenExpiry)}{" "}
                <button type="button" onClick={() => setShowLink((v) => !v)} className="text-[#E73C6E] hover:underline">
                  {showLink ? "hide" : "show"}
                </button>
              </>
            ) : isExpired && paperworkUploadToken ? (
              <span className="text-red-500">expired</span>
            ) : (
              "not sent"
            )}
          </p>
          <button
            type="button"
            onClick={() => void sendLink()}
            disabled={sending || !resendConfigured || !email}
            title={!email ? "Add an email address to this contractor first" : !resendConfigured ? "Email isn't set up (RESEND_API_KEY)" : undefined}
            className="rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "Sending…" : paperworkUploadToken && !isExpired ? "Resend link" : "Send link"}
          </button>
          {!email && <span className="text-xs text-amber-600">Needs an email address</span>}
          {sendOk && <span className="text-xs text-emerald-600">Sent to {email}</span>}
          {sendError && <span className="text-xs text-red-500">{sendError}</span>}
          {showLink && uploadLink && (
            <a href={uploadLink} target="_blank" rel="noopener noreferrer" className="block w-full break-all rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-[#E73C6E] hover:underline">
              {uploadLink}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
