"use client";

import { useAskText } from "@/app/erp/components/ui";
import { BILLING_STATUS_OPTIONS, normalizeBillingStatus } from "@/lib/erp/billingStatus";

/** Pill colors for a billing status, the same everywhere it shows. */
export function billingBadgeCls(status: string | null | undefined): string {
  const s = normalizeBillingStatus(status);
  if (s === "PAID") return "bg-emerald-100 text-emerald-700";
  if (s === "BILLED") return "bg-blue-100 text-blue-700";
  if (s === "VOIDED") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-500";
}

/** Hover text for a voided line: why it was voided. */
export function voidTitle(status: string | null | undefined, voidReason: string | null | undefined): string | undefined {
  return normalizeBillingStatus(status) === "VOIDED" ? `Voided: ${voidReason || "no reason saved"}` : undefined;
}

/**
 * The billing status pill dropdown. Picking Voided asks why first and
 * nothing changes if that's cancelled; any other status clears the reason.
 */
export function BillingStatusSelect({
  value,
  voidReason,
  onChange,
  className = "",
}: {
  value: string | null | undefined;
  voidReason?: string | null;
  onChange: (status: string, voidReason: string | null) => void;
  className?: string;
}) {
  const askText = useAskText();
  const current = normalizeBillingStatus(value);

  async function pick(next: string) {
    if (next === current) return;
    if (next !== "VOIDED") return onChange(next, null);
    const reason = await askText({
      title: "Void this?",
      message: "It comes off Not billed and counts as $0 revenue on the Finance tab. Set it back any time.",
      placeholder: "Why it won't be billed or paid",
      confirmLabel: "Void",
    });
    if (reason) onChange("VOIDED", reason);
  }

  return (
    <select
      value={current}
      onChange={(e) => pick(e.target.value)}
      title={voidTitle(current, voidReason)}
      className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none ${billingBadgeCls(current)} ${className}`}
    >
      {BILLING_STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
