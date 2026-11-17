"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useConfirm, useToast } from "@/app/erp/components/ui";
import type { BulkResult, BulkSubRow } from "@/lib/erp/subBulkEmail";
import { attachmentProblem, formatFileSize, MAX_ATTACHMENTS } from "@/lib/erp/emailAttachments";

type WcFilter = "any" | "missing" | "missingSoon";
type LinkFilter = "any" | "yes" | "no";
type GlFilter = "any" | "missing";
/** Months back, or "any". */
type WorkedFilter = "any" | "3" | "6" | "12";

const bad = (st: BulkSubRow["wcStatus"]) => st === "MISSING" || st === "EXPIRED";

/** "YYYY-MM-DD" this many months ago. */
function monthsAgoKey(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

const WC_LABEL: Record<BulkSubRow["wcStatus"], { text: string; cls: string }> = {
  CURRENT: { text: "On file", cls: "text-emerald-700" },
  EXPIRING: { text: "Expiring", cls: "text-amber-700" },
  EXPIRED: { text: "Expired", cls: "text-red-600" },
  MISSING: { text: "Not on file", cls: "text-gray-500" },
  EXEMPT: { text: "Exempt", cls: "text-gray-500" },
};

const RESULT_LABEL: Record<BulkResult["result"], { text: string; cls: string }> = {
  sent: { text: "Sent", cls: "text-emerald-700" },
  failed: { text: "Failed", cls: "text-red-600" },
  limit: { text: "Not sent: daily limit", cls: "text-amber-700" },
  skipped: { text: "Skipped", cls: "text-gray-500" },
};

const input =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";

export function SubBulkEmail({ subs, room: initialRoom }: { subs: BulkSubRow[]; room: number }) {
  const confirm = useConfirm();
  const toast = useToast();

  const [linkFilter, setLinkFilter] = useState<LinkFilter>("any");
  const [wcFilter, setWcFilter] = useState<WcFilter>("any");
  const [activeOnly, setActiveOnly] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [glFilter, setGlFilter] = useState<GlFilter>("any");
  const [worked, setWorked] = useState<WorkedFilter>("any");
  const [search, setSearch] = useState("");
  /** Ticked off by hand; everyone the filters show is in unless here. */
  const [left, setLeft] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showEs, setShowEs] = useState(false);
  const [subjectEs, setSubjectEs] = useState("");
  const [bodyEs, setBodyEs] = useState("");
  const [includeInfoLink, setIncludeInfoLink] = useState(false);
  const [includePortalLink, setIncludePortalLink] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [testing, setTesting] = useState(false);

  const [sending, setSending] = useState(false);
  const [room, setRoom] = useState(initialRoom);
  const [results, setResults] = useState<Map<string, BulkResult>>(new Map());

  const roles = useMemo(() => [...new Set(subs.map((s) => s.role).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b)), [subs]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const since = worked === "any" ? null : monthsAgoKey(Number(worked));
    return subs.filter((s) => {
      if (activeOnly && s.status !== "ACTIVE") return false;
      if (roleFilter && s.role !== roleFilter) return false;
      if (glFilter === "missing" && !bad(s.glStatus)) return false;
      if (since && !(s.lastScheduledDay && s.lastScheduledDay >= since)) return false;
      if (linkFilter === "yes" && !s.gotInfoLink) return false;
      if (linkFilter === "no" && s.gotInfoLink) return false;
      if (wcFilter === "missing" && !(s.wcStatus === "MISSING" || s.wcStatus === "EXPIRED")) return false;
      if (wcFilter === "missingSoon" && !(s.wcStatus === "MISSING" || s.wcStatus === "EXPIRED" || s.wcStatus === "EXPIRING")) return false;
      if (q && !`${s.name} ${s.email ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [subs, activeOnly, roleFilter, glFilter, worked, linkFilter, wcFilter, search]);

  const picked = shown.filter((s) => s.email && !left.has(s.id));
  const spanishPicked = picked.filter((s) => s.language === "es").length;

  function toggle(id: string) {
    setLeft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(on: boolean) {
    setLeft((prev) => {
      const next = new Set(prev);
      for (const s of shown) {
        if (on) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }

  const fileError = attachmentProblem(files);
  const ready = !!subject.trim() && !!body.trim() && !fileError;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_ATTACHMENTS + 1));
    if (fileInput.current) fileInput.current.value = "";
  }

  function formFor(ids: string[], test: boolean): FormData {
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({
        ids,
        subject,
        body,
        subjectEs: showEs ? subjectEs : "",
        bodyEs: showEs ? bodyEs : "",
        includeInfoLink,
        includePortalLink,
        test,
      }),
    );
    for (const f of files) form.append("files", f);
    return form;
  }

  async function sendTest() {
    if (!ready) return;
    setTesting(true);
    try {
      // The first picked sub is the example, so their name and language show.
      const res = await fetch("/api/erp/contractors/bulk-email", { method: "POST", body: formFor(picked.slice(0, 1).map((s) => s.id), true) });
      const data = (await res.json().catch(() => ({}))) as { to?: string; error?: string };
      if (!res.ok) toast(data.error ?? "Couldn't send the test", "error");
      else toast(`Test sent to ${data.to}.`);
    } catch {
      toast("Network error", "error");
    } finally {
      setTesting(false);
    }
  }

  async function send() {
    if (!picked.length || !ready) return;
    const over = picked.length > room;
    const ok = await confirm({
      message: `Email ${picked.length} sub${picked.length === 1 ? "" : "s"}?${
        over ? ` Only ${room} more emails fit under today's limit, so the rest stay ticked to send after it resets.` : ""
      }${includeInfoLink ? " Each gets a new info form link, which replaces their old one." : ""}${files.length ? ` ${files.length} file${files.length === 1 ? "" : "s"} attached.` : ""}`,
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await fetch("/api/erp/contractors/bulk-email", { method: "POST", body: formFor(picked.map((s) => s.id), false) });
      const data = (await res.json().catch(() => ({}))) as { results?: BulkResult[]; remaining?: number; error?: string };
      if (!res.ok || !data.results) {
        toast(data.error ?? "Couldn't send", "error");
        return;
      }
      const map = new Map(results);
      for (const r of data.results) map.set(r.id, r);
      setResults(map);
      setRoom(data.remaining ?? 0);
      // Leave the ones that went out unticked, so pressing Send again only retries the rest.
      setLeft((prev) => {
        const next = new Set(prev);
        for (const r of data.results!) if (r.result === "sent") next.add(r.id);
        return next;
      });
      const sent = data.results.filter((r) => r.result === "sent").length;
      const rest = data.results.length - sent;
      toast(rest ? `Sent ${sent}. ${rest} didn't go out, see the list.` : `Sent to ${sent} sub${sent === 1 ? "" : "s"}.`, rest ? "error" : undefined);
    } catch {
      toast("Network error", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Who */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Who gets it</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            Info form link
            <select value={linkFilter} onChange={(e) => setLinkFilter(e.target.value as LinkFilter)} className={input}>
              <option value="any">Anyone</option>
              <option value="yes">Was sent the link</option>
              <option value="no">Never sent the link</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            Workers&apos; comp
            <select value={wcFilter} onChange={(e) => setWcFilter(e.target.value as WcFilter)} className={input}>
              <option value="any">Anyone</option>
              <option value="missing">Not on file or expired</option>
              <option value="missingSoon">Not on file, expired or expiring</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            General liability
            <select value={glFilter} onChange={(e) => setGlFilter(e.target.value as GlFilter)} className={input}>
              <option value="any">Anyone</option>
              <option value="missing">Not on file or expired</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
            Role
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={input}>
              <option value="">Any role</option>
              {roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 sm:col-span-2">
            On the schedule
            <select value={worked} onChange={(e) => setWorked(e.target.value as WorkedFilter)} className={input}>
              <option value="any">Anytime or never</option>
              <option value="3">In the last 3 months, or coming up</option>
              <option value="6">In the last 6 months, or coming up</option>
              <option value="12">In the last 12 months, or coming up</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 sm:col-span-2">
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className={input} />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active subs only
          </label>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            <strong className="text-gray-900">{picked.length}</strong> of {shown.length} picked
          </span>
          <span className="space-x-3">
            <button type="button" onClick={() => setAll(true)} className="hover:text-gray-900">Tick all</button>
            <button type="button" onClick={() => setAll(false)} className="hover:text-gray-900">Untick all</button>
          </span>
        </div>

        <div className="max-h-[480px] overflow-y-auto rounded border border-gray-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 text-left font-semibold">Sub</th>
                <th className="px-2 py-2 text-left font-semibold">WC</th>
                <th className="px-2 py-2 text-left font-semibold">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((s) => {
                const r = results.get(s.id);
                return (
                  <tr key={s.id} className={s.email ? "" : "opacity-50"}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" disabled={!s.email} checked={!!s.email && !left.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Include ${s.name}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Link href={`/erp/contractors/${s.id}`} className="font-medium text-gray-900 hover:underline">{s.name}</Link>
                      {s.language === "es" ? <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] font-semibold text-gray-600">ES</span> : null}
                      <div className="text-xs text-gray-500">{s.email ?? "No email"}{s.role ? ` · ${s.role}` : ""}</div>
                      {r ? <div className={`text-xs ${RESULT_LABEL[r.result].cls}`}>{RESULT_LABEL[r.result].text}{r.note ? `: ${r.note}` : ""}</div> : null}
                    </td>
                    <td className={`px-2 py-1.5 text-xs ${WC_LABEL[s.wcStatus].cls}`}>{WC_LABEL[s.wcStatus].text}</td>
                    <td className="px-2 py-1.5 text-xs text-gray-600">{s.gotInfoLink ? "Sent" : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No subs match these filters.</p>}
        </div>
      </section>

      {/* What */}
      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Message</h2>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="Sueep: Holiday schedule" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-700">
          Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={10_000} className={input}
            placeholder={"Write your announcement here.\n\nFor insurance requests, tick the info form button below so they can upload it."} />
          <span className="font-normal text-gray-500">Starts with &quot;Hi [their name],&quot; on its own. A blank line starts a new paragraph.</span>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={includeInfoLink} onChange={(e) => setIncludeInfoLink(e.target.checked)} />
          <span>
            Add a button to their info form
            <span className="block text-xs text-gray-500">For insurance or paperwork requests: where they enter or upload workers&apos; comp and other insurance. A new 7-day link, replacing their old one. Leave off for announcements.</span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={includePortalLink} onChange={(e) => setIncludePortalLink(e.target.checked)} />
          <span>
            Add a button to their Sueep page
            <span className="block text-xs text-gray-500">Their sub portal (jobs, offers, change orders). Signs them in for a week. Subs without a page get one, same as Email portal link; subs whose page is turned off get the email without the button.</span>
          </span>
        </label>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">
              Attach files
            </button>
            <span className="text-xs text-gray-500">Up to {MAX_ATTACHMENTS} files, 4 MB in total. Every sub gets the same files.</span>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
          {files.length ? (
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
                  <span className="truncate">{f.name} <span className="text-gray-400">({formatFileSize(f.size)})</span></span>
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="ml-2 text-red-500 hover:text-red-700">Remove</button>
                </li>
              ))}
            </ul>
          ) : null}
          {fileError ? <p className="text-xs text-red-600">{fileError}</p> : null}
        </div>

        <div className="rounded border border-gray-200 p-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={showEs} onChange={(e) => setShowEs(e.target.checked)} />
            Spanish version{spanishPicked ? ` (${spanishPicked} picked sub${spanishPicked === 1 ? "" : "s"} speak Spanish)` : ""}
          </label>
          {showEs ? (
            <div className="mt-3 space-y-3">
              <input value={subjectEs} onChange={(e) => setSubjectEs(e.target.value)} maxLength={200} placeholder="Asunto" className={input} />
              <textarea value={bodyEs} onChange={(e) => setBodyEs(e.target.value)} rows={7} maxLength={10_000} placeholder="Mensaje" className={input} />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-gray-500">Without one, Spanish speaking subs get the English message.</p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <span className={`text-xs ${picked.length > room ? "text-amber-700" : "text-gray-500"}`}>
            {room} emails left today{picked.length > room ? `, so only ${room} of ${picked.length} would go out now` : ""}
          </span>
          <span className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={testing || sending || !ready}
            title="Emails only you what the first picked sub would get"
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? "Sending…" : "Send me a test"}
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || testing || !picked.length || !ready}
            className="rounded bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send to ${picked.length}`}
          </button>
          </span>
        </div>
      </section>
    </div>
  );
}
