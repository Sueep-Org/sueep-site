import type { ExpiryStatus } from "@/lib/erp/insurance";

const pill = "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium";

export function ExpiryBadge({ status }: { status: ExpiryStatus }) {
  if (status.status === "EXPIRED") return <span className={`${pill} bg-red-50 text-red-700`}>Expired</span>;
  if (status.status === "EXPIRING") {
    return (
      <span className={`${pill} bg-amber-50 text-amber-700`}>
        {status.daysLeft === 0 ? "Expires today" : `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left`}
      </span>
    );
  }
  return <span className={`${pill} bg-emerald-50 text-emerald-700`}>Current</span>;
}

/** The certificate items a policy includes, as short labels. */
export function Included({ ai, waiver, pnc }: { ai: boolean; waiver: boolean; pnc: boolean }) {
  const items = [ai && "AI", waiver && "Waiver", pnc && "P&NC"].filter(Boolean);
  if (!items.length) return <span className="text-xs text-gray-400">None</span>;
  return <span className="text-xs text-gray-700">{items.join(" · ")}</span>;
}
