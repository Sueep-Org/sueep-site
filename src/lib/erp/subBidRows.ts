import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SubBidRow, SubBidStatus } from "@/lib/erp/subBids";

/** Server side of sub bids: the row shape the Proposals tab gets, and checks on what a bid points at. */

/** The contractor exists and every SOV line is on this project. Returns an error message, or null. */
export async function checkSubBidRefs(projectId: string, contractorId: string | null | undefined, sovItemIds: string[]): Promise<string | null> {
  if (contractorId) {
    const c = await prisma.contractor.findUnique({ where: { id: contractorId }, select: { id: true } });
    if (!c) return "Contractor not found";
  }
  if (sovItemIds.length > 0) {
    const found = await prisma.projectSOVItem.count({ where: { id: { in: sovItemIds }, sov: { projectId } } });
    if (found !== sovItemIds.length) return "SOV line not found on this project";
  }
  return null;
}

export const subBidInclude = {
  contractor: { select: { name: true } },
  sovItems: { select: { id: true } },
} satisfies Prisma.SubBidInclude;

type BidWithIncludes = Prisma.SubBidGetPayload<{ include: typeof subBidInclude }>;

export function serializeSubBid(b: BidWithIncludes): SubBidRow {
  return {
    id: b.id,
    contractorId: b.contractorId,
    contractorName: b.contractor?.name ?? null,
    bidderName: b.bidderName,
    bidderCompany: b.bidderCompany,
    bidderEmail: b.bidderEmail,
    bidderPhone: b.bidderPhone,
    amountCents: b.amountCents,
    receivedOn: b.receivedOn ? b.receivedOn.toISOString().slice(0, 10) : null,
    status: b.status as SubBidStatus,
    notes: b.notes,
    createdBy: b.createdBy,
    sovItemIds: b.sovItems.map((s) => s.id),
  };
}
