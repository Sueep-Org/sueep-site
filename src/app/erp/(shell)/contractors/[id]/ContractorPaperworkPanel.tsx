"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

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
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const uploadLink = paperworkUploadToken
    ? `${siteUrl.replace(/\/$/, "")}/contractor-portal/${paperworkUploadToken}`
    : null;
  const isExpired = paperworkUploadTokenExpiry ? new Date(paperworkUploadTokenExpiry) < new Date() : false;
  const uploadedCount = paperwork.filter((p) => p.url).length;

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

  async function uploadFile(label: string, file: File) {
    setUploadingLabel(label);
    setUploadError((prev) => ({ ...prev, [label]: "" }));
    const fd = new FormData();
    fd.append("label", label);
    fd.append("file", file);
    const res = await fetch(`/api/erp/contractors/${id}/upload-document`, { method: "POST", body: fd });
    setUploadingLabel(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setUploadError((prev) => ({ ...prev, [label]: j.error ?? "Upload failed" }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          Define which documents are required, then send the contractor a secure upload link. No account required — expires after 7 days.
        </p>

        {paperwork.length > 0 && (
          <ul className="space-y-2">
            {paperwork.map((item, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={item.url ? "text-emerald-600 font-bold" : "text-amber-500 font-bold"}>
                      {item.url ? "✓" : "○"}
                    </span>
                    <span className="text-gray-800">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#E73C6E] hover:underline"
                      >
                        View file
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[item.label]?.click()}
                      disabled={uploadingLabel === item.label}
                      className="text-xs text-gray-500 hover:text-[#E73C6E] disabled:opacity-50"
                    >
                      {uploadingLabel === item.label ? "Uploading…" : item.url ? "Replace" : "Upload"}
                    </button>
                    <input
                      ref={(el) => { fileInputRefs.current[item.label] = el; }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadFile(item.label, file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {uploadError[item.label] && (
                  <p className="mt-0.5 text-xs text-red-500 pl-5">{uploadError[item.label]}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder="Document name (e.g. W-9, Certificate of Insurance)"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-[#E73C6E] focus:outline-none focus:ring-1 focus:ring-[#E73C6E]"
          />
          <button
            type="button"
            onClick={addItem}
            className="rounded-md bg-[#E73C6E] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
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
            {saving ? "Saving…" : "Save requirements"}
          </button>
          {saveOk && <span className="text-xs text-emerald-600">Saved.</span>}
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-3">
        <p className="text-xs font-medium text-gray-700">Document upload link</p>

        {paperwork.length > 0 && (
          <p className="text-xs text-gray-500">
            {uploadedCount} / {paperwork.length} uploaded
          </p>
        )}

        {uploadLink && !isExpired && (
          <div>
            <p className="text-xs text-gray-500 mb-1">
              Expires {formatDt(paperworkUploadTokenExpiry)}
            </p>
            <a
              href={uploadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block break-all rounded-md bg-gray-100 border border-gray-200 px-3 py-2 text-xs text-[#E73C6E] hover:underline"
            >
              {uploadLink}
            </a>
          </div>
        )}

        {isExpired && paperworkUploadToken && (
          <p className="text-xs text-red-400">Upload link expired.</p>
        )}

        {!resendConfigured && (
          <p className="text-xs text-pink-400">
            <span className="font-mono">RESEND_API_KEY</span> is required to email contractors.
          </p>
        )}

        {!email && (
          <p className="text-xs text-amber-500">Add an email address to this contractor before sending.</p>
        )}

        <button
          type="button"
          onClick={() => void sendLink()}
          disabled={sending || !resendConfigured || !email || paperwork.length === 0}
          className="rounded-md bg-[#E73C6E] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {sending
            ? "Sending…"
            : paperworkUploadToken && !isExpired
            ? "Resend upload link"
            : "Send upload link"}
        </button>

        {sendOk && <p className="text-xs text-emerald-500">Upload link sent to {email}</p>}
        {sendError && <p className="text-xs text-red-400">{sendError}</p>}
      </div>
    </div>
  );
}
