"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dateLocale, tr, type Lang } from "@/lib/erp/language";
import type { SubJob, SubJobDay, SubJobs } from "@/lib/erp/subPortalJobs";
import type { DeclineReason, PortalOffer } from "@/lib/erp/subOffers";
import type { TodayCheckIn } from "@/lib/erp/subCheckIns";
import type { PortalFix, ReviewStatus } from "@/lib/erp/subReviews";
import { FixCards } from "./FixCards";
import { LangToggle, useSubLang } from "./useSubLang";
import { TodayTab } from "./TodayTab";

type Tab = "offers" | "today" | "upcoming" | "past";

type ReasonOption = { value: DeclineReason; en: string; es: string };

function dayLabel(key: string, lang: Lang): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function timeLabel(time: string, lang: Lang): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)).toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 });
}

function StatusChip({ day, lang, past }: { day: SubJobDay; lang: Lang; past: boolean }) {
  if (past || !day.status || day.status === "CANCELLED") return null;
  const look =
    day.status === "CONFIRMED"
      ? { text: tr(lang, { en: "Confirmed", es: "Confirmado" }), cls: "bg-emerald-50 text-emerald-700" }
      : day.status === "DECLINED"
        ? { text: tr(lang, { en: "Can't make it", es: "No puedo ir" }), cls: "bg-red-50 text-red-700" }
        : { text: tr(lang, { en: "Answer needed", es: "Falta responder" }), cls: "bg-amber-50 text-amber-700" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${look.cls}`}>{look.text}</span>;
}

function crewWords(c: { count: number; names: string[] }, lang: Lang): string {
  const people = c.count === 1 ? tr(lang, { en: "1 person", es: "1 persona" }) : tr(lang, { en: `${c.count} people`, es: `${c.count} personas` });
  return c.names.length ? `${people}: ${c.names.join(", ")}` : people;
}

/** How many people (required) and who (optional). Used when accepting and from Upcoming. */
function CrewFields({ lang, count, names, onCount, onNames }: { lang: Lang; count: string; names: string; onCount: (v: string) => void; onNames: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-800">
        {tr(lang, { en: "How many people are you bringing?", es: "¿Cuántas personas vas a llevar?" })}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={count}
          onChange={(e) => onCount(e.target.value)}
          className="mt-1 block w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </label>
      <label className="block text-sm text-gray-700">
        {tr(lang, { en: "Names (optional, one per line)", es: "Nombres (opcional, uno por línea)" })}
        <textarea
          value={names}
          onChange={(e) => onNames(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />
      </label>
    </div>
  );
}

function validCount(v: string): boolean {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 50;
}

function CrewSection({ token, job, lang }: { token: string; job: SubJob; lang: Lang }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(job.crew ? String(job.crew.count) : "");
  const [names, setNames] = useState(job.crew ? job.crew.names.join("\n") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = job.crewDays.length > 0;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sub/${token}/crew`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: job.crewDays, count: Number(count), names }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(data.error ?? tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }));
      setEditing(false);
      router.refresh();
    } catch {
      setError(tr(lang, { en: "Couldn't connect. Check your internet and try again.", es: "No hay conexión. Revisa tu internet e intenta de nuevo." }));
    } finally {
      setBusy(false);
    }
  }

  if (editing || (!job.crew && canEdit)) {
    return (
      <div className={`mt-3 rounded-md p-3 ${job.crew ? "bg-gray-50" : "bg-amber-50"}`}>
        <CrewFields lang={lang} count={count} names={names} onCount={setCount} onNames={setNames} />
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy || !validCount(count)} onClick={() => void save()} className="rounded-md bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-500 disabled:opacity-50">
            {busy ? tr(lang, { en: "Saving…", es: "Guardando…" }) : tr(lang, { en: "Save crew", es: "Guardar equipo" })}
          </button>
          {editing && (
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">
              {tr(lang, { en: "Back", es: "Volver" })}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }
  if (!job.crew) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-700">
      <span>
        <span className="font-medium">{tr(lang, { en: "Crew", es: "Equipo" })}:</span> {crewWords(job.crew, lang)}
      </span>
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-pink-600 hover:underline">
          {tr(lang, { en: "Change", es: "Cambiar" })}
        </button>
      )}
    </p>
  );
}

function ReviewChip({ status, lang }: { status: ReviewStatus | undefined; lang: Lang }) {
  if (!status) return null;
  const look =
    status === "PASSED"
      ? { text: tr(lang, { en: "Passed check", es: "Revisión aprobada" }), cls: "bg-emerald-50 text-emerald-700" }
      : status === "NEEDS_FIX"
        ? { text: tr(lang, { en: "Fixes needed", es: "Arreglos pendientes" }), cls: "bg-red-50 text-red-700" }
        : { text: tr(lang, { en: "Being checked", es: "En revisión" }), cls: "bg-gray-100 text-gray-600" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${look.cls}`}>{look.text}</span>;
}

function JobCard({ token, job, lang, past, reviewResults }: { token: string; job: SubJob; lang: Lang; past: boolean; reviewResults: Record<string, ReviewStatus> }) {
  const first = job.days[0]!.dateKey;
  const last = job.days[job.days.length - 1]!.dateKey;
  const range = first === last ? dayLabel(first, lang) : `${dayLabel(first, lang)} - ${dayLabel(last, lang)}`;
  const mapUrl = job.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}` : null;

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{range}</p>
          <h2 className="mt-0.5 text-base font-semibold text-gray-900">{job.title}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {job.role === "lead" ? tr(lang, { en: "Running the job", es: "Dirigiendo" }) : tr(lang, { en: "Crew", es: "Equipo" })}
        </span>
      </div>

      {job.address && (
        <p className="mt-2 text-sm text-gray-700">
          {mapUrl ? (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
              {job.address}
            </a>
          ) : (
            job.address
          )}
        </p>
      )}

      {job.scope && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-medium">{tr(lang, { en: "Scope", es: "Trabajo" })}:</span> {job.scope}
        </p>
      )}

      {job.payCents != null && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-medium">{tr(lang, { en: "Pay", es: "Pago" })}:</span> {money(job.payCents)}
          {job.days.length > 1 && <span className="text-gray-500"> {tr(lang, { en: "for this visit, not per day", es: "por esta visita, no por día" })}</span>}
        </p>
      )}

      {job.notes && <p className="mt-2 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{job.notes}</p>}

      {job.role === "lead" && (past ? job.crew && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-medium">{tr(lang, { en: "Crew", es: "Equipo" })}:</span> {crewWords(job.crew, lang)}
        </p>
      ) : <CrewSection token={token} job={job} lang={lang} />)}

      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
        {job.days.map((d) => (
          <li key={d.dateKey} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-gray-800">
              {dayLabel(d.dateKey, lang)}
              {d.startTime && d.endTime ? (
                <span className="text-gray-500">
                  {" "}
                  {timeLabel(d.startTime, lang)} - {timeLabel(d.endTime, lang)}
                </span>
              ) : (
                <span className="text-gray-500"> {tr(lang, { en: "(all day)", es: "(todo el día)" })}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <ReviewChip status={reviewResults[`${job.jobKey}|${d.dateKey}`]} lang={lang} />
              <StatusChip day={d} lang={lang} past={past} />
              {!past && d.respondPath && (
                <a href={d.respondPath} className="text-xs font-medium text-pink-600 hover:underline">
                  {d.status === "PENDING" ? tr(lang, { en: "Answer", es: "Responder" }) : tr(lang, { en: "Change", es: "Cambiar" })}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>

      {!past && job.coRequestPath && (
        <a
          href={job.coRequestPath}
          className="mt-3 block rounded-md border border-pink-200 bg-pink-50 px-3 py-2 text-center text-sm font-medium text-pink-700 hover:bg-pink-100"
        >
          {tr(lang, { en: "Request a change order", es: "Solicitar una orden de cambio" })}
        </a>
      )}
    </li>
  );
}

function answerByLabel(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleString(dateLocale(lang), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function OfferCard({ token, offer, lang, reasons, onDone }: { token: string; offer: PortalOffer; lang: Lang; reasons: ReasonOption[]; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"idle" | "accept" | "decline">("idle");
  const [reason, setReason] = useState<DeclineReason | "">("");
  const [note, setNote] = useState("");
  const [crewCount, setCrewCount] = useState("");
  const [crewNames, setCrewNames] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = offer.days[0]!.dateKey;
  const last = offer.days[offer.days.length - 1]!.dateKey;
  const range = first === last ? dayLabel(first, lang) : `${dayLabel(first, lang)} - ${dayLabel(last, lang)}`;
  const mapUrl = offer.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(offer.address)}` : null;

  async function answer(action: "accept" | "decline") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/sub/${token}/offers/${offer.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "accept" ? { action, crewCount: Number(crewCount), crewNames } : { action, reason, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? tr(lang, { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." }));
        return;
      }
      onDone(
        action === "accept"
          ? tr(lang, { en: "Accepted. It's in Upcoming, and we emailed you the calendar invite.", es: "Aceptado. Está en Próximos y te enviamos la invitación del calendario." })
          : tr(lang, { en: "Declined. Thanks for letting us know.", es: "Rechazado. Gracias por avisarnos." }),
      );
    } catch {
      setError(tr(lang, { en: "Couldn't connect. Check your internet and try again.", es: "No hay conexión. Revisa tu internet e intenta de nuevo." }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border-2 border-pink-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{range}</p>
      <h2 className="mt-0.5 text-base font-semibold text-gray-900">{offer.title}</h2>
      {offer.address && (
        <p className="mt-2 text-sm">
          {mapUrl ? (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
              {offer.address}
            </a>
          ) : (
            offer.address
          )}
        </p>
      )}
      {offer.scope && (
        <p className="mt-2 text-sm text-gray-700">
          <span className="font-medium">{tr(lang, { en: "Scope", es: "Trabajo" })}:</span> {offer.scope}
        </p>
      )}
      {offer.payCents != null && (
        <p className="mt-2 text-lg font-semibold text-gray-900">
          {money(offer.payCents)}
          {offer.days.length > 1 && <span className="text-sm font-normal text-gray-500"> {tr(lang, { en: "for the visit, not per day", es: "por la visita, no por día" })}</span>}
        </p>
      )}
      {offer.notes && <p className="mt-2 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{offer.notes}</p>}
      <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100 text-sm">
        {offer.days.map((d) => (
          <li key={d.dateKey} className="py-1.5 text-gray-800">
            {dayLabel(d.dateKey, lang)}
            <span className="text-gray-500">
              {" "}
              {d.startTime && d.endTime ? `${timeLabel(d.startTime, lang)} - ${timeLabel(d.endTime, lang)}` : tr(lang, { en: "(all day)", es: "(todo el día)" })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs font-medium text-amber-700">
        {tr(lang, { en: "Answer by", es: "Responde antes de" })} {answerByLabel(offer.answerBy, lang)}
      </p>

      {mode === "idle" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("accept")} className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
            {tr(lang, { en: "Accept", es: "Aceptar" })}
          </button>
          <button type="button" onClick={() => setMode("decline")} className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {tr(lang, { en: "Decline", es: "Rechazar" })}
          </button>
        </div>
      )}

      {mode === "accept" && (
        <div className="mt-3 rounded-md bg-emerald-50 p-3">
          <p className="mb-2 text-sm text-emerald-900">
            {tr(lang, { en: "You'll be on the schedule for these days.", es: "Quedarás programado para estos días." })}
          </p>
          <CrewFields lang={lang} count={crewCount} names={crewNames} onCount={setCrewCount} onNames={setCrewNames} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy || !validCount(crewCount)} onClick={() => void answer("accept")} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? tr(lang, { en: "Saving…", es: "Guardando…" }) : tr(lang, { en: "Yes, accept", es: "Sí, aceptar" })}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("idle")} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">
              {tr(lang, { en: "Back", es: "Volver" })}
            </button>
          </div>
        </div>
      )}

      {mode === "decline" && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-800">{tr(lang, { en: "Why can't you take it?", es: "¿Por qué no puedes tomarlo?" })}</p>
          {reasons.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-sm text-gray-800">
              <input type="radio" name={`reason-${offer.id}`} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 accent-pink-600" />
              {r[lang]}
            </label>
          ))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={reason === "OTHER" ? tr(lang, { en: "Tell us why", es: "Dinos por qué" }) : tr(lang, { en: "Anything else? (optional)", es: "¿Algo más? (opcional)" })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || !reason || (reason === "OTHER" && !note.trim())}
              onClick={() => void answer("decline")}
              className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {busy ? tr(lang, { en: "Saving…", es: "Guardando…" }) : tr(lang, { en: "Decline", es: "Rechazar" })}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("idle")} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700">
              {tr(lang, { en: "Back", es: "Volver" })}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function SubPortal({
  token,
  firstName,
  jobs,
  offers,
  checkIns,
  fixes,
  reviewResults,
  declineReasons,
  profileLang,
  contactEmail,
}: {
  token: string;
  firstName: string;
  jobs: SubJobs;
  offers: PortalOffer[];
  checkIns: Record<string, TodayCheckIn>;
  fixes: PortalFix[];
  reviewResults: Record<string, ReviewStatus>;
  declineReasons: ReasonOption[];
  profileLang: Lang;
  contactEmail: string;
}) {
  const router = useRouter();
  const [lang, setLang] = useSubLang(profileLang);
  const todayJobs = jobs.upcoming.filter((j) => j.days.some((d) => d.dateKey === jobs.today));
  const [tab, setTab] = useState<Tab>(offers.length > 0 ? "offers" : todayJobs.length > 0 ? "today" : "upcoming");
  const [flash, setFlash] = useState("");
  const list = tab === "upcoming" ? jobs.upcoming : jobs.past;

  async function signOut() {
    await fetch(`/api/sub/${token}/sign-out`, { method: "POST" }).catch(() => {});
    router.refresh();
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "offers", label: tr(lang, { en: "Offers", es: "Ofertas" }), count: offers.length },
    { id: "today", label: tr(lang, { en: "Today", es: "Hoy" }), count: todayJobs.length },
    { id: "upcoming", label: tr(lang, { en: "Upcoming", es: "Próximos" }), count: jobs.upcoming.length },
    { id: "past", label: tr(lang, { en: "Past", es: "Pasados" }), count: jobs.past.length },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-10 pt-6 text-gray-900">
      <div className="mx-auto max-w-md space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
            <h1 className="text-lg font-semibold">
              {tr(lang, { en: "Hi", es: "Hola" })} {firstName}
            </h1>
          </div>
          <LangToggle lang={lang} onChange={setLang} />
        </header>

        {flash && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{flash}</p>}

        <FixCards token={token} fixes={fixes} lang={lang} />

        <div className="grid grid-cols-4 gap-1 rounded-lg bg-gray-200 p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-1 py-2 text-sm font-medium ${tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {t.label}{" "}
              <span className={t.id === "offers" && t.count > 0 ? "rounded-full bg-pink-600 px-1.5 text-xs text-white" : "text-gray-400"}>{t.count}</span>
            </button>
          ))}
        </div>

        {tab === "today" ? (
          <TodayTab token={token} jobs={todayJobs} today={jobs.today} checkIns={checkIns} lang={lang} />
        ) : tab === "offers" ? (
          offers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
              {tr(lang, { en: "No job offers right now. We'll email you when there's one.", es: "No hay ofertas ahora. Te enviaremos un correo cuando haya una." })}
            </p>
          ) : (
            <ul className="space-y-3">
              {offers.map((o) => (
                <OfferCard
                  key={o.id}
                  token={token}
                  offer={o}
                  lang={lang}
                  reasons={declineReasons}
                  onDone={(msg) => {
                    setFlash(msg);
                    router.refresh();
                  }}
                />
              ))}
            </ul>
          )
        ) : list.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            {tab === "upcoming"
              ? tr(lang, { en: "No upcoming jobs right now. We'll email you when you're scheduled.", es: "No tienes trabajos próximos. Te enviaremos un correo cuando estés programado." })
              : tr(lang, { en: "No past jobs in the last 6 months.", es: "No hay trabajos pasados en los últimos 6 meses." })}
          </p>
        ) : (
          <ul className="space-y-3">
            {list.map((j) => (
              <JobCard key={j.key} token={token} job={j} lang={lang} past={tab === "past"} reviewResults={reviewResults} />
            ))}
          </ul>
        )}

        <footer className="flex items-center justify-between pt-2 text-xs text-gray-500">
          <a href={`mailto:${contactEmail}`} className="hover:text-pink-600">
            {tr(lang, { en: "Questions?", es: "¿Preguntas?" })} {contactEmail}
          </a>
          <button type="button" onClick={signOut} className="hover:text-pink-600">
            {tr(lang, { en: "Sign out", es: "Cerrar sesión" })}
          </button>
        </footer>
      </div>
    </main>
  );
}
