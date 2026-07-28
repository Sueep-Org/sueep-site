"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type NudgeProject = { id: string; jobTitle: string };

const SCHEDULE_PATH = "/erp/schedule";

export function ScheduleNudgePopup() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<NudgeProject[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  // Suppressed on the Schedule page itself — this is a full-viewport blocking
  // overlay, so showing it there would sit on top of the calendar the PM
  // needs to click to actually resolve it. Re-fetches on every in-shell
  // navigation (matching ErpNav's usePathname + useEffect idiom) since this
  // layout persists across route changes rather than remounting — that reset
  // also re-arms `closed` so the X button only dismisses the current view,
  // not the whole day; a real page refresh remounts the component and
  // brings it back too, since `closed` starts false again either way.
  useEffect(() => {
    setClosed(false);
    if (pathname === SCHEDULE_PATH) {
      setProjects(null);
      return;
    }
    let cancelled = false;
    fetch("/api/erp/schedule-nudge")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: NudgeProject[] }) => {
        if (!cancelled) setProjects(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (pathname === SCHEDULE_PATH) return null;
  if (!projects || projects.length === 0) return null;
  if (closed) return null;

  async function dismiss(id: string) {
    setPendingId(id);
    setErrorId(null);
    const prev = projects;
    setProjects((cur) => (cur ? cur.filter((p) => p.id !== id) : cur));
    try {
      const res = await fetch("/api/erp/schedule-nudge/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (!res.ok) throw new Error("dismiss failed");
    } catch {
      setProjects(prev);
      setErrorId(id);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white shadow-xl">
        <div className="shrink-0 border-b border-gray-100 p-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Schedule today&apos;s work</h2>
            <button
              type="button"
              onClick={() => setClosed(true)}
              aria-label="Close"
              className="shrink-0 text-xl leading-none text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            These projects aren&apos;t on today&apos;s Schedule yet. Schedule it, or click Not today to clear it.
          </p>
        </div>
        <ul className="min-h-0 space-y-3 overflow-y-auto p-6 pt-4">
          {projects.map((p) => (
            <li key={p.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium text-gray-900" title={p.jobTitle}>{p.jobTitle}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <a href={`${SCHEDULE_PATH}?scheduleProjectId=${encodeURIComponent(p.id)}`} className="text-sm font-medium text-[#E73C6E] hover:underline">
                    Schedule it
                  </a>
                  <button
                    type="button"
                    disabled={pendingId === p.id}
                    onClick={() => dismiss(p.id)}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Not today
                  </button>
                </div>
              </div>
              {errorId === p.id && (
                <p className="mt-1 text-xs text-red-600">Couldn&apos;t dismiss — try again.</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
