"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type HubSpotSyncPanelProps = {
  /** For deep links from other pages, e.g. `id="hubspot-sync"`. */
  id?: string;
};

export function HubSpotSyncPanel({ id }: HubSpotSyncPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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
          ? "HubSpot search: 0 deals in your configured stages right now. Move a test deal into Quote Approved / Confirmed / Awarded (or WIP) and sync again."
          : `HubSpot search: ${n} deal(s) in configured stages — click Sync to copy them into Projects.`,
      );
    } catch {
      setPreviewError("Could not load HubSpot preview.");
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

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
      };
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setLoading(false);
        return;
      }
      const n = data.synced?.length ?? 0;
      const r = data.reconciledJanitorial?.length ?? 0;
      const errN = data.errors?.length ?? 0;
      const zeroHint =
        n === 0
          ? " Nothing new to write — either no deals matched those stages, or they were already imported. Check the preview line above."
          : "";
      setMessage(
        `Synced ${n} deal(s) into projects.${zeroHint}${r > 0 ? ` Marked ${r} janitorial project(s) complete (no longer in active HubSpot stages).` : ""}${errN > 0 ? ` ${errN} warning(s) — check browser devtools Network response for details.` : ""}`,
      );
      await loadPreview();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      id={id}
      className="rounded-lg border border-gray-200 border-l-4 border-l-orange-500 bg-gray-50 p-4 shadow-sm shadow-orange-200/40"
    >
      <h2 className="text-base font-semibold text-zinc-900">Sync deals from HubSpot</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Pull deals from your three pipelines (stages you configured in{" "}
        <code className="text-zinc-700">HUBSPOT_PIPELINE_STAGE_MAP</code>) into ERP projects. They then show on Projects and Schedule. For janitorial, leave{" "}
        <code className="text-zinc-700">workCompleted</code> empty to keep only active deals (Awarded + Signed).
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] text-zinc-600">
        <li>
          In Vercel, set <code className="text-zinc-700">HUBSPOT_PIPELINE_STAGE_MAP</code> (see{" "}
          <code className="text-zinc-700">.env.example</code>). Use{" "}
          <a href="/api/erp/hubspot/pipelines" className="text-pink-600 hover:underline" target="_blank" rel="noreferrer">
            /api/erp/hubspot/pipelines
          </a>{" "}
          (while logged in) to copy pipeline and stage IDs.
        </li>
        <li>
          <code className="text-zinc-700">HUBSPOT_ACCESS_TOKEN</code> must be set on Vercel.
        </li>
        <li>
          <span className="font-medium text-zinc-700">Deploying does not import deals.</span> Open this dashboard after deploy and click Sync (or call{" "}
          <code className="text-zinc-700">POST /api/erp/hubspot/sync</code>).
        </li>
      </ol>
      {previewError ? (
        <p className="mt-3 text-xs text-amber-700" role="status">
          HubSpot preview: {previewError}
        </p>
      ) : preview ? (
        <p className="mt-3 text-xs text-zinc-600" role="status">
          {preview}
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Loading HubSpot preview…</p>
      )}
      <button
        type="button"
        onClick={() => void sync()}
        disabled={loading}
        className="mt-4 rounded-md bg-orange-600 px-3 py-2 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {loading ? "Syncing…" : "Sync deals from HubSpot"}
      </button>
      {message ? <p className="mt-2 text-xs text-emerald-700">{message}</p> : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
