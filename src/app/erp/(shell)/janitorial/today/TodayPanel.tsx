"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/app/erp/components/ui";
import { formatTime12 } from "@/lib/erp/janitorialSchedule";
import { dayCellLabel } from "@/lib/erp/schedule";
import type { TodayItem, TodayStatus } from "@/lib/erp/janitorialToday";
import { CorrectionDialog } from "../hours/HoursReview";
import { StatStrip } from "../StatStrip";

type Item = TodayItem & { phone: string | null };
type TodayResponse = { todayKey: string; generatedAt: string; items: Item[] };

const REFRESH_MS = 60_000;

const TILES: { status: TodayStatus; label: string; tone: string }[] = [
  { status: "CLOCKED_IN", label: "Clocked in now", tone: "text-emerald-700" },
  { status: "LATE", label: "Late", tone: "text-red-600" },
  { status: "NEEDS_COVER", label: "Needs cover", tone: "text-red-600" },
  { status: "STILL_CLOCKED_IN", label: "Didn't clock out", tone: "text-amber-600" },
  { status: "NO_CLOCK_IN", label: "No clock-in", tone: "text-amber-600" },
  { status: "UPCOMING", label: "Coming up", tone: "text-gray-900" },
  { status: "DONE", label: "Done", tone: "text-gray-900" },
];

function schedule(i: Item, todayKey: string | undefined): string {
  const times = i.scheduledStart ? `${formatTime12(i.scheduledStart)} to ${formatTime12(i.scheduledEnd!)}` : "Not scheduled";
  return todayKey && i.date !== todayKey ? `${times} (yesterday)` : times;
}

function attentionText(i: Item): string {
  switch (i.status) {
    case "LATE":
      return `${i.minutesLate} min late, hasn't clocked in`;
    case "NEEDS_COVER":
      return "Has time off today, needs a cover";
    case "STILL_CLOCKED_IN":
      return `Shift ended, still clocked in since ${i.actualStart ? formatTime12(i.actualStart) : "earlier"}`;
    case "NO_CLOCK_IN":
      return "Shift ended with no clock-in, scheduled hours will be paid";
    default:
      return "";
  }
}

function telHref(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function TodayPanel() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [correcting, setCorrecting] = useState<Item | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/erp/janitorial/today", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load today");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load today");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const items = data?.items ?? [];
  const count = (s: TodayStatus) => items.filter((i) => i.status === s).length;
  const attention = items.filter((i) => ["LATE", "NEEDS_COVER", "STILL_CLOCKED_IN", "NO_CLOCK_IN"].includes(i.status) || (i.status === "CLOCKED_IN" && i.locationFlag));
  const clockedIn = items.filter((i) => i.status === "CLOCKED_IN");
  const upcoming = items.filter((i) => i.status === "UPCOMING");
  const done = items.filter((i) => i.status === "DONE");

  const updated = data ? new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{data ? dayCellLabel(data.todayKey) : "Today"}</h2>
          <p className="text-xs text-gray-500">
            {updated ? `Updated ${updated}, refreshes every minute` : "Loading…"}
          </p>
        </div>
        <Button variant="secondary" size="xs" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <StatStrip
        stats={TILES.map((t) => {
          const n = count(t.status);
          return { label: t.label, value: String(n), tone: n > 0 ? t.tone : "text-gray-300" };
        })}
      />

      {data && items.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No janitorial shifts scheduled today.{" "}
          <Link href="/erp/schedule?calendar=janitorial" className="text-pink-600 hover:underline">Open the schedule</Link>
        </div>
      )}

      {attention.length > 0 && (
        <Section title="Needs attention" tone="border-red-200">
          {attention.map((i) => (
            <Row key={i.key} item={i} todayKey={data?.todayKey}>
              <p className={`text-sm font-medium ${i.status === "LATE" || i.status === "NEEDS_COVER" ? "text-red-700" : "text-amber-700"}`}>
                {i.status === "CLOCKED_IN" ? i.locationFlag : attentionText(i)}
              </p>
              <Actions item={i} onCorrect={() => setCorrecting(i)} />
            </Row>
          ))}
        </Section>
      )}

      {clockedIn.length > 0 && (
        <Section title="Clocked in now">
          {clockedIn.map((i) => (
            <Row key={i.key} item={i} todayKey={data?.todayKey}>
              <p className="text-sm text-emerald-700">
                Since {i.actualStart ? formatTime12(i.actualStart) : "earlier"}
                {i.unscheduled ? ", not on the schedule" : ""}
              </p>
            </Row>
          ))}
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Coming up today">
          {upcoming.map((i) => (
            <Row key={i.key} item={i} todayKey={data?.todayKey} />
          ))}
        </Section>
      )}

      {done.length > 0 && (
        <Section title="Done today">
          {done.map((i) => (
            <Row key={i.key} item={i} todayKey={data?.todayKey}>
              <p className="text-sm text-gray-600">
                {i.source === "DIDNT_WORK"
                  ? "Marked didn't work"
                  : `${i.actualStart ? formatTime12(i.actualStart) : ""} to ${i.actualEnd ? formatTime12(i.actualEnd) : ""}, ${i.hours.toFixed(2)} hrs`}
              </p>
            </Row>
          ))}
        </Section>
      )}

      {correcting && (
        <CorrectionDialog
          row={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={() => {
            setCorrecting(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, tone = "border-gray-200", children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-lg border bg-white shadow-sm ${tone}`}>
      <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h3>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </section>
  );
}

function Row({ item: i, todayKey, children }: { item: Item; todayKey?: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">
          {i.employeeName}
          <span className="font-normal text-gray-500"> · {i.buildingName}</span>
        </p>
        <p className="text-xs text-gray-500">{schedule(i, todayKey)}</p>
      </div>
      <div className="flex flex-col items-end gap-1.5 text-right">{children}</div>
    </li>
  );
}

function Actions({ item: i, onCorrect }: { item: Item; onCorrect: () => void }) {
  const link = "rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {i.phone && (
        <>
          <a href={`tel:${telHref(i.phone)}`} className={link}>Call</a>
          <a href={`sms:${telHref(i.phone)}`} className={link}>Text</a>
        </>
      )}
      {(i.status === "LATE" || i.status === "NEEDS_COVER") && (
        <Link href={`/erp/schedule?calendar=janitorial&contract=${i.contractId}`} className={link}>
          Find a cover
        </Link>
      )}
      {(i.status === "STILL_CLOCKED_IN" || i.status === "NO_CLOCK_IN") && (
        <button type="button" onClick={onCorrect} className={link}>
          Correct hours
        </button>
      )}
    </div>
  );
}
