"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

type Shift = {
  key: string;
  date: string;
  buildingName: string;
  startTime: string;
  endTime: string;
  clockInAt: string | null;
  clockOutAt: string | null;
};

type UpcomingShift = { key: string; date: string; buildingName: string; startTime: string; endTime: string; skipped: boolean; timeOff: boolean };
type PeriodDay = { key: string; date: string; buildingName: string; hours: number; source: string; breakDeducted: boolean };

type ClockData = {
  firstName: string;
  todayKey: string;
  shifts: Shift[];
  openEntry: { id: string; buildingName: string; clockInAt: string; scheduled: boolean } | null;
  otherToday: { id: string; buildingName: string; clockInAt: string; clockOutAt: string | null }[];
  buildings: { id: string; name: string }[];
  defaultBuildingId: string | null;
  upcoming: UpcomingShift[];
  payPeriod: { start: string; end: string; days: PeriodDay[] };
};

type Lang = "en" | "es";
type View = "today" | "schedule" | "hours";

const STRINGS = {
  en: {
    hi: "Hi {name}",
    loading: "Loading…",
    today: "Today",
    schedule: "My schedule",
    hours: "My hours",
    todaysShifts: "Today's shifts",
    noShiftsToday: "You have no shifts scheduled today.",
    clockIn: "Clock in",
    clockOut: "Clock out",
    saving: "Saving…",
    clockedIn: "Clocked in",
    since: "Since {time}",
    done: "Done: {start} to {end}",
    doneOpen: "Done: {start}",
    clockedInAt: "You're clocked in at {building}.",
    clockedOut: "You're clocked out. Thanks!",
    notListed: "Working somewhere not listed?",
    whereWorking: "Where are you working?",
    pickBuilding: "Pick a building",
    cancel: "Cancel",
    footer: "Your location is recorded when you clock in and out. If you forget to clock in, your scheduled hours are used.",
    next7: "Next 7 days",
    noUpcoming: "No shifts scheduled in the next 7 days.",
    skipped: "Cancelled",
    timeOff: "Time off",
    to: "to",
    payPeriod: "Pay period {start} to {end}",
    totalSoFar: "Hours so far",
    noHoursYet: "No hours yet this pay period.",
    hoursNote: "Days you didn't clock in use your scheduled hours. Shifts of 6 hours or more include a 30 minute unpaid break. Talk to your manager if something looks wrong.",
    breakNote: "30 min unpaid break",
    src_CLOCKED: "Clocked",
    src_NO_CLOCK_OUT: "No clock-out",
    src_IN_PROGRESS: "In progress",
    src_CORRECTED: "Updated by manager",
    src_DIDNT_WORK: "Not worked",
    src_FROM_SCHEDULE: "Scheduled hours",
    src_TIME_OFF: "Time off",
    hrs: "hrs",
    err_LINK_INACTIVE: "This link isn't active. Ask your manager for a new one.",
    err_NOT_CLOCKED_IN: "You're not clocked in.",
    err_ALREADY_CLOCKED_IN: "You're already clocked in at {building}. Clock out first.",
    err_SHIFT_NOT_TODAY: "That shift isn't on your schedule today.",
    err_SHIFT_ALREADY_CLOCKED: "You already clocked in for this shift.",
    err_SHIFT_OTHER_PERSON: "This shift is assigned to someone else.",
    err_PICK_BUILDING: "Pick the building you're working at.",
    err_generic: "Something went wrong. Try again.",
  },
  es: {
    hi: "Hola {name}",
    loading: "Cargando…",
    today: "Hoy",
    schedule: "Mi horario",
    hours: "Mis horas",
    todaysShifts: "Turnos de hoy",
    noShiftsToday: "No tienes turnos programados hoy.",
    clockIn: "Marcar entrada",
    clockOut: "Marcar salida",
    saving: "Guardando…",
    clockedIn: "Entrada marcada",
    since: "Desde las {time}",
    done: "Listo: {start} a {end}",
    doneOpen: "Listo: {start}",
    clockedInAt: "Marcaste tu entrada en {building}.",
    clockedOut: "Marcaste tu salida. ¡Gracias!",
    notListed: "¿Trabajas en otro lugar?",
    whereWorking: "¿Dónde estás trabajando?",
    pickBuilding: "Elige un edificio",
    cancel: "Cancelar",
    footer: "Tu ubicación se guarda al marcar entrada y salida. Si olvidas marcar, se usan tus horas programadas.",
    next7: "Próximos 7 días",
    noUpcoming: "No tienes turnos en los próximos 7 días.",
    skipped: "Cancelado",
    timeOff: "Día libre",
    to: "a",
    payPeriod: "Periodo de pago {start} a {end}",
    totalSoFar: "Horas hasta ahora",
    noHoursYet: "Todavía no hay horas en este periodo de pago.",
    hoursNote: "Los días que no marcaste usan tus horas programadas. Los turnos de 6 horas o más incluyen un descanso de 30 minutos sin pago. Habla con tu supervisor si algo no está bien.",
    breakNote: "30 min de descanso sin pago",
    src_CLOCKED: "Marcado",
    src_NO_CLOCK_OUT: "Sin salida marcada",
    src_IN_PROGRESS: "En curso",
    src_CORRECTED: "Actualizado por supervisor",
    src_DIDNT_WORK: "No trabajado",
    src_FROM_SCHEDULE: "Horas programadas",
    src_TIME_OFF: "Día libre",
    hrs: "h",
    err_LINK_INACTIVE: "Este enlace no está activo. Pide uno nuevo a tu supervisor.",
    err_NOT_CLOCKED_IN: "No has marcado tu entrada.",
    err_ALREADY_CLOCKED_IN: "Ya marcaste tu entrada en {building}. Marca tu salida primero.",
    err_SHIFT_NOT_TODAY: "Ese turno no está en tu horario de hoy.",
    err_SHIFT_ALREADY_CLOCKED: "Ya marcaste tu entrada para este turno.",
    err_SHIFT_OTHER_PERSON: "Este turno está asignado a otra persona.",
    err_PICK_BUILDING: "Elige el edificio donde estás trabajando.",
    err_generic: "Algo salió mal. Inténtalo de nuevo.",
  },
} as const;

type StringKey = keyof (typeof STRINGS)["en"];
const LANG_STORAGE_KEY = "sueep-clock-lang";

function fill(template: string, vars: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

function locale(lang: Lang): string {
  return lang === "es" ? "es-US" : "en-US";
}

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function clockTime(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function dayLabel(dateKey: string, lang: Lang): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(locale(lang), { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

function shortDate(dateKey: string, lang: Lang): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(locale(lang), { month: "short", day: "numeric", timeZone: "UTC" });
}

function elapsed(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
}

function formatHrs(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Best-effort location; clocking in still works if it's denied or slow. */
function getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    // storage blocked, fall through to the browser language
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")) return "es";
  return "en";
}

export function ClockApp({ token }: { token: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<ClockData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pickingBuilding, setPickingBuilding] = useState(false);
  const [buildingId, setBuildingId] = useState("");

  const t = (key: StringKey, vars?: Record<string, string>) => fill(STRINGS[lang][key], vars);

  useEffect(() => {
    setLang(initialLang());
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage blocked, the choice just won't be remembered
    }
  }

  /** Server error -> message in the current language (English text as last resort). */
  function errorMessage(json: { code?: string; error?: string; buildingName?: string }): string {
    const key = `err_${json.code}` as StringKey;
    if (json.code && key in STRINGS[lang]) return t(key, { building: json.buildingName ?? "" });
    return json.error ?? t("err_generic");
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clock/${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.code ?? "generic");
        return;
      }
      setData(json);
      setLoadError(null);
    } catch {
      setLoadError("generic");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [load]);

  async function act(body: Record<string, unknown>, successKey: StringKey, vars?: Record<string, string>) {
    setBusy(true);
    setActionError(null);
    try {
      const location = await getLocation();
      const res = await fetch(`/api/clock/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...(location ?? {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(errorMessage(json));
        return;
      }
      setDone(t(successKey, vars));
      setPickingBuilding(false);
      setBuildingId("");
      setNow(Date.now());
      await load();
    } catch {
      setActionError(t("err_generic"));
    } finally {
      setBusy(false);
    }
  }

  const bigButton = "w-full rounded-2xl py-5 text-xl font-bold text-white shadow-md active:scale-[0.99] disabled:opacity-50";
  const card = "rounded-2xl bg-white p-5 shadow-sm";
  const nowLabel = new Date(now).toLocaleTimeString(locale(lang), { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const dateLabel = new Date(now).toLocaleDateString(locale(lang), { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

  const upcomingByDay = new Map<string, UpcomingShift[]>();
  for (const s of data?.upcoming ?? []) upcomingByDay.set(s.date, [...(upcomingByDay.get(s.date) ?? []), s]);
  const periodTotal = (data?.payPeriod.days ?? []).reduce((sum, d) => sum + d.hours, 0);

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-10 pt-6 text-gray-900">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center justify-between gap-3">
          <Image src="/sueepicon.jpeg" alt="Sueep" width={36} height={36} className="rounded-lg" />
          <div className="inline-flex overflow-hidden rounded-full border border-gray-300 bg-white text-sm font-semibold" role="group" aria-label="Language">
            {(["en", "es"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => changeLang(l)}
                aria-pressed={lang === l}
                className={`px-3 py-1.5 ${lang === l ? "bg-[#E73C6E] text-white" : "text-gray-600"}`}
              >
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{nowLabel}</p>
            <p className="text-xs capitalize text-gray-500">{dateLabel}</p>
          </div>
        </header>

        {loadError && (
          <div className={`${card} text-center`}>
            <p className="text-base font-semibold text-gray-900">
              {loadError === "LINK_INACTIVE" ? t("err_LINK_INACTIVE") : t("err_generic")}
            </p>
          </div>
        )}

        {!data && !loadError && <p className="py-10 text-center text-gray-400">{t("loading")}</p>}

        {data && (
          <>
            <h1 className="text-xl font-semibold">{t("hi", { name: data.firstName })}</h1>

            <nav className="grid grid-cols-3 gap-1 rounded-2xl bg-gray-200 p-1 text-sm font-semibold" aria-label="Sections">
              {(["today", "schedule", "hours"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-current={view === v ? "page" : undefined}
                  className={`rounded-xl py-2.5 ${view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}
                >
                  {t(v)}
                </button>
              ))}
            </nav>

            {view === "today" && (
              <>
                {done && (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-center text-base font-semibold text-emerald-800" role="status">
                    {done}
                  </div>
                )}
                {actionError && (
                  <div className="rounded-2xl bg-red-50 p-4 text-center text-base font-semibold text-red-700" role="alert">
                    {actionError}
                  </div>
                )}

                {data.openEntry ? (
                  <section className={`${card} space-y-4`}>
                    <div className="text-center">
                      <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">{t("clockedIn")}</p>
                      <p className="mt-1 text-lg font-semibold">{data.openEntry.buildingName}</p>
                      <p className="text-sm text-gray-500">
                        {t("since", { time: clockTime(data.openEntry.clockInAt, lang) })} · {elapsed(data.openEntry.clockInAt, now)}
                      </p>
                    </div>
                    <button type="button" disabled={busy} onClick={() => act({ action: "out" }, "clockedOut")} className={`${bigButton} bg-gray-900`}>
                      {busy ? t("saving") : t("clockOut")}
                    </button>
                  </section>
                ) : (
                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("todaysShifts")}</h2>
                    {data.shifts.length === 0 && <p className={`${card} text-center text-gray-500`}>{t("noShiftsToday")}</p>}
                    {data.shifts.map((s) => (
                      <div key={s.key} className={`${card} space-y-3`}>
                        <div>
                          <p className="text-lg font-semibold">{s.buildingName}</p>
                          <p className="text-gray-600">
                            {time12(s.startTime)} {t("to")} {time12(s.endTime)}
                          </p>
                        </div>
                        {s.clockOutAt ? (
                          <p className="text-sm font-medium text-emerald-700">
                            {t("done", { start: clockTime(s.clockInAt!, lang), end: clockTime(s.clockOutAt, lang) })}
                          </p>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act({ action: "in", shiftKey: s.key }, "clockedInAt", { building: s.buildingName })}
                            className={`${bigButton} bg-[#E73C6E]`}
                          >
                            {busy ? t("saving") : t("clockIn")}
                          </button>
                        )}
                      </div>
                    ))}

                    {data.otherToday.map((e) => (
                      <div key={e.id} className={`${card} text-sm`}>
                        <p className="font-semibold">{e.buildingName}</p>
                        <p className="text-emerald-700">
                          {e.clockOutAt
                            ? t("done", { start: clockTime(e.clockInAt, lang), end: clockTime(e.clockOutAt, lang) })
                            : t("doneOpen", { start: clockTime(e.clockInAt, lang) })}
                        </p>
                      </div>
                    ))}

                    <div className="pt-2">
                      {pickingBuilding ? (
                        <div className={`${card} space-y-3`}>
                          <label htmlFor="building" className="block text-sm font-semibold">{t("whereWorking")}</label>
                          <select
                            id="building"
                            value={buildingId}
                            onChange={(e) => setBuildingId(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base"
                          >
                            <option value="">{t("pickBuilding")}</option>
                            {data.buildings.map((b) => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy || !buildingId}
                            onClick={() =>
                              act({ action: "in", contractId: buildingId }, "clockedInAt", {
                                building: data.buildings.find((b) => b.id === buildingId)?.name ?? "",
                              })
                            }
                            className={`${bigButton} bg-[#E73C6E]`}
                          >
                            {busy ? t("saving") : t("clockIn")}
                          </button>
                          <button type="button" onClick={() => setPickingBuilding(false)} className="w-full py-2 text-sm text-gray-500">
                            {t("cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPickingBuilding(true);
                            setDone(null);
                            const fallback = data.defaultBuildingId;
                            if (fallback && data.buildings.some((b) => b.id === fallback)) setBuildingId(fallback);
                          }}
                          className="w-full rounded-2xl border border-gray-300 bg-white py-4 text-base font-medium text-gray-700"
                        >
                          {t("notListed")}
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </>
            )}

            {view === "schedule" && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("next7")}</h2>
                {upcomingByDay.size === 0 && <p className={`${card} text-center text-gray-500`}>{t("noUpcoming")}</p>}
                {Array.from(upcomingByDay.entries()).map(([date, list]) => (
                  <div key={date} className={card}>
                    <p className={`text-sm font-semibold capitalize ${date === data.todayKey ? "text-[#E73C6E]" : "text-gray-500"}`}>
                      {date === data.todayKey ? t("today") : dayLabel(date, lang)}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {list.map((s) => (
                        <li key={s.key} className={s.skipped || s.timeOff ? "text-gray-400" : ""}>
                          <p className={`font-semibold ${s.skipped ? "line-through" : ""}`}>{s.buildingName}</p>
                          <p className="text-sm">
                            {time12(s.startTime)} {t("to")} {time12(s.endTime)}
                            {s.skipped && <span className="ml-2 font-semibold text-gray-500">{t("skipped")}</span>}
                            {!s.skipped && s.timeOff && <span className="ml-2 font-semibold text-gray-500">{t("timeOff")}</span>}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            {view === "hours" && (
              <section className="space-y-3">
                <div className={`${card} text-center`}>
                  <p className="text-sm text-gray-500">
                    {t("payPeriod", { start: shortDate(data.payPeriod.start, lang), end: shortDate(data.payPeriod.end, lang) })}
                  </p>
                  <p className="mt-1 text-4xl font-bold tabular-nums">{formatHrs(Math.round(periodTotal * 100) / 100)}</p>
                  <p className="text-sm text-gray-500">{t("totalSoFar")}</p>
                </div>
                {data.payPeriod.days.length === 0 ? (
                  <p className={`${card} text-center text-gray-500`}>{t("noHoursYet")}</p>
                ) : (
                  <ul className={`${card} divide-y divide-gray-100 p-0`}>
                    {data.payPeriod.days
                      .slice()
                      .reverse()
                      .map((d) => {
                        const sourceKey = `src_${d.source}` as StringKey;
                        return (
                          <li key={d.key} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold capitalize">{dayLabel(d.date, lang)}</p>
                              <p className="truncate text-sm text-gray-500">
                                {d.buildingName} · {sourceKey in STRINGS[lang] ? t(sourceKey) : d.source}
                              </p>
                              {d.breakDeducted && <p className="text-xs text-gray-400">{t("breakNote")}</p>}
                            </div>
                            <p className="shrink-0 text-lg font-semibold tabular-nums">
                              {formatHrs(d.hours)} <span className="text-sm font-normal text-gray-500">{t("hrs")}</span>
                            </p>
                          </li>
                        );
                      })}
                  </ul>
                )}
                <p className="px-1 text-xs text-gray-500">{t("hoursNote")}</p>
              </section>
            )}

            <p className="pt-4 text-center text-xs text-gray-400">{t("footer")}</p>
          </>
        )}
      </div>
    </main>
  );
}
