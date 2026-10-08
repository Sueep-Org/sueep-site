"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, InfoTip, inputClass, labelClass, useToast } from "@/app/erp/components/ui";

const input = inputClass.md;
const label = labelClass.default;
const card = "space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm";

type Recipient = { email: string; name: string; source: "link" | "building" };

export function SummaryForm({
  checkId,
  doneHref,
  recipients,
  defaultMessage,
  photoCount,
  hasDiscussion,
  alreadySent,
}: {
  checkId: string;
  doneHref: string;
  recipients: Recipient[];
  defaultMessage: string;
  photoCount: number;
  hasDiscussion: boolean;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>(alreadySent ? [] : recipients.map((r) => r.email));
  const [extra, setExtra] = useState("");
  const [message, setMessage] = useState(defaultMessage);
  // Area notes and the meeting notes are written for Sueep, so they're off until chosen.
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeDiscussion, setIncludeDiscussion] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(photoCount > 0);
  const [preview, setPreview] = useState<{ html: string; photoCount: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const options = { message, includeNotes, includeDiscussion, includePhotos };

  // Refresh the preview shortly after anything changes.
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/erp/janitorial/quality-checks/${checkId}/summary`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...options, preview: true }),
        });
        if (res.ok) setPreview(await res.json());
      } catch {
        // keep the last preview
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkId, message, includeNotes, includeDiscussion, includePhotos]);

  const extraList = extra.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
  const to = [...new Set([...picked, ...extraList])];

  async function send() {
    setError("");
    if (!to.length) return setError("Pick who gets the summary.");
    setSending(true);
    try {
      const res = await fetch(`/api/erp/janitorial/quality-checks/${checkId}/summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...options, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send");
        return;
      }
      toast(`Summary sent to ${to.length} ${to.length === 1 ? "person" : "people"}`, "success");
      router.push(doneHref);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }

  const toggle = (email: string) => setPicked((p) => (p.includes(email) ? p.filter((e) => e !== email) : [...p, email]));
  const checkbox = "h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className={card}>
          <h2 className="text-base font-semibold text-gray-900">Send to</h2>
          {recipients.length === 0 && (
            <p className="text-sm text-amber-700">No property manager on file for this building. Add an email below.</p>
          )}
          {recipients.map((r) => (
            <label key={r.email} className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={picked.includes(r.email)} onChange={() => toggle(r.email)} className={`${checkbox} mt-0.5`} />
              <span>
                {r.name} <span className="text-gray-500">{r.email}</span>
                <span className="ml-1 text-xs text-gray-400">{r.source === "link" ? "property manager link" : "building contact"}</span>
              </span>
            </label>
          ))}
          <div>
            <label className={label} htmlFor="sum-extra">Other emails</label>
            <input id="sum-extra" type="text" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="name@company.com" className={input} />
          </div>
        </section>

        <section className={card}>
          <div>
            <label className={label} htmlFor="sum-message">Message</label>
            <textarea id="sum-message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} className={input} />
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-1 text-sm font-medium text-gray-700">
              Include
              <InfoTip text="Each area's Good or Needs attention is always included. Area notes and meeting notes are written for Sueep, so read them before including." />
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} className={checkbox} />
              Area notes
            </label>
            <label className={`flex items-center gap-2 text-sm ${hasDiscussion ? "text-gray-800" : "text-gray-400"}`}>
              <input type="checkbox" disabled={!hasDiscussion} checked={includeDiscussion} onChange={(e) => setIncludeDiscussion(e.target.checked)} className={checkbox} />
              What we discussed
            </label>
            <label className={`flex items-center gap-2 text-sm ${photoCount ? "text-gray-800" : "text-gray-400"}`}>
              <input type="checkbox" disabled={!photoCount} checked={includePhotos} onChange={(e) => setIncludePhotos(e.target.checked)} className={checkbox} />
              Photos{photoCount ? ` (up to 6 of ${photoCount}, areas needing attention first)` : " (none taken)"}
            </label>
          </div>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={doneHref} className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            {alreadySent ? "Done" : "Skip for now"}
          </Link>
          <Button disabled={sending || !to.length} onClick={send}>
            {sending ? "Sending…" : alreadySent ? "Send again" : "Send summary"}
          </Button>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">Preview</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {preview ? (
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[560px] w-full" />
          ) : (
            <p className="p-4 text-sm text-gray-400">Loading preview…</p>
          )}
        </div>
      </section>
    </div>
  );
}
