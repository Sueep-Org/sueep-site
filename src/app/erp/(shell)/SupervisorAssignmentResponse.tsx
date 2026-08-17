"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  assignmentId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
};

/** Accept/decline control for a supervisor's own upcoming assignment,
 * shown right on the ERP dashboard's "My projects" feed — same underlying
 * write as the emailed link's public page
 * (src/app/shift-response/[token]), just reached without a token since
 * they're already logged in. Sits outside the row's own <Link> (see
 * page.tsx) so this button isn't nested inside an anchor. */
export function SupervisorAssignmentResponse({ assignmentId, status: initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function respond(action: "accept" | "decline") {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/erp/schedule/day-assignments/${assignmentId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { status?: "PENDING" | "ACCEPTED" | "DECLINED"; error?: string };
      if (!res.ok || !json.status) throw new Error(json.error ?? "Failed to save");
      setStatus(json.status);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (status === "PENDING") {
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={saving}
          onClick={() => void respond("accept")}
          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          I&apos;ll be there
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void respond("decline")}
          className="rounded border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          Can&apos;t make it
        </button>
        {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <span className={`text-[11px] font-semibold ${status === "ACCEPTED" ? "text-emerald-700" : "text-red-600"}`}>
        {status === "ACCEPTED" ? "You confirmed ✓" : "You declined"}
      </span>
      <button
        type="button"
        disabled={saving}
        onClick={() => void respond(status === "ACCEPTED" ? "decline" : "accept")}
        className="text-[11px] font-medium text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
      >
        change
      </button>
      {error ? <span className="text-[11px] text-red-500">{error}</span> : null}
    </div>
  );
}
