"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useToast } from "@/app/erp/components/ui";

export type RequestForAction = {
  id: string;
  label: string;
  /** YYYY-MM-DD */
  requestedStart: string;
  /** YYYY-MM-DD, or "" when they didn't give one */
  requestedEnd: string;
  estimateCents: number;
  otherDescription: string | null;
};

function dollars(cents: number): string {
  return (cents / 100).toFixed(cents % 100 ? 2 : 0);
}

/**
 * Confirm goes straight through with their date and the estimate. "Change"
 * opens the form to adjust first. Other work has no price yet, so Confirm
 * always opens the form for those.
 */
export function RequestActions({ request }: { request: RequestForAction }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<"confirm" | "decline" | null>(null);
  const quick = useSubmit(`/api/erp/property-managers/requests/${request.id}/confirm`, () => {
    toast("Confirmed. The unit is on the schedule and they were emailed.");
    router.refresh();
  });
  const needsPrice = !!request.otherDescription;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="xs"
        disabled={quick.busy}
        title={needsPrice ? "Price the other work first" : "Confirm their date and the estimate, and email them"}
        onClick={() =>
          needsPrice
            ? setOpen("confirm")
            : quick.submit({ startDate: request.requestedStart, endDate: request.requestedEnd, price: dollars(request.estimateCents) })
        }
      >
        {quick.busy ? "Confirming…" : "Confirm"}
      </Button>
      {!needsPrice && (
        <Button size="xs" variant="secondary" onClick={() => setOpen("confirm")}>
          Change
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={() => setOpen("decline")}>
        Decline
      </Button>
      {quick.error && <span className="w-full text-xs text-red-600">{quick.error}</span>}
      {open === "confirm" && <ConfirmForm request={request} onClose={() => setOpen(null)} />}
      {open === "decline" && <DeclineForm request={request} onClose={() => setOpen(null)} />}
    </div>
  );
}

function useSubmit(path: string, onDone: (data: Record<string, unknown>) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(body: unknown) {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      onDone(data);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit };
}

function ConfirmForm({ request, onClose }: { request: RequestForAction; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [start, setStart] = useState(request.requestedStart);
  const [end, setEnd] = useState(request.requestedEnd);
  const [price, setPrice] = useState(dollars(request.estimateCents));
  const [message, setMessage] = useState("");
  const { busy, error, submit } = useSubmit(`/api/erp/property-managers/requests/${request.id}/confirm`, () => {
    toast("Confirmed. The unit is on the schedule and they were emailed.");
    onClose();
    router.refresh();
  });

  const priceCents = Math.round(Number(price.replace(/[$,]/g, "")) * 100);
  const changes = [
    start !== request.requestedStart && "the new start date",
    Number.isFinite(priceCents) && priceCents !== request.estimateCents && "the new price",
  ].filter(Boolean);

  return (
    <Modal open onClose={onClose} dismissible={false} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ startDate: start, endDate: end, price, message });
        }}
        className="space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">Confirm {request.label}</h2>
          <p className="text-xs text-gray-500">Makes the unit project and emails the property manager.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass.default} htmlFor="c-start">
              Start date
            </label>
            <input id="c-start" type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass.md} />
          </div>
          <div>
            <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="c-end">
              End date <InfoTip text="Leave blank for a one-day turn." />
            </label>
            <input id="c-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass.md} />
          </div>
          <div className="sm:col-span-2">
            <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="c-price">
              Price <InfoTip text={`Their estimate was $${dollars(request.estimateCents)} from the building's pricing package.`} />
            </label>
            <input id="c-price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass.md} />
            {request.otherDescription && (
              <p className="mt-1 text-xs text-amber-700">Add the other work to the price: {request.otherDescription}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass.default} htmlFor="c-msg">
              Message to them (optional)
            </label>
            <textarea id="c-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass.md} />
          </div>
        </div>
        {changes.length > 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">The email points out {changes.join(" and ")}.</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy || !start || !price.trim()}>
            {busy ? "Confirming…" : "Confirm and email"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineForm({ request, onClose }: { request: RequestForAction; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const { busy, error, submit } = useSubmit(`/api/erp/property-managers/requests/${request.id}/decline`, () => {
    toast("Declined. They were emailed.");
    onClose();
    router.refresh();
  });

  return (
    <Modal open onClose={onClose} dismissible={false} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ reason, message });
        }}
        className="space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900">Decline {request.label}</h2>
        <div>
          <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="d-reason">
            Reason <InfoTip text="The property manager sees this in their email." />
          </label>
          <input id="d-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. We're fully booked that week" className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="d-msg">
            Message to them (optional)
          </label>
          <textarea id="d-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass.md} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" size="sm" disabled={busy || !reason.trim()}>
            {busy ? "Declining…" : "Decline and email"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type ChangeForAction = {
  id: string;
  label: string;
  kind: "CANCEL" | "RESCHEDULE";
  /** Crew days booked from today on. Apply is blocked until they're moved or removed. */
  crewDays: number;
  projectId: string;
};

export function ChangeActions({ change }: { change: ChangeForAction }) {
  const [open, setOpen] = useState<"apply" | "decline" | null>(null);
  return (
    <div className="flex gap-2">
      <Button size="xs" onClick={() => setOpen("apply")}>
        Apply
      </Button>
      <Button size="xs" variant="secondary" onClick={() => setOpen("decline")}>
        Decline
      </Button>
      {open === "apply" && <ApplyChangeForm change={change} onClose={() => setOpen(null)} />}
      {open === "decline" && <DeclineChangeForm change={change} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ApplyChangeForm({ change, onClose }: { change: ChangeForAction; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [message, setMessage] = useState("");
  const { busy, error, submit } = useSubmit(`/api/erp/property-managers/changes/${change.id}/apply`, () => {
    toast(change.kind === "CANCEL" ? "Cancelled. The unit is archived and they were emailed." : "Moved. They were emailed.");
    onClose();
    router.refresh();
  });

  return (
    <Modal open onClose={onClose} dismissible={false} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ message });
        }}
        className="space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {change.kind === "CANCEL" ? "Cancel" : "Move"} {change.label}
          </h2>
          <p className="text-xs text-gray-500">
            {change.kind === "CANCEL" ? "Archives the unit project." : "Moves the unit's start and end dates, keeping its length."} Emails the property manager.
          </p>
        </div>
        {change.crewDays > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {change.crewDays} crew day{change.crewDays === 1 ? " is" : "s are"} booked. {change.kind === "CANCEL" ? "Remove" : "Move"} them on the{" "}
            <a href={`/erp/projects/${change.projectId}`} className="font-medium underline">
              unit
            </a>{" "}
            or Schedule page first so the crew is told.
          </p>
        )}
        <div>
          <label className={labelClass.default} htmlFor="a-msg">
            Message to them (optional)
          </label>
          <textarea id="a-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass.md} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" size="sm" disabled={busy || change.crewDays > 0}>
            {busy ? "Applying…" : "Apply and email"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineChangeForm({ change, onClose }: { change: ChangeForAction; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const { busy, error, submit } = useSubmit(`/api/erp/property-managers/changes/${change.id}/decline`, () => {
    toast("Declined. They were emailed and the unit stays as it is.");
    onClose();
    router.refresh();
  });

  return (
    <Modal open onClose={onClose} dismissible={false} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit({ reason, message });
        }}
        className="space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900">
          Keep {change.label} as is
        </h2>
        <div>
          <label className={`${labelClass.default} flex items-center gap-1`} htmlFor="dc-reason">
            Reason <InfoTip text="The property manager sees this in their email." />
          </label>
          <input id="dc-reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. The crew is already on site that day" className={inputClass.md} />
        </div>
        <div>
          <label className={labelClass.default} htmlFor="dc-msg">
            Message to them (optional)
          </label>
          <textarea id="dc-msg" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass.md} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant="danger" size="sm" disabled={busy || !reason.trim()}>
            {busy ? "Declining…" : "Decline and email"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
