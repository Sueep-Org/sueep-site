"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InfoTip, Modal, inputClass, labelClass, useConfirm, useToast } from "@/app/erp/components/ui";

/**
 * Where new invoice drafts go: QuickBooks, or HubSpot as a backup. A company-wide
 * setting, so it lives here and not on Ready to Send. Admin only (the API checks too).
 */
export function InvoiceDestinationSwitch({
  on,
  sandbox,
  canSwitch,
  suggestedNextInvoiceNumber,
}: {
  on: boolean;
  sandbox: boolean;
  canSwitch: boolean;
  suggestedNextInvoiceNumber: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function save(next: boolean, nextInvoiceNumber?: number): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/erp/invoice-drafts/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qboDrafts: next, nextInvoiceNumber }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(data.error ?? "Could not save.");
        return false;
      }
      toast(next ? "New invoices now go to QuickBooks." : "New invoices now go to HubSpot. Turn HubSpot's invoice sync to QuickBooks back on.");
      router.refresh();
      return true;
    } catch {
      toast("Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function switchToHubSpot() {
    const ok = await confirm({
      title: "Switch to HubSpot (backup)?",
      message:
        "New drafts will be made in HubSpot instead of QuickBooks. HubSpot only copies invoices into QuickBooks while its invoice sync is on, so turn that back on in HubSpot too, or these invoices won't reach QuickBooks. Drafts already waiting stay where they are.",
      confirmLabel: "Switch to HubSpot",
      danger: true,
    });
    if (ok) await save(false);
  }

  const destination = on ? `QuickBooks${sandbox ? " (test company)" : ""}` : "HubSpot (backup)";

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <span className={`h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          New invoices go to {destination}
          <InfoTip
            text={
              on
                ? "Approve on Ready to Send creates the invoice in QuickBooks, marks the work Billed and sends it to the client. HubSpot is a backup for when QuickBooks can't be used."
                : "Backup mode: Approve on Ready to Send opens the invoice in HubSpot, and HubSpot copies it into QuickBooks only while its invoice sync is on."
            }
            wide
          />
        </h2>
        {canSwitch ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            disabled={busy}
            onClick={() => (on ? void switchToHubSpot() : setSwitching(true))}
          >
            {on ? "Switch to HubSpot (backup)" : "Switch to QuickBooks"}
          </Button>
        ) : (
          <span className="ml-auto text-xs text-gray-500">Only an Admin can change this.</span>
        )}
      </div>
      {switching && (
        <SwitchToQuickBooks
          suggested={suggestedNextInvoiceNumber}
          busy={busy}
          onClose={() => setSwitching(false)}
          onConfirm={async (n) => {
            if (await save(true, n)) setSwitching(false);
          }}
        />
      )}
    </section>
  );
}

/** Confirm box for switching new invoices to QuickBooks, with the next invoice number. */
function SwitchToQuickBooks({ suggested, busy, onClose, onConfirm }: { suggested: number; busy: boolean; onClose: () => void; onConfirm: (n: number) => Promise<void> }) {
  const [value, setValue] = useState(String(suggested));
  const n = Number(value);
  const valid = Number.isInteger(n) && n > 0;
  return (
    <Modal open onClose={onClose} dismissible={!busy} size="sm">
      <h3 className="text-base font-semibold text-gray-900">Switch to QuickBooks</h3>
      <p className="mt-1 text-xs text-gray-500">New drafts will be made for QuickBooks. Approve creates each invoice there and sends it to the client. Drafts already waiting stay as they are.</p>
      <label className={`${labelClass.default} mt-4`}>
        <span className="flex items-center gap-1">
          Next invoice number
          <InfoTip text="Filled in from the highest invoice number the ERP knows. If someone made an invoice in HubSpot today, check its number there and use the one after it." />
        </span>
        <span className="mt-1 flex items-center gap-1 text-sm text-gray-700">
          INV-
          <input value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${inputClass.md} w-32`} />
        </span>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" disabled={!valid || busy} onClick={() => void onConfirm(n)}>
          Switch to QuickBooks
        </Button>
      </div>
    </Modal>
  );
}
