import { NextResponse } from "next/server";
import { getErpAuth, canSeeJobCosts } from "@/lib/erpAuth";
import { loadLienWatch } from "@/lib/erp/lienWatch";
import { loadAllLienWatch, loadBuildingLienWatch } from "@/lib/erp/lienWatchBuildings";

/**
 * Lien filing deadlines for post-construction jobs and buildings with unpaid
 * work. With ?projectId= or ?buildingId= it returns that one, even when
 * nothing is unpaid.
 */
export async function GET(req: Request) {
  // Same roles as roles that see job costs (the Liens tab); the middleware only checks someone is signed in.
  const auth = await getErpAuth();
  if (!auth || !canSeeJobCosts(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const projectId = params.get("projectId")?.trim() || undefined;
  const buildingId = params.get("buildingId")?.trim() || undefined;
  const rows = projectId ? await loadLienWatch({ projectId }) : buildingId ? await loadBuildingLienWatch({ buildingId }) : await loadAllLienWatch();
  return NextResponse.json({ rows });
}
