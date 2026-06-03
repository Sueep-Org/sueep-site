export const TURNOVER_PRICING_ADMIN_NAMES = ["nick", "dave", "edwin"] as const;

export function isTurnoverPricingAdmin(identity: string | null | undefined) {
  const normalized = String(identity || "").trim().toLowerCase();
  if (!normalized) return false;
  const localPart = normalized.split("@")[0]?.replace(/[^a-z]/g, "") || "";
  return TURNOVER_PRICING_ADMIN_NAMES.some((name) => normalized.includes(name) || localPart === name);
}
