import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { JanitorialTabs } from "../JanitorialTabs";
import { HoursReview } from "./HoursReview";

export const metadata: Metadata = {
  title: "Janitorial Hours",
};

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ employee?: string; start?: string; end?: string }> };

/** ?employee=&start=&end= (e.g. from a Payroll row) opens one janitor's pay period. */
export default async function JanitorialHoursPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");
  const { employee, start, end } = await searchParams;
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const range = isDate(start) && isDate(end) && start! <= end! ? { start: start!, end: end! } : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-pink-600">Janitorial</h1>
      <JanitorialTabs active="hours" />
      <HoursReview initialEmployeeId={employee ?? ""} initialRange={range} />
    </div>
  );
}
