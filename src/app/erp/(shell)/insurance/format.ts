import { centsToDollars } from "@/lib/erp/money";

/** "$12,000", no cents when whole dollars. */
export const fmtMoney = (c: number) => centsToDollars(c).replace(/\.00$/, "");

export const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
