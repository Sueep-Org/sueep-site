"use client";

import { useMemo, useState } from "react";

type BackgroundCheckStatus = "PASSED" | "FAILED" | "PENDING" | "NOT_DONE";

const BG_OPTIONS: { value: BackgroundCheckStatus; label: string; cls: string }[] = [
  { value: "NOT_DONE",  label: "Not done",  cls: "border-gray-300 bg-gray-50 text-gray-600" },
  { value: "PENDING",   label: "Pending",   cls: "border-yellow-300 bg-yellow-50 text-yellow-700" },
  { value: "PASSED",    label: "Passed",    cls: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  { value: "FAILED",    label: "Failed",    cls: "border-red-300 bg-red-50 text-red-700" },
];

const BG_LABELS: Record<BackgroundCheckStatus, string> = {
  NOT_DONE: "Not done",
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
};

type BackgroundCheckEvent = {
  id: string;
  createdAt: string;
  previousStatus: string | null;
  newStatus: string;
  changedBy: string | null;
};

type Props = {
  contractorId: string;
  initialBackgroundCheckStatus: BackgroundCheckStatus;
  initialBackgroundCheckedAt: string | null;
  initialBackgroundCheckExpiresAt: string | null;
  initialBackgroundCheckProvider: string | null;
  initialBackgroundCheckNotes: string | null;
  initialBackgroundCheckConsentAt: string | null;
  initialBackgroundCheckEvents: BackgroundCheckEvent[];
};

// yyyy-mm-dd for <input type="date">
function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

export function ContractorBackgroundCheckSection({
  contractorId,
  initialBackgroundCheckStatus,
  initialBackgroundCheckedAt,
  initialBackgroundCheckExpiresAt,
  initialBackgroundCheckProvider,
  initialBackgroundCheckNotes,
  initialBackgroundCheckConsentAt,
  initialBackgroundCheckEvents,
}: Props) {
  const [bgStatus, setBgStatus] = useState<BackgroundCheckStatus>(initialBackgroundCheckStatus);
  const [bgSaving, setBgSaving] = useState(false);
  const [bgCheckedAt, setBgCheckedAt] = useState(toDateInputValue(initialBackgroundCheckedAt));
  const [bgExpiresAt, setBgExpiresAt] = useState(toDateInputValue(initialBackgroundCheckExpiresAt));
  const [bgProvider, setBgProvider] = useState(initialBackgroundCheckProvider ?? "");
  const [bgNotes, setBgNotes] = useState(initialBackgroundCheckNotes ?? "");
  const [bgConsentAt, setBgConsentAt] = useState(toDateInputValue(initialBackgroundCheckConsentAt));
  const [bgDetailsSaving, setBgDetailsSaving] = useState(false);
  const [bgDetailsOk, setBgDetailsOk] = useState(false);
  const [bgEvents, setBgEvents] = useState<BackgroundCheckEvent[]>(initialBackgroundCheckEvents);
  const expiringSoon = useMemo(() => {
    if (!bgExpiresAt) return false;
    const days = (new Date(bgExpiresAt).getTime() - Date.now()) / 86_400_000;
    return days <= 30;
  }, [bgExpiresAt]);

  async function saveBgStatus(next: BackgroundCheckStatus) {
    setBgSaving(true);
    try {
      const res = await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backgroundCheckStatus: next }),
      });
      const data = (await res.json()) as { backgroundCheckEvent?: BackgroundCheckEvent | null };
      if (data.backgroundCheckEvent) {
        setBgEvents((prev) => [data.backgroundCheckEvent as BackgroundCheckEvent, ...prev]);
      }
    } finally {
      setBgSaving(false);
    }
  }

  async function saveBgDetails() {
    setBgDetailsSaving(true);
    setBgDetailsOk(false);
    try {
      await fetch(`/api/erp/contractors/${contractorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          backgroundCheckedAt: bgCheckedAt || null,
          backgroundCheckExpiresAt: bgExpiresAt || null,
          backgroundCheckProvider: bgProvider || null,
          backgroundCheckNotes: bgNotes || null,
          backgroundCheckConsentAt: bgConsentAt || null,
        }),
      });
      setBgDetailsOk(true);
      setTimeout(() => setBgDetailsOk(false), 2000);
    } finally {
      setBgDetailsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">Track the status, dates, and provider for this contractor&apos;s background check.</p>

      <div className="flex flex-wrap gap-2">
        {BG_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={bgSaving}
            onClick={() => {
              setBgStatus(opt.value);
              void saveBgStatus(opt.value);
            }}
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium transition-opacity",
              bgStatus === opt.value ? opt.cls + " opacity-100 ring-2 ring-offset-1 ring-current" : "border-gray-200 bg-white text-gray-400 hover:border-gray-300",
              bgSaving ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
        {expiringSoon ? (
          <span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700">
            Expires soon
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className={labelCls} htmlFor="cbgConsentAt">
            Consent signed on
          </label>
          <input
            id="cbgConsentAt"
            type="date"
            value={bgConsentAt}
            onChange={(e) => setBgConsentAt(e.target.value)}
            onBlur={() => void saveBgDetails()}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cbgCheckedAt">
            Checked on
          </label>
          <input
            id="cbgCheckedAt"
            type="date"
            value={bgCheckedAt}
            onChange={(e) => setBgCheckedAt(e.target.value)}
            onBlur={() => void saveBgDetails()}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cbgExpiresAt">
            Expires / renew on
          </label>
          <input
            id="cbgExpiresAt"
            type="date"
            value={bgExpiresAt}
            onChange={(e) => setBgExpiresAt(e.target.value)}
            onBlur={() => void saveBgDetails()}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cbgProvider">
            Provider
          </label>
          <input
            id="cbgProvider"
            type="text"
            placeholder="e.g. Checkr, Sterling"
            value={bgProvider}
            onChange={(e) => setBgProvider(e.target.value)}
            onBlur={() => void saveBgDetails()}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="cbgNotes">
            Notes
          </label>
          <input
            id="cbgNotes"
            type="text"
            placeholder="e.g. reference #, adjudication notes"
            value={bgNotes}
            onChange={(e) => setBgNotes(e.target.value)}
            onBlur={() => void saveBgDetails()}
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-xs text-gray-400" aria-live="polite">
        {bgDetailsSaving ? "Saving..." : bgDetailsOk ? "Saved." : ""}
      </p>

      {bgEvents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">History</p>
          <ul className="space-y-1.5">
            {bgEvents.map((event) => (
              <li key={event.id} className="text-xs text-gray-600">
                <span className="text-gray-400">{new Date(event.createdAt).toLocaleString()}</span>
                {" · "}
                {event.previousStatus ? BG_LABELS[event.previousStatus as BackgroundCheckStatus] ?? event.previousStatus : "no status"}
                {" to "}
                <span className="font-medium text-gray-800">
                  {BG_LABELS[event.newStatus as BackgroundCheckStatus] ?? event.newStatus}
                </span>
                {event.changedBy ? ` by ${event.changedBy}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
