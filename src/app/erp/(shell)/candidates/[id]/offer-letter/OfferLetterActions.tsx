"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";
import { displayValues, isoToday } from "@/lib/erp/offerLetters";

/** Send a saved draft: email it from the ERP, or record that it went out another way. */
export function SendOfferModal({
  open,
  onClose,
  candidateId,
  letterId,
  candidateEmail,
  values,
  missing,
}: {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  letterId: string;
  candidateEmail: string | null;
  values: Record<string, string>;
  missing: string[];
}) {
  const router = useRouter();
  const toast = useToast();
  const shown = displayValues(values);
  const [mode, setMode] = useState<"email" | "manual">(candidateEmail ? "email" : "manual");
  const [to, setTo] = useState(candidateEmail ?? "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(`Offer letter: ${shown.title || "your position"} at Sueep`);
  const [message, setMessage] = useState(
    [
      `Hi ${shown.firstName || "there"},`,
      `We're happy to offer you the ${shown.title ? `${shown.title} ` : ""}position at Sueep. Your offer letter is attached.`,
      `Please sign it and reply to this email with the signed copy${shown.signByDate ? ` by ${shown.signByDate}` : ""}.`,
      "We look forward to having you on the team,\nSueep",
    ].join("\n\n"),
  );
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    const res = await fetch(`/api/erp/candidates/${candidateId}/offer-letters/${letterId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "email"
          ? { mode, to, cc: cc.split(/[,\s;]+/).filter(Boolean), subject, message }
          : { mode },
      ),
    }).catch(() => null);
    setSending(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; emailSkipped?: boolean } | undefined;
    if (!res?.ok) return toast(data?.error || "Could not send", "error");
    onClose();
    if (data?.emailSkipped) toast("Marked sent, but no email went out: this server has no email key.", "error");
    else toast(mode === "email" ? `Offer letter emailed to ${to}.` : "Marked as sent.");
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Send offer letter</h2>
        {missing.length ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Fill in first: {missing.join(", ")}</p>
        ) : null}
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "email"} onChange={() => setMode("email")} />
            Email it with the PDF attached
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
            I sent it another way
          </label>
        </div>

        {mode === "email" ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass.default} htmlFor="send-to">To</label>
                <input id="send-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="candidate@email.com" className={inputClass.md} />
              </div>
              <div>
                <label className={labelClass.default} htmlFor="send-cc">Cc (optional)</label>
                <input id="send-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@sueep.com" className={inputClass.md} />
              </div>
            </div>
            <div>
              <label className={labelClass.default} htmlFor="send-subject">Subject</label>
              <input id="send-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass.md} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="send-msg">Message</label>
              <textarea id="send-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className={inputClass.md} />
            </div>
            <p className="text-xs text-gray-500">You get a copy, and replies come to you.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-600">The letter is saved as sent, with Edwin&apos;s signature, so you can download that copy and send it yourself.</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={send} disabled={sending || missing.length > 0 || (mode === "email" && !to.trim())}>
            {sending ? "Sending…" : mode === "email" ? "Send email" : "Mark as sent"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Upload the signed copy the candidate sent back. */
export function UploadSignedModal({ open, onClose, candidateId, letterId }: { open: boolean; onClose: () => void; candidateId: string; letterId: string }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [signedAt, setSignedAt] = useState(isoToday());
  const [busy, setBusy] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast("Pick the signed PDF", "error");
    const fd = new FormData();
    fd.set("file", file);
    fd.set("signedAt", signedAt);
    setBusy(true);
    const res = await fetch(`/api/erp/candidates/${candidateId}/offer-letters/${letterId}/signed`, { method: "POST", body: fd }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) return toast(data?.error || "Could not upload", "error");
    onClose();
    toast("Signed offer letter saved.");
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <form onSubmit={upload} className="space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Upload signed copy</h2>
        <div>
          <label className={labelClass.default} htmlFor="signed-file">Signed letter (PDF)</label>
          <input id="signed-file" ref={fileRef} type="file" accept="application/pdf" required className="mt-1 block w-full text-sm text-gray-700" />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="signed-at">Signed on</label>
          <input id="signed-at" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} className={inputClass.md} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Modal>
  );
}
