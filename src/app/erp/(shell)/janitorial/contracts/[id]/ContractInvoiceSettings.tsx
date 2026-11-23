"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InfoTip, inputClass, useToast } from "@/app/erp/components/ui";

/**
 * This contract's monthly invoice drafting: Auto-draft and the invoice line
 * label. Moved here from Ready to Send's old Contracts tab. Admin and Business
 * Manager can change it (the API checks too); everyone else sees it read-only.
 */
export function ContractInvoiceSettings({
  contractId,
  buildingName,
  autoDraft,
  label,
  hasDeal,
  toQuickBooks,
  nextDraftLabel,
  canEdit,
}: {
  contractId: string;
  buildingName: string;
  autoDraft: boolean;
  label: string;
  /** HubSpot drafts need the building's deal; QuickBooks drafts don't */
  hasDeal: boolean;
  toQuickBooks: boolean;
  nextDraftLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [labelValue, setLabelValue] = useState(label);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/erp/invoice-drafts/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) toast(data.error ?? "Could not save.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Monthly invoice
        <InfoTip
          text={`With Auto-draft on, each month's invoice is drafted on Ready to Send before its billing day, for an Admin or Business Manager to approve. Turn it on only once nobody makes this contract's invoice by hand in ${toQuickBooks ? "QuickBooks or HubSpot" : "HubSpot"}, or the month gets two invoices.`}
          wide
        />
      </h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2 text-gray-800">
          <input
            type="checkbox"
            checked={autoDraft}
            disabled={!canEdit || busy || (!hasDeal && !autoDraft)}
            onChange={(e) => void patch({ autoDraftInvoices: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-pink-600"
          />
          Auto-draft
        </label>
        <div>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            Invoice label
            <InfoTip text='Shown as "Recurring cleaning <label>" on the invoice. Blank uses the building name.' />
          </span>
          {canEdit ? (
            <input
              value={labelValue}
              placeholder={buildingName}
              disabled={busy}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={() => labelValue !== label && void patch({ invoiceLabel: labelValue })}
              className={`${inputClass.sm} mt-1 w-56`}
            />
          ) : (
            <div className="mt-1 text-gray-800">{label || buildingName}</div>
          )}
        </div>
        <div>
          <span className="text-xs text-gray-500">Next draft</span>
          <div className="mt-1 text-gray-800">{autoDraft ? nextDraftLabel : <span className="text-gray-400">Off</span>}</div>
        </div>
      </div>
      {!hasDeal && <p className="mt-2 text-xs text-red-700">No HubSpot deal is linked to this building, so Auto-draft can&apos;t be turned on.</p>}
      {!canEdit && <p className="mt-2 text-xs text-gray-500">Only an Admin or Business Manager can change these.</p>}
    </section>
  );
}
