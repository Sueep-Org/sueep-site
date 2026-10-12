"use client";

import { useState } from "react";
import { Button, InfoTip, Modal } from "@/app/erp/components/ui";
import { STATUS_STYLE } from "@/app/erp/(shell)/notifications/log/status";
import { formatFileSize } from "@/lib/erp/emailAttachments";

export type ProjectEmailRow = {
  id: string;
  sentAt: string;
  /** Typed out on this tab by someone, as opposed to sent by the ERP automatically. */
  written: boolean;
  typeLabel: string;
  to: string[];
  cc: string[];
  subject: string;
  status: string;
  sentBy: string | null;
  hasAttachments: boolean;
};

type Detail = { attachments: { id: string; filename: string; size: number }[]; to: string[]; cc: string[]; replyTo: string | null; subject: string; status: string; error: string | null; html: string | null; hasAttachments: boolean; sentBy: string | null; createdAt: string };
type Filter = "all" | "written" | "automatic";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "written", label: "Written by staff" },
  { value: "automatic", label: "Automatic" },
];

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Every email about the project, read-only: nothing here can be edited or deleted. */
export function ProjectEmailHistory({ projectId, emails, limit }: { projectId: string; emails: ProjectEmailRow[]; limit: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<ProjectEmailRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState("");

  const rows = emails.filter((e) => filter === "all" || (filter === "written") === e.written);

  async function onOpen(row: ProjectEmailRow) {
    setOpen(row);
    setDetail(null);
    setLoadError("");
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/messages/${row.id}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setLoadError("Could not load this email.");
    }
  }

  return (
    <div className="space-y-3 border-t border-gray-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Emails
          <InfoTip text="Every email about this project: the ones written here and the automatic ones (job briefs, change order notices, reschedules, ready to bill). Kept as a record, so they can't be edited or deleted. Replies go to the sender's own inbox and aren't shown here." />
        </h2>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={
                filter === f.value
                  ? "rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-800"
                  : "rounded-full px-3 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          {emails.length === 0 ? "No emails about this project yet." : "No emails match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2 font-medium">Sent</th>
                <th className="py-2 pr-2 font-medium">Subject</th>
                <th className="py-2 pr-2 font-medium">To</th>
                <th className="py-2 pr-2 font-medium">From</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((e) => {
                const style = STATUS_STYLE[e.status] ?? STATUS_STYLE.SENT;
                return (
                  <tr key={e.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onOpen(e)}>
                    <td className="whitespace-nowrap py-2 pr-2 text-gray-600">{when(e.sentAt)}</td>
                    <td className="py-2 pr-2">
                      <button type="button" className="text-left font-medium text-gray-900 hover:text-pink-600 hover:underline">{e.subject}</button>
                      {!e.written && <span className="ml-2 text-xs text-gray-500">{e.typeLabel}</span>}
                      {e.hasAttachments && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">Attachment</span>}
                    </td>
                    <td className="py-2 pr-2 text-gray-600">
                      {e.to.slice(0, 2).join(", ")}
                      {e.to.length > 2 && ` +${e.to.length - 2}`}
                    </td>
                    <td className="py-2 pr-2 text-gray-600">{e.sentBy ?? "Automatic"}</td>
                    <td className="py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style.cls}`} title={style.hint}>{style.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {emails.length >= limit && <p className="text-xs text-gray-500">Showing the latest {limit} emails.</p>}

      <Modal open={open !== null} onClose={() => setOpen(null)} size="lg">
        {open && (
          <>
            <h2 className="text-base font-semibold text-gray-900">{open.subject}</h2>
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[4.5rem_1fr]">
              <dt className="text-gray-500">Sent</dt>
              <dd className="text-gray-900">{when(open.sentAt)}</dd>
              <dt className="text-gray-500">From</dt>
              <dd className="break-words text-gray-900">{open.sentBy ?? `Automatic (${open.typeLabel})`}</dd>
              <dt className="text-gray-500">To</dt>
              <dd className="break-words text-gray-900">{open.to.join(", ")}</dd>
              {open.cc.length > 0 && (
                <>
                  <dt className="text-gray-500">CC</dt>
                  <dd className="break-words text-gray-900">{open.cc.join(", ")}</dd>
                </>
              )}
              <dt className="text-gray-500">Status</dt>
              <dd className="text-gray-900">{(STATUS_STYLE[open.status] ?? STATUS_STYLE.SENT).label}</dd>
            </dl>
            {detail?.error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{detail.error}</p>}
            {detail && detail.attachments.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {detail.attachments.map((a) => (
                  <li key={a.id}>
                    <a
                      href={`/api/erp/projects/${projectId}/messages/${open.id}/attachments/${a.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-pink-600 hover:underline"
                    >
                      {a.filename} <span className="text-gray-500">{formatFileSize(a.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {detail && open.hasAttachments && detail.attachments.length === 0 && (
              <p className="mt-3 text-xs text-gray-500">This email had an attachment that was not kept (like a calendar invite).</p>
            )}
            <div className="mt-3">
              {loadError ? (
                <p className="text-sm text-red-600">{loadError}</p>
              ) : !detail ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : detail.html ? (
                <iframe title="Email preview" srcDoc={detail.html} sandbox="" className="h-[420px] w-full rounded-lg border border-gray-200 bg-white" />
              ) : (
                <p className="text-sm text-gray-500">The content of this email was not kept.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setOpen(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
