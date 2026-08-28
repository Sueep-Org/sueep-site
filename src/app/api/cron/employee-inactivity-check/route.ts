import { NextResponse } from "next/server";
import { flagInactiveEmployees } from "@/lib/erp/employeeInactivity";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json). Auto-flags any Active employee with no
 * logged labor in INACTIVITY_THRESHOLD_MONTHS+ months as Inactive, and
 * emails a digest of who got flagged — see flagInactiveEmployees.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await flagInactiveEmployees();
  return NextResponse.json(result);
}
