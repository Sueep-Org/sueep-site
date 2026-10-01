"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, InfoTip, useToast } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { requirementSummary } from "@/lib/erp/insurance";
import type { RequestRow } from "./types";

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-pink-50 text-pink-700" },
  PENDING_REVIEW: { label: "With broker", cls: "bg-amber-50 text-amber-700" },
  DONE: { label: "Done", cls: "bg-emerald-50 text-emerald-700" },
  CANCELLED: { label: "Cancelled", cls: "bg-gray-100 text-gray-500" },
};

/**
 * One COI request. `onAddCoi` (project tab only) opens the Add COI form for
 * a holder; `projects` (Requests tab only) lets staff pick the project for
 * a request from the general link.
 */
export function RequestCard({
  request: r,
  onAddCoi,
  projects,
}: {
  request: RequestRow;
  onAddCoi?: (holderIndex: number) => void;
  projects?: { id: string; jobTitle: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const open = r.status === "NEW" || r.status === "PENDING_REVIEW";
  const summary = requirementSummary(r);
  const status = STATUS_STYLE[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-500" };

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/insurance/requests/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not save", "error");
        return;
      }
      toast(message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveHolder(index: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/insurance/requests/${r.id}/save-holder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Could not save", "error");
        return;
      }
      toast(data.existed ? `Already saved as ${data.name}.` : "Saved to Certificate Holders.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const details: [string, string | null][] = [
    ["Requires", summary.length ? summary.join(" · ") : null],
    ["Additional insured", r.additionalInsureds],
    ["Wording", r.specialWording],
    ["Notes", r.notes],
  ];

  return (
    <div className={`space-y-3 rounded-lg border bg-white p-4 shadow-sm ${open ? "border-pink-200" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {r.requesterName}
            {r.requesterCompany && <span className="font-normal text-gray-500"> · {r.requesterCompany}</span>}
          </p>
          <p className="text-xs text-gray-500">
            <a href={`mailto:${r.requesterEmail}`} className="hover:text-pink-600 hover:underline">{r.requesterEmail}</a>
            {r.requesterPhone && ` · ${r.requesterPhone}`}
            {` · received ${new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            {r.neededBy && <span className="font-medium text-gray-700"> · needed by {fmtDay(r.neededBy)}</span>}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.label}</span>
      </div>

      {projects && (
        <div className="text-sm">
          {r.projectId ? (
            <Link href={`/erp/projects/${r.projectId}?tab=COIs`} className="font-medium text-pink-600 hover:underline">
              {r.projectTitle}
            </Link>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">
                They wrote: <span className="text-gray-800">{r.projectText ?? "No project given"}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-72">
                  <SearchableSelect
                    value={projectId}
                    onChange={setProjectId}
                    options={projects.map((p) => ({ value: p.id, label: p.jobTitle }))}
                    placeholder="Search projects…"
                    allLabel="Pick the project"
                  />
                </div>
                <Button size="xs" disabled={!projectId || busy} onClick={() => patch({ projectId }, "Project set.")}>
                  Set project
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-md border border-gray-100">
        {r.holders.map((h, i) => (
          <li key={`${h.name}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{h.name}</p>
              {h.address && <p className="whitespace-pre-line text-xs text-gray-500">{h.address}</p>}
            </div>
            <div className="flex items-center gap-2">
              {h.matchedId ? (
                <span className="text-[11px] text-emerald-700" title={`Matches ${h.matchedName}`}>
                  Saved holder
                </span>
              ) : (
                <Button variant="ghost" size="xs" disabled={busy} onClick={() => saveHolder(i)}>
                  Save to holders
                </Button>
              )}
              {onAddCoi && open && (
                <Button size="xs" onClick={() => onAddCoi(i)}>
                  Add COI
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <dl className="space-y-1 text-xs">
        {details
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="text-gray-500">{k}</dt>
              <dd className="whitespace-pre-line text-gray-800">{v}</dd>
            </div>
          ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs">
          {r.hasSample && (
            <a href={`/api/erp/insurance/requests/${r.id}/sample`} target="_blank" rel="noreferrer" className="font-medium text-pink-600 hover:underline">
              Their sample
            </a>
          )}
          {r.coiCount > 0 && <span className="text-gray-500">{r.coiCount} COI{r.coiCount === 1 ? "" : "s"} added</span>}
        </div>
        <div className="flex items-center gap-2">
          {r.status === "NEW" && (
            <span className="inline-flex items-center gap-1">
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => patch({ status: "PENDING_REVIEW" }, "Marked as with the broker.")}>
                Sent to broker
              </Button>
              <InfoTip align="right" text="Use when CoverDash puts it in pending review or it needs a policy change, so it's clear it's waiting on the broker." />
            </span>
          )}
          {open && (
            <>
              <Button variant="secondary" size="xs" disabled={busy} onClick={() => patch({ status: "DONE" }, "Marked done.")}>
                Mark done
              </Button>
              <Button variant="ghost" size="xs" disabled={busy} onClick={() => patch({ status: "CANCELLED" }, "Request cancelled.")}>
                Cancel
              </Button>
            </>
          )}
          {!open && (
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => patch({ status: "NEW" }, "Reopened.")}>
              Reopen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
