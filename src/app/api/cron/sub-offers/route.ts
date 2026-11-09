import { NextResponse } from "next/server";
import { expireOffers } from "@/lib/erp/subOffers";

export const dynamic = "force-dynamic";

/** Hourly (see vercel.json): job offers past their answer-by become expired, and whoever sent them is told. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await expireOffers());
}
