"use client";

import { useState } from "react";
import { Button, Modal, inputClass, labelClass } from "@/app/erp/components/ui";
import { isEmailAddress } from "@/lib/erp/projectContacts";
import { MAX_ATTACHMENTS, attachmentProblem, formatFileSize } from "@/lib/erp/emailAttachments";

export type EmailablePerson = { name: string; email: string; from: string };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Address field that holds several people: type to search the project's
 * contacts, or type any address and press Enter or comma to add it.
 */
function RecipientPicker({
  id,
  value,
  onChange,
  people,
  exclude,
  placeholder,
}: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  people: EmailablePerson[];
  /** Addresses already used in the other field or locked in, so they aren't offered twice. */
  exclude: string[];
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const taken = (email: string) => [...value, ...exclude].some((e) => same(e, email));
  const q = query.trim().toLowerCase();
  const options = people.filter((p) => !taken(p.email) && (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)));
  const nameFor = (email: string) => people.find((p) => same(p.email, email))?.name;

  function add(email: string) {
    const e = email.trim().toLowerCase();
    if (e && !taken(e)) onChange([...value, e]);
    setQuery("");
  }

  /** Turns what's typed into a chip when it's a full address. Returns false when text is left over. */
  function commitTyped(): boolean {
    const typed = query.trim().replace(/[,;]$/, "");
    if (!typed) return true;
    if (!isEmailAddress(typed)) return false;
    add(typed);
    return true;
  }

  return (
    <div className="relative">
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500">
        {value.map((email) => (
          <span key={email} className="flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-xs text-gray-800">
            {nameFor(email) ? `${nameFor(email)} (${email})` : email}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              className="rounded-full px-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              onClick={() => onChange(value.filter((e) => e !== email))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={query}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[10rem] flex-1 border-0 bg-transparent p-1 text-sm text-gray-900 focus:outline-none focus:ring-0"
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Delay so a click on a suggestion lands before the list closes.
          onBlur={() => setTimeout(() => { setOpen(false); commitTyped(); }, 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === ";") {
              e.preventDefault();
              if (!commitTyped() && options.length === 1) add(options[0].email);
            } else if (e.key === "Backspace" && !query && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && options.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {options.map((p) => (
            <li key={p.email}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(p.email)}
              >
                <span className="text-gray-900">
                  {p.name} <span className="text-gray-500">{p.email}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-400">{p.from}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Write an email to people on the project. Two steps: write, then check who gets it before it goes out. */
export function ProjectEmailComposer({
  projectId,
  people,
  senderEmail,
  left,
  onClose,
  onSent,
}: {
  projectId: string;
  people: EmailablePerson[];
  senderEmail: string;
  /** Addresses that can still be emailed today before project emails pause. */
  left: number;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [step, setStep] = useState<"write" | "review">("write");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  /** Which project button the email will carry, from the server's preview. */
  const [link, setLink] = useState<"ERP" | "PORTAL" | null>(null);
  const [error, setError] = useState("");

  const nameFor = (email: string) => people.find((p) => same(p.email, email))?.name;
  const show = (email: string) => (nameFor(email) ? `${nameFor(email)} (${email})` : email);

  async function onReview(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!to.length) return setError("Pick at least one recipient. Press Enter after typing an address to add it.");
    if (!subject.trim()) return setError("Enter a subject");
    if (!message.trim()) return setError("Write a message");
    const fileProblem = attachmentProblem(files);
    if (fileProblem) return setError(fileProblem);
    // To, CC and the sender's own copy each count as one email.
    const count = to.length + cc.length + 1;
    if (count > left) return setError(`This goes to ${count} addresses with your copy, and only ${left} more can be emailed today. Remove some people or send it tomorrow.`);
    setChecking(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, cc, subject, message, preview: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.error || "Could not check this email");
      setLink(data?.link ?? null);
      setStep("review");
    } catch {
      setError("Network error");
    } finally {
      setChecking(false);
    }
  }

  async function onSend() {
    setError("");
    setSending(true);
    try {
      // Multipart so the files ride along. The browser sets the content type.
      const form = new FormData();
      form.set("to", JSON.stringify(to));
      form.set("cc", JSON.stringify(cc));
      form.set("subject", subject);
      form.set("message", message);
      for (const f of files) form.append("files", f);
      const res = await fetch(`/api/erp/projects/${projectId}/messages`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "The email could not be sent");
        return;
      }
      onSent();
    } catch {
      setError("Network error. The email may not have been sent, check the Email Log before trying again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={false} size="lg">
      {step === "write" ? (
        <form onSubmit={onReview}>
          <h2 className="text-base font-semibold text-gray-900">Write email</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelClass.default} htmlFor="pe-to">To</label>
              <RecipientPicker id="pe-to" value={to} onChange={setTo} people={people} exclude={[...cc, senderEmail]} placeholder="Search contacts or type an address" />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pe-cc">CC</label>
              <RecipientPicker id="pe-cc" value={cc} onChange={setCc} people={people} exclude={[...to, senderEmail]} placeholder="Optional" />
              <p className="mt-1 text-xs text-gray-500">You ({senderEmail}) are always copied, and replies come to you.</p>
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pe-subject">Subject</label>
              <input id="pe-subject" className={inputClass.md} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pe-message">Message</label>
              <textarea id="pe-message" className={inputClass.md} rows={9} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div>
              <label className={labelClass.default} htmlFor="pe-files">Attachments</label>
              <input
                id="pe-files"
                type="file"
                multiple
                className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-50"
                onChange={(e) => {
                  // Adds to the list, so files can be picked a few at a time.
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((prev) => [...prev, ...picked.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
                  e.target.value = "";
                }}
              />
              <p className="mt-1 text-xs text-gray-500">Up to {MAX_ATTACHMENTS} files, 4 MB in total. A copy is kept on the project.</p>
              {files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <li key={`${f.name}:${f.size}`} className="flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-xs text-gray-800">
                      {f.name} <span className="text-gray-500">{formatFileSize(f.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${f.name}`}
                        className="rounded-full px-1 text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                        onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Discard</Button>
            <Button type="submit" size="sm" disabled={checking}>{checking ? "Checking..." : "Review"}</Button>
          </div>
        </form>
      ) : (
        <div>
          <h2 className="text-base font-semibold text-gray-900">Send this email?</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className={labelClass.default}>To</dt>
              <dd className="text-gray-900">{to.map(show).join(", ")}</dd>
            </div>
            <div>
              <dt className={labelClass.default}>CC</dt>
              <dd className="text-gray-900">{[`You (${senderEmail})`, ...cc.map(show)].join(", ")}</dd>
            </div>
            <div>
              <dt className={labelClass.default}>Subject</dt>
              <dd className="text-gray-900">{subject.trim()}</dd>
            </div>
            <div>
              <dt className={labelClass.default}>Message</dt>
              <dd className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-3 text-gray-900">{message.trim()}</dd>
            </div>
            {files.length > 0 && (
              <div>
                <dt className={labelClass.default}>Attachments</dt>
                <dd className="text-gray-900">{files.map((f) => `${f.name} (${formatFileSize(f.size)})`).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt className={labelClass.default}>Project link</dt>
              <dd className="text-gray-900">
                {link === "ERP"
                  ? "An Open project button is added, since someone in To has a Sueep login. Everyone on the email sees it, but it only works with a login."
                  : link === "PORTAL"
                    ? "A button to the property manager's own page is added."
                    : "None. Nobody in To has a login."}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-500">
            It cannot be changed or unsent after this. A copy is kept on the project. Uses {to.length + cc.length + 1} of the {left} emails left today.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setError(""); setStep("write"); }} disabled={sending}>Back</Button>
            <Button size="sm" onClick={onSend} disabled={sending}>{sending ? "Sending..." : "Send email"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
