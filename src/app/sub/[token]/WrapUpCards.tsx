"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dateLocale, tr, type Lang } from "@/lib/erp/language";
import { WHOLE_DAY_TASK, WRAP_UP_NOTE_MAX, WRAP_UP_REASON_MAX, WRAP_UP_REASON_MIN, type PortalWrapUp } from "@/lib/erp/subWrapUpShared";

/**
 * End-of-day wrap-up (subWrapUps.ts): for each day they ran that's over,
 * mark every task done or not done, with a reason for each one not done.
 * Shown above the tabs until sent. Needs signal.
 */

function dayLabel(key: string, lang: Lang): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function taskLabel(task: string, lang: Lang): string {
  return task === WHOLE_DAY_TASK ? tr(lang, { en: "The work scheduled for this day", es: "El trabajo programado para este día" }) : task;
}

type Answer = { done: boolean | null; reason: string };

function WrapUpCard({ token, wrap, lang, today }: { token: string; wrap: PortalWrapUp; lang: Lang; today: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>(() => wrap.tasks.map(() => ({ done: null, reason: "" })));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (i: number, patch: Partial<Answer>) => setAnswers((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const unanswered = answers.filter((a) => a.done === null).length;
  const missingReason = answers.some((a) => a.done === false && a.reason.trim().length < WRAP_UP_REASON_MIN);
  const ready = unanswered === 0 && !missingReason;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sub/${token}/wrap-up`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobKey: wrap.jobKey, dateKey: wrap.dateKey, answers: answers.map((a) => ({ done: a.done, reason: a.done ? null : a.reason })), note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.ok || data.code === "ALREADY_SENT") {
        router.refresh();
        return;
      }
      setError(data.error || tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }));
    } catch {
      setError(tr(lang, { en: "Couldn't connect. Try again when you have signal.", es: "No hay conexión. Intenta de nuevo cuando tengas señal." }));
    } finally {
      setBusy(false);
    }
  }

  const choice = (on: boolean, tone: "yes" | "no") =>
    `flex-1 rounded-md px-3 py-2 text-sm font-semibold ring-1 ${
      on ? (tone === "yes" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-red-600 text-white ring-red-600") : "bg-white text-gray-700 ring-gray-300"
    }`;

  return (
    <li className="rounded-lg border-2 border-pink-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-pink-600">
        {wrap.dateKey === today ? tr(lang, { en: "Wrap up today", es: "Cierra el día de hoy" }) : `${tr(lang, { en: "Wrap up", es: "Cierra" })} ${dayLabel(wrap.dateKey, lang)}`}
      </p>
      <h2 className="mt-0.5 text-base font-semibold text-gray-900">{wrap.title}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {tr(lang, { en: "Was each task done? If not, write why.", es: "¿Se hizo cada tarea? Si no, escribe por qué." })}
      </p>
      <ul className="mt-3 space-y-3">
        {wrap.tasks.map((task, i) => {
          const a = answers[i];
          return (
            <li key={i} className="rounded-md border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-900">{taskLabel(task, lang)}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={choice(a.done === true, "yes")} onClick={() => set(i, { done: true })} aria-pressed={a.done === true}>
                  {tr(lang, { en: "Done", es: "Hecho" })}
                </button>
                <button type="button" className={choice(a.done === false, "no")} onClick={() => set(i, { done: false })} aria-pressed={a.done === false}>
                  {tr(lang, { en: "Not done", es: "No hecho" })}
                </button>
              </div>
              {a.done === false && (
                <label className="mt-2 block text-sm text-gray-700">
                  {tr(lang, { en: "Why wasn't it done?", es: "¿Por qué no se hizo?" })}
                  <textarea
                    rows={2}
                    maxLength={WRAP_UP_REASON_MAX}
                    value={a.reason}
                    onChange={(e) => set(i, { reason: e.target.value })}
                    placeholder={tr(lang, { en: "e.g. unit was locked, ran out of paint", es: "ej. la unidad estaba cerrada, se acabó la pintura" })}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <label className="mt-3 block text-sm text-gray-700">
        {tr(lang, { en: "Anything else? (optional)", es: "¿Algo más? (opcional)" })}
        <textarea
          rows={2}
          maxLength={WRAP_UP_NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </label>
      {!ready && (
        <p className="mt-2 text-xs text-gray-500">
          {unanswered > 0
            ? tr(lang, { en: `Answer ${unanswered} more to send.`, es: `Responde ${unanswered} más para enviar.` })
            : tr(lang, { en: "Write why for each task not done.", es: "Escribe por qué para cada tarea no hecha." })}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void send()}
        className="mt-3 w-full rounded-lg bg-pink-600 px-4 py-3 text-base font-semibold text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {busy ? tr(lang, { en: "Sending…", es: "Enviando…" }) : tr(lang, { en: "Send wrap-up", es: "Enviar cierre" })}
      </button>
    </li>
  );
}

export function WrapUpCards({ token, wrapUps, lang, today }: { token: string; wrapUps: PortalWrapUp[]; lang: Lang; today: string }) {
  if (wrapUps.length === 0) return null;
  return (
    <ul className="space-y-3">
      {wrapUps.map((w) => (
        <WrapUpCard key={`${w.jobKey}|${w.dateKey}`} token={token} wrap={w} lang={lang} today={today} />
      ))}
    </ul>
  );
}
