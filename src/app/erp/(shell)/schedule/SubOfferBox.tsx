"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";
import { InfoTip, useAskText, useToast } from "@/app/erp/components/ui";
import { useInsuranceCheck } from "@/app/erp/components/useInsuranceCheck";
import { centsToDollars } from "@/lib/erp/money";
import type { DayOfferView, OfferKind } from "@/lib/erp/subOffers";
import type { DayCheckIn } from "@/lib/erp/subCheckIns";
import { todayEasternKey } from "@/lib/erp/dates";

type Sub = { id: string; displayName: string; email: string | null; insuranceWarning?: string | null };

const REASON_LABEL: Record<string, string> = {
  PRICE: "Price is too low",
  NOT_AVAILABLE: "Not available",
  TOO_FAR: "Too far",
  OTHER: "Other",
};

const STATUS_TEXT: Record<string, string> = {
  PENDING: "Waiting for answer",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  EXPIRED: "No answer",
  CANCELLED: "Cancelled",
};

function shortDay(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function rangeOf(keys: string[]): string {
  if (keys.length === 0) return "";
  return keys.length === 1 ? shortDay(keys[0]!) : `${shortDay(keys[0]!)} - ${shortDay(keys[keys.length - 1]!)} (${keys.length} days)`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "YYYY-MM-DDTHH:MM" in this browser's time, for a datetime-local input */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 24 hours from now, but no later than 2 PM the day before the job, and at least 2 hours from now. */
function defaultAnswerBy(firstDayKey: string | null): string {
  const now = Date.now();
  let t = now + 24 * 3600e3;
  if (firstDayKey) {
    const [y, m, d] = firstDayKey.split("-").map(Number);
    const dayBefore2pm = new Date(y!, m! - 1, d! - 1, 14, 0).getTime();
    t = Math.min(t, dayBefore2pm);
  }
  t = Math.max(t, now + 2 * 3600e3);
  const out = new Date(t);
  out.setMinutes(Math.ceil(out.getMinutes() / 15) * 15, 0, 0);
  return localInput(out);
}

function dollarsToCents(v: string): number | null | undefined {
  const t = v.replace(/[$,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

/** The crew the sub running the day said they're bringing, set in their portal. */
export function SubCrewLine({ crew }: { crew: { count: number; names: string[] } | null }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
      {crew ? (
        <>
          Crew of {crew.count}
          {crew.names.length ? `: ${crew.names.join(", ")}` : ""}
        </>
      ) : (
        <>Crew size not given yet</>
      )}
      <InfoTip text="The sub sets this on their jobs page when they accept, and can change it until the day before. A change emails the day's PM." />
    </p>
  );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
}

/** "In 8:12 AM, 22 min late, off site (0.8 mi)" style flags for one side of a check-in */
function placeFlags(offSite: boolean, distance: string | null, noLocation: boolean): string[] {
  if (offSite) return [`off site${distance ? ` (${distance})` : ""}`];
  return noLocation ? ["no location shared"] : [];
}

/** What the viewer may do with subs' check-ins. Set by the schedule page from the viewer's role. */
const SubStaffContext = createContext({ canWaivePhotos: false });

export function SubStaffProvider({ canWaivePhotos, children }: { canWaivePhotos: boolean; children: React.ReactNode }) {
  return <SubStaffContext.Provider value={{ canWaivePhotos }}>{children}</SubStaffContext.Provider>;
}

function countText(n: number, need: number): string {
  return need > 0 ? `${n}/${need}` : String(n);
}

/** Before/after photo counts for a check-in, a link to see them, and the PM's "check out without" (subPhotos.ts). */
function SubPhotosLine({ checkIn }: { checkIn: DayCheckIn }) {
  const { canWaivePhotos } = useContext(SubStaffContext);
  const askText = useAskText();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // The planner keeps its own copy of the day, so show the change here right away
  const [justWaived, setJustWaived] = useState<DayCheckIn["waived"]>(null);
  const { photos, needs } = checkIn;
  const waived = checkIn.waived ?? justWaived;
  const short = photos.before < needs.before || photos.after < needs.after;
  const total = photos.before + photos.after;
  if (total === 0 && needs.before + needs.after === 0) return null;

  async function waive() {
    const reason = await askText({
      title: "Let them check out without the photos?",
      message: `They have ${photos.before} of ${needs.before} before and ${photos.after} of ${needs.after} after photos. Their check-out won't be blocked today. Why?`,
      placeholder: "e.g. phone camera broken, unit locked",
      confirmLabel: "Let them check out",
    });
    if (reason === null) return;
    if (!reason.trim()) return toast("Say why, so it shows with the day.", "error");
    setBusy(true);
    const res = await fetch(`/api/erp/sub-check-ins/${checkIn.id}/waive-photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      return toast(data?.error ?? "Couldn't save. Try again.", "error");
    }
    toast("They can check out now.", "success");
    setJustWaived({ by: null, reason: reason.trim() });
  }

  return (
    <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] ${short && !waived ? "text-amber-700" : "text-gray-500"}`}>
      <span>
        Photos: {countText(photos.before, needs.before)} before, {countText(photos.after, needs.after)} after
        {waived ? ` · checkout allowed without photos${waived.reason ? `: ${waived.reason}` : ""}` : ""}
      </span>
      {total > 0 && (
        <a href={`/erp/projects/${checkIn.projectId}?tab=${encodeURIComponent("Sub Photos")}`} className="font-medium text-pink-600 hover:underline">
          View
        </a>
      )}
      {checkIn.review && (
        <a
          href={`/erp/sub-reviews/${checkIn.review.id}`}
          className={`font-medium hover:underline ${checkIn.review.status === "PASSED" ? "text-emerald-700" : checkIn.review.status === "NEEDS_FIX" ? "text-red-600" : "text-pink-600"}`}
        >
          {checkIn.review.status === "PASSED" ? "Passed review" : checkIn.review.status === "NEEDS_FIX" ? "Fixes asked" : "Review"}
        </a>
      )}
      {canWaivePhotos && short && !waived && !checkIn.outAt && (
        <button type="button" disabled={busy} onClick={() => void waive()} className="font-medium text-pink-600 hover:underline disabled:opacity-50">
          Let them check out without
        </button>
      )}
    </p>
  );
}

/** Whether the sub running the day checked in and out from their portal (subCheckIns.ts). */
export function SubCheckInLine({ checkIn, dateKey, plannedCrew }: { checkIn: DayCheckIn | null; dateKey: string; plannedCrew: number | null }) {
  const today = todayEasternKey();
  const tip =
    "The sub taps Check in and Check out on their jobs page. Their location is taken only at that moment. Off site means farther than the distance on Settings, Subs. Late means past the start time plus the grace window there.";
  if (!checkIn?.inAt) {
    if (checkIn?.missedAlertAt) {
      return (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-red-600">
          Not checked in, PM emailed at {clock(checkIn.missedAlertAt)}
          <InfoTip text={tip} />
        </p>
      );
    }
    if (dateKey !== today) return null;
    return (
      <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
        Not checked in yet
        <InfoTip text={tip} />
      </p>
    );
  }
  const inFlags = [
    ...(checkIn.lateMinutes != null ? [`${checkIn.lateMinutes} min late`] : []),
    ...placeFlags(checkIn.inOffSite, checkIn.inDistance, checkIn.inNoLocation),
  ];
  const crewNote =
    checkIn.crewCount != null
      ? `${checkIn.crewCount} ${checkIn.crewCount === 1 ? "person" : "people"} came${plannedCrew != null && plannedCrew !== checkIn.crewCount ? ` (planned ${plannedCrew})` : ""}`
      : null;
  const outFlags = checkIn.outAt ? placeFlags(checkIn.outOffSite, checkIn.outDistance, checkIn.outNoLocation) : [];
  const warn = checkIn.lateMinutes != null || checkIn.inOffSite || checkIn.outOffSite || (plannedCrew != null && checkIn.crewCount != null && checkIn.crewCount < plannedCrew);
  return (
    <>
    <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-[10px] ${warn ? "text-amber-700" : "text-gray-500"}`}>
      <span>
        In {clock(checkIn.inAt)}
        {inFlags.length ? `, ${inFlags.join(", ")}` : ""}
        {crewNote ? ` · ${crewNote}` : ""}
        {checkIn.outAt ? ` · Out ${clock(checkIn.outAt)}${outFlags.length ? `, ${outFlags.join(", ")}` : ""}` : ""}
      </span>
      <InfoTip text={tip} />
    </p>
    <SubPhotosLine checkIn={checkIn} />
    </>
  );
}

/** Short words for calendar chip hovers */
export function checkInChipText(c: DayCheckIn | null | undefined): string {
  if (!c?.inAt) return c?.missedAlertAt ? " · not checked in" : "";
  if (c.review?.status === "NEEDS_FIX") return " · fixes asked";
  if (c.review?.status === "PASSED") return " · passed review";
  const flags = [c.lateMinutes != null ? "late" : "", c.inOffSite || c.outOffSite ? "off site" : ""].filter(Boolean);
  return ` · ${c.outAt ? "checked out" : "checked in"}${flags.length ? ` (${flags.join(", ")})` : ""}`;
}

/**
 * The day card's "Offer to a sub" box (subOffers.ts). Offers the saved days
 * of this visit to one sub, with their pay and an answer-by time; shows where
 * the offer stands and every round sent.
 */
export function SubOfferBox({
  kind,
  ownerId,
  dayId,
  dateKey,
  hasSub,
  contractors,
  suggestedPayCents,
}: {
  kind: OfferKind;
  /** Project id for "day", change order id for "co-day" */
  ownerId: string;
  /** The saved day row, null while the day isn't saved yet */
  dayId: string | null;
  dateKey: string;
  /** A sub already runs this day */
  hasSub: boolean;
  contractors: Sub[];
  suggestedPayCents: number | null;
}) {
  const toast = useToast();
  const askText = useAskText();
  const checkInsurance = useInsuranceCheck(contractors);
  const [offers, setOffers] = useState<DayOfferView[] | null>(null);
  const [offerable, setOfferable] = useState<string[]>([]);
  const [form, setForm] = useState<null | { resendOf: string | null; contractorId: string; pay: string; answerBy: string; note: string }>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!dayId) return;
    const q = new URLSearchParams({ kind, ownerId, dayId, dateKey });
    const res = await fetch(`/api/erp/sub-offers?${q}`).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { offers: DayOfferView[]; offerableDateKeys: string[] };
    setOffers(data.offers);
    setOfferable(data.offerableDateKeys);
  }, [kind, ownerId, dayId, dateKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!dayId) return <p className="mt-1.5 text-[10px] text-gray-400">Save the day first to offer it to a sub.</p>;
  if (!offers) return null;

  const latest = offers.find((o) => o.latest && o.dateKeys.includes(dateKey)) ?? offers.find((o) => o.latest) ?? null;
  const open = latest?.status === "PENDING" ? latest : null;
  const answered = latest && (latest.status === "DECLINED" || latest.status === "EXPIRED") ? latest : null;
  const canOffer = !hasSub && !open && offerable.length > 0;
  const name = (id: string) => contractors.find((c) => c.id === id)?.displayName ?? "the sub";

  function startNew() {
    setForm({ resendOf: null, contractorId: "", pay: suggestedPayCents != null ? String(suggestedPayCents / 100) : "", answerBy: defaultAnswerBy(offerable[0] ?? null), note: "" });
  }

  function startResend(o: DayOfferView) {
    setForm({ resendOf: o.id, contractorId: o.contractorId, pay: o.payCents != null ? String(o.payCents / 100) : "", answerBy: defaultAnswerBy(o.dateKeys[0] ?? null), note: o.note ?? "" });
  }

  async function submit() {
    if (!form) return;
    const payCents = dollarsToCents(form.pay);
    if (payCents === undefined) return toast("Pay isn't a valid amount", "error");
    if (!form.resendOf && !form.contractorId) return toast("Pick a sub", "error");
    if (!form.resendOf && !(await checkInsurance(form.contractorId))) return;
    const answerBy = new Date(form.answerBy);
    if (Number.isNaN(answerBy.getTime())) return toast("Pick when they need to answer by", "error");
    setBusy(true);
    try {
      const res = await fetch(form.resendOf ? `/api/erp/sub-offers/${form.resendOf}/resend` : "/api/erp/sub-offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, ownerId, dateKey, contractorId: form.contractorId, payCents, note: form.note, answerBy: answerBy.toISOString() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return toast(data.error ?? "Couldn't send the offer", "error");
      toast(`Offer sent to ${name(form.contractorId)}`);
      setForm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function cancel(o: DayOfferView) {
    const note = await askText({ title: `Cancel the offer to ${o.contractorName}?`, message: "They can't accept it anymore. Optional: why?", placeholder: "Reason (optional)", confirmLabel: "Cancel offer" });
    if (note === null) return;
    setBusy(true);
    const res = await fetch(`/api/erp/sub-offers/${o.id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast("Couldn't cancel the offer", "error");
    toast("Offer cancelled");
    await load();
  }

  return (
    <div className="mt-2 rounded border border-pink-100 bg-pink-50/40 p-2">
      <div className="flex items-center gap-1 text-[10px] font-medium text-gray-600">
        Job offer
        <InfoTip text="Offer this visit's saved days to one sub, with their pay. They accept or decline on their phone. Accepting puts them on these days with that pay and sends the normal invite." />
      </div>

      {open && (
        <div className="mt-1 space-y-1 text-[11px] text-gray-700">
          <p>
            Offered to <strong>{open.contractorName}</strong> for {rangeOf(open.dateKeys)}
            {open.payCents != null ? ` at ${centsToDollars(open.payCents)}` : ""}
            {open.round > 1 ? ` (round ${open.round})` : ""}.
          </p>
          <p className="text-amber-700">Waiting for answer, by {when(open.answerBy)}</p>
          <button type="button" disabled={busy} onClick={() => void cancel(open)} className="text-[10px] font-medium text-red-500 hover:text-red-700 disabled:opacity-50">
            Cancel offer
          </button>
        </div>
      )}

      {answered && !hasSub && !form && (
        <div className="mt-1 space-y-1 text-[11px] text-gray-700">
          {answered.status === "DECLINED" ? (
            <p>
              <strong>{answered.contractorName}</strong> declined{answered.payCents != null ? ` ${centsToDollars(answered.payCents)}` : ""}:{" "}
              {REASON_LABEL[answered.declineReason ?? ""] ?? answered.declineReason}
              {answered.declineNote ? ` (${answered.declineNote})` : ""}
            </p>
          ) : (
            <p>
              <strong>{answered.contractorName}</strong> didn&apos;t answer by {when(answered.answerBy)}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => startResend(answered)} className="rounded bg-pink-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-pink-500">
              {answered.declineReason === "PRICE" ? "Resend at new price" : "Send again"}
            </button>
            {canOffer && (
              <button type="button" onClick={startNew} className="rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50">
                Offer to someone else
              </button>
            )}
          </div>
        </div>
      )}

      {!open && !answered && !form && canOffer && (
        <button type="button" onClick={startNew} className="mt-1 rounded border border-pink-300 bg-white px-2 py-1 text-[10px] font-medium text-pink-700 hover:bg-pink-50">
          Offer to a sub
        </button>
      )}

      {!open && !answered && !form && !canOffer && !hasSub && (
        <p className="mt-1 text-[10px] text-gray-400">Only upcoming saved days without a sub can be offered.</p>
      )}

      {form && (
        <div className="mt-1.5 space-y-1.5">
          <p className="text-[10px] text-gray-500">Covers {rangeOf(form.resendOf ? (offers.find((o) => o.id === form.resendOf)?.dateKeys ?? []) : offerable)}</p>
          {form.resendOf ? (
            <p className="text-[11px] text-gray-700">
              To <strong>{name(form.contractorId)}</strong>
            </p>
          ) : (
            <div>
              <label className="block text-[9px] text-gray-400">Sub</label>
              <SearchableSelect
                value={form.contractorId}
                onChange={(v) => setForm({ ...form, contractorId: v })}
                options={contractors.filter((c) => c.email).map((c) => ({ value: c.id, label: c.displayName }))}
                placeholder="Search…"
                allLabel="- Pick a sub -"
                className="mt-0.5"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block text-[9px] text-gray-400">
              Their pay (visit)
              <div className="relative mt-0.5">
                <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
                <input
                  inputMode="decimal"
                  value={form.pay}
                  onChange={(e) => setForm({ ...form, pay: e.target.value })}
                  placeholder="0"
                  className="w-full rounded border border-gray-300 bg-white py-1 pl-4 pr-1.5 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
                />
              </div>
            </label>
            <label className="block text-[9px] text-gray-400">
              Answer by
              <input
                type="datetime-local"
                value={form.answerBy}
                onChange={(e) => setForm({ ...form, answerBy: e.target.value })}
                className="mt-0.5 w-full rounded border border-gray-300 bg-white px-1 py-1 text-[11px] text-gray-800 focus:border-pink-400 focus:outline-none"
              />
            </label>
          </div>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            rows={2}
            placeholder="Note for the sub (optional)"
            className="w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-800 focus:border-pink-400 focus:outline-none"
          />
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void submit()} className="rounded bg-pink-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-pink-500 disabled:opacity-50">
              {busy ? "Sending…" : "Send offer"}
            </button>
            <button type="button" disabled={busy} onClick={() => setForm(null)} className="rounded border border-gray-300 bg-white px-2.5 py-1 text-[10px] text-gray-600">
              Back
            </button>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <div className="mt-1.5">
          <button type="button" onClick={() => setShowHistory(!showHistory)} className="text-[10px] text-gray-500 hover:text-gray-700">
            {showHistory ? "Hide" : "Show"} offer history ({offers.length})
          </button>
          {showHistory && (
            <ul className="mt-1 space-y-1 text-[10px] text-gray-600">
              {offers.map((o) => (
                <li key={o.id} className="rounded bg-white px-1.5 py-1">
                  <span className="font-medium text-gray-800">{o.contractorName}</span>, round {o.round}, {o.payCents != null ? centsToDollars(o.payCents) : "no pay"}, {rangeOf(o.dateKeys)}
                  <br />
                  {STATUS_TEXT[o.status] ?? o.status}
                  {o.status === "DECLINED" ? `: ${REASON_LABEL[o.declineReason ?? ""] ?? o.declineReason}${o.declineNote ? ` (${o.declineNote})` : ""}` : ""}
                  {o.status === "CANCELLED" && o.cancelNote ? `: ${o.cancelNote}` : ""}
                  {o.answeredAt ? `, ${when(o.answeredAt)}` : `, sent ${when(o.createdAt)}`} · by {o.sentBy}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {latest?.status === "ACCEPTED" && hasSub && <p className="mt-1 text-[10px] text-emerald-700">{latest.contractorName} accepted the offer.</p>}
    </div>
  );
}
