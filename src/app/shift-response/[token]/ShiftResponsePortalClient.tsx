"use client";

import { useState } from "react";

type ShiftInfo = {
  jobTitle: string;
  when: string;
  weekday: string;
  location: string | null;
  role: "Supervising" | "Working";
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  isPast: boolean;
};

type Props = {
  token: string;
  /** Pre-selects which single confirm button shows on first load — set by
   * the emailed link's own `?action=` param, so a mail client's link
   * prefetcher hitting this page (a GET, read-only) never actually records
   * anything: only the on-page button click below does that. */
  initialAction: "accept" | "decline" | null;
  shift: ShiftInfo;
};

const primaryBtn =
  "rounded-md bg-[#E73C6E] px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50";

export function ShiftResponsePortalClient({ token, initialAction, shift }: Props) {
  const [status, setStatus] = useState(shift.status);
  const [saving, setSaving] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  // Once someone's landed on this page and taken action once, flipping
  // their answer is a single click — no second confirm needed, they've
  // already proven they're a person by getting this far.
  const [changing, setChanging] = useState(false);

  async function respond(action: "accept" | "decline") {
    setError("");
    setSaving(action);
    try {
      const res = await fetch(`/api/shift-response/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { status?: "PENDING" | "ACCEPTED" | "DECLINED"; error?: string };
      if (!res.ok || !json.status) throw new Error(json.error ?? "Something went wrong");
      setStatus(json.status);
      setChanging(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(null);
    }
  }

  const verb = shift.role === "Supervising" ? "supervising" : "working on";

  return (
    <div className="min-h-screen bg-white px-4 py-12">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 text-center">
          <svg className="mx-auto mb-4 h-10 w-10 text-[#E73C6E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900">Your shift</h1>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-center">
          <p className="text-sm text-gray-500">You&apos;re {verb}</p>
          <p className="mt-1 text-lg font-bold text-gray-900">{shift.jobTitle}</p>
          <p className="mt-1 text-sm text-gray-700">{shift.when}</p>
          {shift.location ? <p className="mt-1 text-sm text-gray-500">{shift.location}</p> : null}
        </div>

        {error ? <p className="mt-4 text-center text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 text-center">
          {shift.isPast ? (
            <p className="text-sm text-gray-500">This shift already happened.</p>
          ) : status !== "PENDING" && !changing ? (
            <div className="space-y-3">
              <p className="text-base font-semibold text-emerald-700">
                {status === "ACCEPTED" ? `Got it, see you ${shift.weekday}.` : "Got it, we'll find coverage."}
              </p>
              <button type="button" onClick={() => setChanging(true)} className="text-sm font-medium text-gray-500 underline hover:text-gray-700">
                Change your answer
              </button>
            </div>
          ) : status !== "PENDING" && changing ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Currently: <strong>{status === "ACCEPTED" ? "I'll be there" : "Can't make it"}</strong>
              </p>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void respond(status === "ACCEPTED" ? "decline" : "accept")}
                className={status === "ACCEPTED" ? secondaryBtn : primaryBtn}
              >
                {saving ? "Saving…" : status === "ACCEPTED" ? "Actually, I can't make it" : "Actually, I'll be there"}
              </button>
              <div>
                <button type="button" onClick={() => setChanging(false)} className="text-sm font-medium text-gray-400 underline hover:text-gray-600">
                  Never mind
                </button>
              </div>
            </div>
          ) : initialAction ? (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void respond(initialAction)}
              className={initialAction === "accept" ? primaryBtn : secondaryBtn}
            >
              {saving ? "Saving…" : initialAction === "accept" ? "Yes, confirm I'll be there" : "Yes, confirm I can't make it"}
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button type="button" disabled={saving !== null} onClick={() => void respond("accept")} className={primaryBtn}>
                {saving === "accept" ? "Saving…" : "I'll be there"}
              </button>
              <button type="button" disabled={saving !== null} onClick={() => void respond("decline")} className={secondaryBtn}>
                {saving === "decline" ? "Saving…" : "Can't make it"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
