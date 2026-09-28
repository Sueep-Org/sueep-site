import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { JanitorialTabs } from "../JanitorialTabs";
import { HoursReview } from "./HoursReview";

export const metadata: Metadata = {
  title: "Janitorial Hours",
};

export const dynamic = "force-dynamic";

export default async function JanitorialHoursPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-pink-600">Janitorial</h1>
      <JanitorialTabs active="hours" />
      <HoursReview />
    </div>
  );
}
