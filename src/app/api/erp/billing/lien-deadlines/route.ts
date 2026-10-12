import { NextResponse } from "next/server";
import { loadLienWatch } from "@/lib/erp/lienWatch";

/**
 * Lien filing deadlines for post-construction jobs with unpaid work. With
 * ?projectId= it returns that one project even when nothing is unpaid.
 */
export async function GET(req: Request) {
  const projectId = new URL(req.url).searchParams.get("projectId")?.trim() || undefined;
  const rows = await loadLienWatch({ projectId });
  return NextResponse.json({ rows });
}
