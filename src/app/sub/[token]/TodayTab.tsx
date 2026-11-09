"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dateLocale, tr, type Lang } from "@/lib/erp/language";
import type { SubJob } from "@/lib/erp/subPortalJobs";
import type { TodayCheckIn } from "@/lib/erp/subCheckIns";
import { MAX_AREA_LENGTH, TURNOVER_PHOTO_AREAS, photoAreaLabel, type PhotoKind } from "@/lib/erp/subPhotoAreas";
import { preparePhoto } from "@/lib/subPhotoClient";
import { addToQueue, readQueue, removeFromQueue, type QueueItem, type QueuedPhoto, type Tap } from "./subQueue";

/**
 * Today tab of the sub portal (subCheckIns.ts, subPhotos.ts): Check in,
 * before and after photos, Check out, per job today. Location is read only
 * when they tap or take a photo. With no signal, taps and photos wait on the
 * phone (subQueue.ts) with their own time and go out, in order, once it's back.
 */

/** Codes that mean it's already saved (or can never be), so a queued copy can go */
const DONE_CODES = new Set(["ALREADY_IN", "ALREADY_OUT"]);

const LOCATION_WAIT_MS = { tap: 8000, photo: 4000 };

/** Best effort; nothing waits on it longer than the timeout. */
function getLocation(timeout: number): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 120_000 },
    );
  });
}

type SendResult = { ok: true } | { ok: false; offline: true } | { ok: false; offline: false; error: string; code?: string };

async function readResult(res: Response): Promise<SendResult> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (res.ok) return { ok: true };
  if (res.status >= 500) return { ok: false, offline: true };
  return { ok: false, offline: false, error: data.error ?? "", code: data.code };
}

async function sendTap(token: string, tap: Tap, queued: boolean): Promise<SendResult> {
  try {
    const res = await fetch(`/api/sub/${token}/check-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A live tap uses the server's clock; only a queued one sends its own time
      body: JSON.stringify(queued ? tap : { ...tap, tappedAt: undefined }),
    });
    return readResult(res);
  } catch {
    return { ok: false, offline: true };
  }
}

async function sendPhoto(token: string, p: QueuedPhoto, queued: boolean): Promise<SendResult> {
  const form = new FormData();
  form.append("file", p.blob, "photo.jpg");
  form.append("jobKey", p.jobKey);
  form.append("kind", p.kind);
  if (p.area) form.append("area", p.area);
  if (queued) form.append("takenAt", p.takenAt);
  if (p.latitude != null && p.longitude != null) {
    form.append("latitude", String(p.latitude));
    form.append("longitude", String(p.longitude));
    if (p.accuracy != null) form.append("accuracy", String(p.accuracy));
  }
  try {
    return readResult(await fetch(`/api/sub/${token}/photos`, { method: "POST", body: form }));
  } catch {
    return { ok: false, offline: true };
  }
}

function sendItem(token: string, item: QueueItem): Promise<SendResult> {
  return item.type === "tap" ? sendTap(token, item.tap, true) : sendPhoto(token, item.photo, true);
}

function timeOf(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function wallTime(time: string, lang: Lang): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)).toLocaleTimeString(dateLocale(lang), { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

const SOMETHING_WRONG = { en: "Something went wrong. Try again.", es: "Algo salió mal. Intenta de nuevo." };

/** A photo on the card: saved on the server, waiting on the phone, or uploading now */
type CardPhoto = { key: string; kind: PhotoKind; area: string | null; src: string; state: "saved" | "waiting" | "sending"; id?: string };

function PhotoStrip({
  photos,
  lang,
  canRemove,
  onRemove,
}: {
  photos: CardPhoto[];
  lang: Lang;
  canRemove: boolean;
  onRemove: (id: string) => void;
}) {
  if (photos.length === 0) return null;
  return (
    <ul className="mt-2 grid grid-cols-4 gap-1.5">
      {photos.map((p) => (
        <li key={p.key} className="relative aspect-square overflow-hidden rounded-md bg-gray-100">
          <a href={p.state === "saved" ? p.src.replace("?size=thumb", "") : undefined} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={photoAreaLabel(p.area) ?? ""} className={`h-full w-full object-cover ${p.state === "saved" ? "" : "opacity-60"}`} />
          </a>
          {p.area && <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 text-[10px] text-white">{photoAreaLabel(p.area)}</span>}
          {p.state !== "saved" && (
            <span className="absolute inset-x-0 top-0 bg-amber-500/90 px-1 text-center text-[10px] font-medium text-white">
              {p.state === "sending" ? tr(lang, { en: "Sending…", es: "Enviando…" }) : tr(lang, { en: "Waiting", es: "En espera" })}
            </span>
          )}
          {canRemove && p.state === "saved" && p.id && (
            <button
              type="button"
              onClick={() => onRemove(p.id!)}
              aria-label={tr(lang, { en: "Remove photo", es: "Quitar foto" })}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-white"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function PhotoSection({
  token,
  job,
  lang,
  saved,
  waiting,
  open,
  onPhoto,
}: {
  token: string;
  job: SubJob;
  lang: Lang;
  saved: TodayCheckIn | null;
  waiting: { key: string; photo: QueuedPhoto; url: string }[];
  /** Checked in and not out yet: photos can be added and removed */
  open: boolean;
  onPhoto: (p: QueuedPhoto) => Promise<string | null>;
}) {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [sending, setSending] = useState<CardPhoto[]>([]);
  const [error, setError] = useState("");
  const inputs = { before: useRef<HTMLInputElement>(null), after: useRef<HTMLInputElement>(null) };
  const turnover = saved?.turnover ?? false;
  const needs = saved?.needs ?? { before: 0, after: 0 };

  const all: CardPhoto[] = [
    ...(saved?.photos ?? []).map((p): CardPhoto => ({ key: p.id, id: p.id, kind: p.kind, area: p.area, src: `/api/sub/${token}/photos/${p.id}?size=thumb`, state: "saved" })),
    ...waiting.map((w): CardPhoto => ({ key: w.key, kind: w.photo.kind, area: w.photo.area, src: w.url, state: "waiting" })),
    ...sending,
  ];

  async function take(kind: PhotoKind, file: File | undefined) {
    if (!file) return;
    setError("");
    const takenAt = new Date();
    const key = `sending-${takenAt.getTime()}-${Math.random()}`;
    const preview = URL.createObjectURL(file);
    setSending((s) => [...s, { key, kind, area: area || null, src: preview, state: "sending" }]);
    try {
      const [pos, blob] = await Promise.all([getLocation(LOCATION_WAIT_MS.photo), preparePhoto(file, takenAt)]);
      const msg = await onPhoto({
        jobKey: job.jobKey,
        kind,
        area: area || null,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        accuracy: pos?.accuracy ?? null,
        takenAt: takenAt.toISOString(),
        blob,
      });
      if (msg) setError(msg);
    } finally {
      setSending((s) => s.filter((p) => p.key !== key));
      URL.revokeObjectURL(preview);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/sub/${token}/photos/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || tr(lang, SOMETHING_WRONG));
        return;
      }
      router.refresh();
    } catch {
      setError(tr(lang, { en: "Couldn't connect. Try again when you have signal.", es: "No hay conexión. Intenta de nuevo cuando tengas señal." }));
    }
  }

  const kinds: { kind: PhotoKind; title: string; add: string }[] = [
    { kind: "before", title: tr(lang, { en: "Before photos", es: "Fotos de antes" }), add: tr(lang, { en: "Take a before photo", es: "Tomar foto de antes" }) },
    { kind: "after", title: tr(lang, { en: "After photos", es: "Fotos de después" }), add: tr(lang, { en: "Take an after photo", es: "Tomar foto de después" }) },
  ];

  if (!open && all.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      {open && (
        <label className="block text-sm text-gray-700">
          {turnover ? tr(lang, { en: "Room for the next photo", es: "Área de la próxima foto" }) : tr(lang, { en: "Where is the next photo? (optional)", es: "¿Dónde es la próxima foto? (opcional)" })}
          {turnover ? (
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            >
              <option value="">{tr(lang, { en: "Whole unit", es: "Toda la unidad" })}</option>
              {TURNOVER_PHOTO_AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={area}
              maxLength={MAX_AREA_LENGTH}
              onChange={(e) => setArea(e.target.value)}
              placeholder={tr(lang, { en: "e.g. 3rd floor hallway", es: "ej. pasillo del 3er piso" })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
            />
          )}
        </label>
      )}
      {kinds.map(({ kind, title, add }) => {
        const mine = all.filter((p) => p.kind === kind);
        const need = needs[kind];
        const short = need > 0 && mine.length < need;
        return (
          <div key={kind}>
            <p className="flex items-center justify-between text-sm font-medium text-gray-800">
              <span>{title}</span>
              <span className={short ? "text-amber-700" : "text-gray-500"}>
                {need > 0 ? tr(lang, { en: `${Math.min(mine.length, need)} of ${need}`, es: `${Math.min(mine.length, need)} de ${need}` }) : mine.length}
              </span>
            </p>
            <PhotoStrip photos={mine} lang={lang} canRemove={open} onRemove={(id) => void remove(id)} />
            {open && (
              <>
                <input
                  ref={inputs[kind]}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void take(kind, file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => inputs[kind].current?.click()}
                  className="mt-2 w-full rounded-lg border-2 border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-pink-300 hover:text-pink-700"
                >
                  + {add}
                </button>
              </>
            )}
          </div>
        );
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function TodayCard({
  token,
  job,
  today,
  lang,
  saved,
  pending,
  onTap,
  onPhoto,
}: {
  token: string;
  job: SubJob;
  today: string;
  lang: Lang;
  saved: TodayCheckIn | null;
  pending: { key: string; item: QueueItem; url: string | null }[];
  onTap: (tap: Tap) => Promise<string | null>;
  onPhoto: (p: QueuedPhoto) => Promise<string | null>;
}) {
  const day = job.days.find((d) => d.dateKey === today)!;
  const lead = job.role === "lead";
  const [count, setCount] = useState(job.crew ? String(job.crew.count) : "");
  const [busy, setBusy] = useState<"in" | "out" | null>(null);
  const [error, setError] = useState("");
  const mapUrl = job.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}` : null;

  const taps = pending.flatMap((p) => (p.item.type === "tap" ? [p.item.tap] : []));
  const waitingPhotos = pending.flatMap((p) => (p.item.type === "photo" && p.url ? [{ key: p.key, photo: p.item.photo, url: p.url }] : []));
  const pendingIn = taps.find((t) => t.action === "in");
  const pendingOut = taps.find((t) => t.action === "out");
  const inAt = saved?.checkInAt ?? pendingIn?.tappedAt ?? null;
  const outAt = saved?.checkOutAt ?? pendingOut?.tappedAt ?? null;
  const crewCame = saved?.crewCount ?? pendingIn?.crewCount ?? null;
  const countOk = !lead || (Number.isInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 50);

  // Photos still needed to check out. Before the check-in reaches the server
  // the needs aren't known yet, so nothing blocks; the server checks again.
  const needs = saved?.needs ?? { before: 0, after: 0 };
  const have = (k: PhotoKind) => (saved?.photos.filter((p) => p.kind === k).length ?? 0) + waitingPhotos.filter((w) => w.photo.kind === k).length;
  const shortBefore = saved?.waived ? 0 : Math.max(0, needs.before - have("before"));
  const shortAfter = saved?.waived ? 0 : Math.max(0, needs.after - have("after"));

  async function tap(action: "in" | "out") {
    setBusy(action);
    setError("");
    const pos = await getLocation(LOCATION_WAIT_MS.tap);
    const msg = await onTap({
      action,
      jobKey: job.jobKey,
      crewCount: action === "in" && lead ? Number(count) : null,
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      accuracy: pos?.accuracy ?? null,
      tappedAt: new Date().toISOString(),
    });
    if (msg) setError(msg);
    setBusy(null);
  }

  const stillNeed = [
    shortBefore ? tr(lang, { en: `${shortBefore} before`, es: `${shortBefore} de antes` }) : "",
    shortAfter ? tr(lang, { en: `${shortAfter} after`, es: `${shortAfter} de después` }) : "",
  ].filter(Boolean);

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {day.startTime && day.endTime ? `${wallTime(day.startTime, lang)} - ${wallTime(day.endTime, lang)}` : tr(lang, { en: "All day", es: "Todo el día" })}
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-gray-900">{job.title}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {lead ? tr(lang, { en: "Running the job", es: "Dirigiendo" }) : tr(lang, { en: "Crew", es: "Equipo" })}
        </span>
      </div>
      {job.address && (
        <p className="mt-2 text-sm">
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
      {job.notes && <p className="mt-2 whitespace-pre-line rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{job.notes}</p>}

      {!inAt && (
        <div className="mt-3 space-y-2">
          {lead && (
            <label className="block text-sm font-medium text-gray-800">
              {tr(lang, { en: "How many people came today?", es: "¿Cuántas personas vinieron hoy?" })}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="mt-1 block w-24 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
              />
            </label>
          )}
          <button
            type="button"
            disabled={!!busy || !countOk}
            onClick={() => void tap("in")}
            className="w-full rounded-lg bg-emerald-600 px-4 py-4 text-lg font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === "in" ? tr(lang, { en: "Checking in…", es: "Registrando…" }) : tr(lang, { en: "Check in", es: "Registrar entrada" })}
          </button>
        </div>
      )}

      {inAt && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {tr(lang, { en: "Checked in at", es: "Entrada a las" })} {timeOf(inAt, lang)}
          {crewCame != null && (
            <span className="text-emerald-700">
              {" · "}
              {crewCame === 1 ? tr(lang, { en: "1 person", es: "1 persona" }) : tr(lang, { en: `${crewCame} people`, es: `${crewCame} personas` })}
            </span>
          )}
          {outAt && (
            <>
              <br />
              {tr(lang, { en: "Checked out at", es: "Salida a las" })} {timeOf(outAt, lang)}
            </>
          )}
        </p>
      )}

      {inAt && (
        <PhotoSection token={token} job={job} lang={lang} saved={saved} waiting={waitingPhotos} open={!outAt} onPhoto={onPhoto} />
      )}

      {inAt && !outAt && (
        <>
          {saved?.waived && (needs.before > 0 || needs.after > 0) && (
            <p className="mt-3 text-xs text-gray-500">{tr(lang, { en: "Sueep said you can check out without all the photos today.", es: "Sueep dijo que hoy puedes salir sin todas las fotos." })}</p>
          )}
          {stillNeed.length > 0 && (
            <p className="mt-3 text-sm font-medium text-amber-700">
              {tr(lang, { en: `To check out, add ${stillNeed.join(" and ")} ${shortBefore + shortAfter === 1 ? "photo" : "photos"}.`, es: `Para salir, agrega ${stillNeed.join(" y ")} ${shortBefore + shortAfter === 1 ? "foto" : "fotos"}.` })}
            </p>
          )}
          <button
            type="button"
            disabled={!!busy || stillNeed.length > 0}
            onClick={() => void tap("out")}
            className="mt-3 w-full rounded-lg bg-gray-800 px-4 py-4 text-lg font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {busy === "out" ? tr(lang, { en: "Checking out…", es: "Registrando…" }) : tr(lang, { en: "Check out", es: "Registrar salida" })}
          </button>
        </>
      )}

      {pending.length > 0 && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          {tr(lang, {
            en: "No signal. Saved on this phone with the time you took it. It sends by itself when you're back online; keep this page open or come back to it.",
            es: "Sin señal. Guardado en este teléfono con la hora en que lo hiciste. Se envía solo cuando tengas internet; deja esta página abierta o vuelve a ella.",
          })}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

export function TodayTab({ token, jobs, today, checkIns, lang }: { token: string; jobs: SubJob[]; today: string; checkIns: Record<string, TodayCheckIn>; lang: Lang }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const flushing = useRef(false);

  const reload = useCallback(async () => setQueue(await readQueue(token)), [token]);

  /** Sends what's waiting on the phone, oldest first. Stops at the first one that still can't connect. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      let sent = false;
      for (const item of await readQueue(token)) {
        const r = await sendItem(token, item);
        if (!r.ok && r.offline) break;
        // Saved, already saved, or refused for good (e.g. no longer on the job): either way it's done
        await removeFromQueue(item.id);
        sent = true;
      }
      await reload();
      if (sent) router.refresh();
    } finally {
      flushing.current = false;
    }
  }, [token, reload, router]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void flush(), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [flush]);

  // Previews for photos waiting on the phone
  const pending = useMemo(
    () => queue.map((item) => ({ key: `q-${item.id}`, item, url: item.type === "photo" ? URL.createObjectURL(item.photo.blob) : null })),
    [queue],
  );
  useEffect(() => () => pending.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [pending]);

  /** Sends now, or keeps it on the phone when there's no signal or something older is still waiting. */
  async function submit(item: { type: "tap"; tap: Tap } | { type: "photo"; photo: QueuedPhoto }): Promise<string | null> {
    if ((await readQueue(token)).length) {
      await addToQueue(token, item);
      await reload();
      void flush();
      return null;
    }
    const r = item.type === "tap" ? await sendTap(token, item.tap, false) : await sendPhoto(token, item.photo, false);
    if (r.ok) {
      router.refresh();
      return null;
    }
    if (r.offline) {
      await addToQueue(token, item);
      await reload();
      return null;
    }
    if (r.code && DONE_CODES.has(r.code)) {
      router.refresh();
      return item.type === "photo" ? r.error || null : null;
    }
    return r.error || tr(lang, SOMETHING_WRONG);
  }

  if (jobs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
        {tr(lang, { en: "No jobs today.", es: "No tienes trabajos hoy." })}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {tr(lang, {
          en: "Tap Check in when you get to the job, take your before and after photos, and Check out when you leave. We only check your location at the moment you tap or take a photo.",
          es: "Toca Registrar entrada al llegar, toma tus fotos de antes y después, y Registrar salida al irte. Solo vemos tu ubicación en el momento en que tocas o tomas una foto.",
        })}
      </p>
      <ul className="space-y-3">
        {jobs.map((j) => (
          <TodayCard
            key={j.key}
            token={token}
            job={j}
            today={today}
            lang={lang}
            saved={checkIns[j.jobKey] ?? null}
            pending={pending.filter((p) => (p.item.type === "tap" ? p.item.tap.jobKey : p.item.photo.jobKey) === j.jobKey)}
            onTap={(tap) => submit({ type: "tap", tap })}
            onPhoto={(photo) => submit({ type: "photo", photo })}
          />
        ))}
      </ul>
    </div>
  );
}
