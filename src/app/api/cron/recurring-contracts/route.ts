import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePeriodForContract } from "@/lib/erp/recurringContracts";
import { draftDueJanitorialInvoices } from "@/lib/erp/janitorialInvoiceDrafts";

export const dynamic = "force-dynamic";

/**
 * Runs daily (see vercel.json). Each RecurringContract has its own
 * billingDayOfMonth, so this checks every active contract rather than
 * relying on Vercel's cron schedule to target a specific day. Once the
 * anchor day has passed for the current month, generation is safe to
 * (re)run any number of times — RecurringContractPeriod's unique
 * constraint makes it a no-op after the first success.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const contracts = await prisma.recurringContract.findMany({
    where: { status: "ACTIVE" },
  });

  const results = [];
  for (const contract of contracts) {
    if (today.getUTCDate() < contract.billingDayOfMonth) continue;
    // Not started yet, or already past its end date.
    if (contract.startDate > today) continue;
    if (contract.endDate && contract.endDate < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))) continue;
    const result = await generatePeriodForContract(contract);
    results.push({ contractId: contract.id, buildingId: contract.buildingId, ...result });
  }

  // HubSpot drafts for contracts with auto-draft on (Ready to send page).
  // Kept separate so a HubSpot problem never stops the months above.
  let drafts: unknown;
  try {
    drafts = await draftDueJanitorialInvoices();
  } catch (e) {
    drafts = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ checked: contracts.length, results, drafts });
}
