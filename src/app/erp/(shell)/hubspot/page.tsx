import Link from "next/link";
import { redirect } from "next/navigation";
import { getErpAuth } from "@/lib/erpAuth";
import { isPmLevel } from "@/lib/erpRoles";
import { HubSpotSyncPanel } from "../HubSpotSyncPanel";

export default async function ErpHubSpotPage() {
  const auth = await getErpAuth();
  if (!auth || !isPmLevel(auth.role)) redirect("/erp");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">HubSpot sync</h1>
        <p className="mt-1 text-sm text-gray-600">
          Import deals from your CRM into ERP projects. After syncing, open{" "}
          <Link href="/erp/projects" className="text-pink-600 hover:underline">
            Projects
          </Link>{" "}
          or{" "}
          <Link href="/erp/schedule" className="text-pink-600 hover:underline">
            Schedule
          </Link>
          .
        </p>
      </div>
      <HubSpotSyncPanel />
    </div>
  );
}
