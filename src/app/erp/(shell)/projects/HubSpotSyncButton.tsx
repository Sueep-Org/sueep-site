"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function HubSpotSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadPreview = useCallback(async () => {
    setPreviewError(null);
    try {
      const res = await fetch("/api/erp/hubspot/sync", { method: "GET" });
      const data = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        setPreviewError(data.error || `Preview failed (${res.status})`);
        setPreview(null);
        return;
      }
      const n = data.count ?? 0;
      setPreview(
        n === 0
          ? "0 deals in configured stages right now."
          : `${n} deal(s) in configured stages ready to sync.`,
      );
    } catch {
      setPreviewError("Could not load HubSpot preview.");
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    if (!infoOpen) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [infoOpen]);

  async function sync() {
    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/erp/hubspot/sync", { method: "POST" });
      const data = (await res.json()) as {
        synced?: Array<{ hubspotDealId: string; projectId: string; action: string }>;
        reconciledJanitorial?: Array<{ hubspotDealId: string; projectId: string }>;
        errors?: string[];
        error?: string;
        contactScopesError?: string;
      };
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setLoading(false);
        return;
      }
      const n = data.synced?.length ?? 0;
      const r = data.reconciledJanitorial?.length ?? 0;
      const errN = data.errors?.length ?? 0;
      setMessage(
        `Synced ${n} deal(s).${r > 0 ? ` Marked ${r} janitorial project(s) complete.` : ""}${errN > 0 ? ` ${errN} warning(s).` : ""}`,
      );
      if (data.contactScopesError) {
        setError(`Contact sync disabled — missing HubSpot scope: ${data.contactScopesError}`);
      }
      await loadPreview();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex items-center gap-1" ref={popoverRef}>
      <button
        type="button"
        onClick={() => void sync()}
        disabled={loading}
        className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
      >
        {loading ? "Syncing…" : "Sync HubSpot"}
      </button>

      <button
        type="button"
        onClick={() => setInfoOpen((o) => !o)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] font-semibold text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
        aria-label="HubSpot sync info"
      >
        i
      </button>

      {infoOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-l-4 border-l-orange-500 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Sync deals from HubSpot</h3>
            <p className="mt-1 text-xs text-gray-600">
              Pulls deals from your three pipelines (stages configured in{" "}
              <code className="text-gray-700">HUBSPOT_PIPELINE_STAGE_MAP</code>) into ERP projects.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-gray-600">
              <li>
                In Vercel, set <code className="text-gray-700">HUBSPOT_PIPELINE_STAGE_MAP</code>. Use{" "}
                <a
                  href="/api/erp/hubspot/pipelines"
                  className="text-pink-600 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  /api/erp/hubspot/pipelines
                </a>{" "}
                to copy pipeline and stage IDs.
              </li>
              <li>
                <code className="text-gray-700">HUBSPOT_ACCESS_TOKEN</code> must be set on Vercel.
              </li>
              <li>
                Deploying does not import deals — click Sync after each deploy.
              </li>
            </ol>
            <div className="mt-3 rounded-md bg-gray-50 px-3 py-2">
              {previewError ? (
                <p className="text-xs text-amber-600">Preview: {previewError}</p>
              ) : preview ? (
                <p className="text-xs text-gray-600">{preview}</p>
              ) : (
                <p className="text-xs text-gray-400">Loading preview…</p>
              )}
            </div>
          </div>
          {message && (
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-xs text-emerald-600">{message}</p>
            </div>
          )}
          {error && (
            <div className="border-t border-gray-100 px-4 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>
      )}

      {message && !infoOpen && (
        <span className="text-xs text-emerald-600">{message}</span>
      )}
      {error && !infoOpen && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}
