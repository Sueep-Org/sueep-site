"use client";

import { useState } from "react";
import { Button, InfoTip, inputClass, labelClass, useToast } from "@/app/erp/components/ui";

export type EmailSuggestion = { name: string; email: string };

/** "Email it" box for a COI request link. Posts { to, message } to `endpoint`. */
export function EmailLinkSection({
  endpoint,
  suggestions,
  disabled = false,
  onSent,
}: {
  endpoint: string;
  suggestions: EmailSuggestion[];
  disabled?: boolean;
  onSent?: () => void;
}) {
  const toast = useToast();
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const toList = to.split(/[,;\s]+/).filter(Boolean);
  const isAdded = (email: string) => toList.some((e) => e.toLowerCase() === email.toLowerCase());

  async function send() {
    setError("");
    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send");
        return;
      }
      toast(data.sent === 1 ? "Link emailed." : `Link emailed to ${data.sent} people.`);
      setTo("");
      setMessage("");
      onSent?.();
    } catch {
      setError("Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Email it <InfoTip text="Sends the link from Sueep. Replies come back to your email." />
      </p>
      <div>
        <label className={labelClass.default} htmlFor={`${endpoint}-to`}>To</label>
        <input id={`${endpoint}-to`} type="text" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com" className={inputClass.md} />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => {
              const added = isAdded(s.email);
              return (
                <button
                  key={s.email}
                  type="button"
                  onClick={() => !added && setTo([...toList, s.email].join(", "))}
                  disabled={added}
                  title={s.email}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    added ? "border-pink-200 bg-pink-50 text-pink-700" : "border-gray-300 text-gray-700 hover:border-pink-400 hover:text-pink-600"
                  }`}
                >
                  {added ? "✓ " : "+ "}
                  {s.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <label className={labelClass.default} htmlFor={`${endpoint}-msg`}>Message (optional)</label>
        <textarea id={`${endpoint}-msg`} rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass.md} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" onClick={send} disabled={disabled || sending || !toList.length}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
