import { NextRequest, NextResponse } from "next/server";
import { getErpAuth } from "@/lib/erpAuth";
import { loadContractorWork, workRowJson, workTotals } from "@/lib/erp/contractorWork";

/**
 * GET /api/erp/contractor-labor
 * A contractor's work history (see contractorWork.ts), success/data/hasMore
 * with skip+take pagination, same shape as GET /api/erp/labor.
 * Query params:
 *   - contractorId: required
 *   - projectId: Filter by project
 *   - buildingId: Filter by building ("none" for work with no building)
 *   - startDate / endDate: Filter by the row's shown date (start, else assigned, else end), inclusive
 *   - sort: "date" (newest first, default) or "building" (building A to Z, then newest first)
 *   - skip / take: Pagination; no take returns every row (CSV export)
 * totals covers every matching row, not just this page.
 */
export async function GET(request: NextRequest) {
  if (!(await getErpAuth())) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const searchParams = request.nextUrl.searchParams;
    const contractorId = searchParams.get("contractorId");
    if (!contractorId) return NextResponse.json({ success: false, error: "contractorId required" }, { status: 400 });
    const skip = Number(searchParams.get("skip") ?? "0") || 0;
    const takeParam = searchParams.get("take");
    const take = takeParam ? Math.min(200, Math.max(1, Number(takeParam) || 0)) : null;

    const combined = await loadContractorWork({
      contractorId,
      projectId: searchParams.get("projectId"),
      buildingId: searchParams.get("buildingId"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
      sort: searchParams.get("sort") === "building" ? "building" : "date",
    });

    const pageRows = take != null ? combined.slice(skip, skip + take) : combined.slice(skip);
    return NextResponse.json({
      success: true,
      hasMore: take != null && skip + pageRows.length < combined.length,
      data: pageRows.map(workRowJson),
      totals: workTotals(combined),
    });
  } catch (error) {
    console.error("Contractor labor GET error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch contractor labor" }, { status: 500 });
  }
}
