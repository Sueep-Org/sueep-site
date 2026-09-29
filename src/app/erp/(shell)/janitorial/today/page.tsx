import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getErpAuth, canManageJanitorial } from "@/lib/erpAuth";
import { JanitorialHeader } from "../JanitorialTabs";
import { TodayPanel } from "./TodayPanel";

export const metadata: Metadata = {
  title: "Janitorial Today",
};

export const dynamic = "force-dynamic";

export default async function JanitorialTodayPage() {
  const auth = await getErpAuth();
  if (!auth || !canManageJanitorial(auth.role)) redirect("/erp");

  return (
    <div className="space-y-6">
      <JanitorialHeader active="today" />
      <TodayPanel />
    </div>
  );
}
