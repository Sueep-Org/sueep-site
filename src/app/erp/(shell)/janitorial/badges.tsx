export const PERIOD_BILLING_OPTIONS = [
  { value: "NOT_BILLED", label: "Not Billed" },
  { value: "BILLED", label: "Billed" },
  { value: "PAID", label: "Paid" },
] as const;

export function billingBadgeCls(status: string): string {
  if (status === "PAID") return "bg-emerald-100 text-emerald-700";
  if (status === "BILLED") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

export function BillingStatusBadge({ status }: { status: string }) {
  const label = PERIOD_BILLING_OPTIONS.find((o) => o.value === status)?.label ?? status;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${billingBadgeCls(status)}`}>{label}</span>;
}

export function ContractStatusBadge({ status }: { status: string }) {
  const cls =
    status === "ACTIVE"
      ? "bg-emerald-100 text-emerald-800"
      : status === "PAUSED"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-500";
  const label = status === "ACTIVE" ? "Active" : status === "PAUSED" ? "Paused" : "Ended";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
