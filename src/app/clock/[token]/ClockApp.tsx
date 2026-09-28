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

type ClockData = {
  firstName: string;
  todayKey: string;
  shifts: Shift[];
  openEntry: { id: string; buildingName: string; clockInAt: string; scheduled: boolean } | null;
  otherToday: { id: string; buildingName: string; clockInAt: string; clockOutAt: string | null }[];
  buildings: { id: string; name: string }[];
};

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

function elapsed(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`;
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

export function ClockApp({ token }: { token: string }) {
  const [data, setData] = useState<ClockData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pickingBuilding, setPickingBuilding] = useState(false);
  const [buildingId, setBuildingId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/clock/${encodeURIComponent(token)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setData(json);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setActionError("");
    try {
      const location = await getLocation();
      const res = await fetch(`/api/clock/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, ...(location ?? {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Try again.");
      setDone(successMessage);
      setPickingBuilding(false);
      setBuildingId("");
      setNow(Date.now());
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const bigButton = "w-full rounded-2xl py-5 text-xl font-bold text-white shadow-md active:scale-[0.99] disabled:opacity-50";
  const nowLabel = new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const dateLabel = new Date(now).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

  return (
    <main className="min-h-screen bg-gray-50 px-4 pb-10 pt-6 text-gray-900">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex items-center justify-between">
          <Image src="/sueepicon.jpeg" alt="Sueep" width={36} height={36} className="rounded-lg" />
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{nowLabel}</p>
            <p className="text-xs text-gray-500">{dateLabel}</p>
          </div>
        </header>

        {loadError && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-base font-semibold text-gray-900">{loadError}</p>
          </div>
        )}

        {!data && !loadError && <p className="py-10 text-center text-gray-400">Loading…</p>}

        {data && (
          <>
            <h1 className="text-xl font-semibold">Hi {data.firstName}</h1>

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
              <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-center">
                  <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">Clocked in</p>
                  <p className="mt-1 text-lg font-semibold">{data.openEntry.buildingName}</p>
                  <p className="text-sm text-gray-500">
                    Since {clockTime(data.openEntry.clockInAt)} · {elapsed(data.openEntry.clockInAt, now)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: "out" }, "You're clocked out. Thanks!")}
                  className={`${bigButton} bg-gray-900`}
                >
                  {busy ? "Saving…" : "Clock out"}
                </button>
              </section>
            ) : (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Today&apos;s shifts</h2>
                {data.shifts.length === 0 && (
                  <p className="rounded-2xl bg-white p-5 text-center text-gray-500 shadow-sm">You have no shifts scheduled today.</p>
                )}
                {data.shifts.map((s) => {
                  const finished = !!s.clockOutAt;
                  return (
                    <div key={s.key} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                      <div>
                        <p className="text-lg font-semibold">{s.buildingName}</p>
                        <p className="text-gray-600">
                          {time12(s.startTime)} to {time12(s.endTime)}
                        </p>
                      </div>
                      {finished ? (
                        <p className="text-sm font-medium text-emerald-700">
                          Done: {clockTime(s.clockInAt!)} to {clockTime(s.clockOutAt!)}
                        </p>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act({ action: "in", shiftKey: s.key }, `You're clocked in at ${s.buildingName}.`)}
                          className={`${bigButton} bg-[#E73C6E]`}
                        >
                          {busy ? "Saving…" : "Clock in"}
                        </button>
                      )}
                    </div>
                  );
                })}

                {data.otherToday.map((e) => (
                  <div key={e.id} className="rounded-2xl bg-white p-5 text-sm shadow-sm">
                    <p className="font-semibold">{e.buildingName}</p>
                    <p className="text-emerald-700">
                      Done: {clockTime(e.clockInAt)}
                      {e.clockOutAt ? ` to ${clockTime(e.clockOutAt)}` : ""}
                    </p>
                  </div>
                ))}

                <div className="pt-2">
                  {pickingBuilding ? (
                    <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                      <label htmlFor="building" className="block text-sm font-semibold">
                        Where are you working?
                      </label>
                      <select
                        id="building"
                        value={buildingId}
                        onChange={(e) => setBuildingId(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-base"
                      >
                        <option value="">Pick a building</option>
                        {data.buildings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !buildingId}
                        onClick={() =>
                          act(
                            { action: "in", contractId: buildingId },
                            `You're clocked in at ${data.buildings.find((b) => b.id === buildingId)?.name ?? "the building"}.`
                          )
                        }
                        className={`${bigButton} bg-[#E73C6E]`}
                      >
                        {busy ? "Saving…" : "Clock in"}
                      </button>
                      <button type="button" onClick={() => setPickingBuilding(false)} className="w-full py-2 text-sm text-gray-500">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPickingBuilding(true);
                        setDone(null);
                      }}
                      className="w-full rounded-2xl border border-gray-300 bg-white py-4 text-base font-medium text-gray-700"
                    >
                      Working somewhere not listed?
                    </button>
                  )}
                </div>
              </section>
            )}

            <p className="pt-4 text-center text-xs text-gray-400">
              Your location is recorded when you clock in and out. If you forget to clock in, your scheduled hours are used.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
