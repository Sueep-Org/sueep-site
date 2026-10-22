import { prisma } from "@/lib/prisma";
import { centsToDollars } from "@/lib/erp/money";
import { subFieldName } from "@/lib/erp/subcontractorQuestionnaire";
import { bidderKey } from "@/lib/erp/subBids";

/**
 * Bids logged for a sub before they had a contractor profile, and which of
 * them look like a given contractor's. Matches are only suggestions; a person
 * links them.
 */

export type UnlinkedBid = {
  id: string;
  projectId: string;
  projectTitle: string;
  bidder: string;
  contact: string;
  amount: string;
  receivedOn: string | null;
  /** Why it looks like this contractor's, e.g. "Same email". Null when it doesn't. */
  matchReason: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const phoneKey = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

type ContractorForMatch = {
  name: string;
  email: string | null;
  phone: string | null;
  contractorFullName: string | null;
  manualApplicationInfo: unknown;
  candidateApplication: { responses: unknown } | null;
};

/** Profile values, falling back to the linked questionnaire, same as the profile page does. */
function profileValue(c: ContractorForMatch, key: string): string | null {
  const name = subFieldName(key);
  const manual = (c.manualApplicationInfo ?? {}) as Record<string, unknown>;
  const linked = (c.candidateApplication?.responses ?? {}) as Record<string, unknown>;
  const v = typeof manual[name] === "string" ? manual[name] : linked[name];
  return typeof v === "string" ? v : null;
}

function matchKeys(c: ContractorForMatch) {
  return {
    emails: new Set([c.email, profileValue(c, "companyEmail")].map(norm).filter(Boolean)),
    phones: new Set([c.phone, profileValue(c, "officePhone"), profileValue(c, "cellPhone")].map(phoneKey).filter(Boolean)),
    names: new Set(
      [c.name, c.contractorFullName, profileValue(c, "legalCompanyName"), profileValue(c, "dba"), profileValue(c, "primaryContact")]
        .map(norm)
        .filter(Boolean),
    ),
  };
}

/** Every bid with no contractor yet, suggested ones first, newest first within each. */
export async function loadUnlinkedBidsFor(contractorId: string): Promise<UnlinkedBid[]> {
  const [contractor, bids] = await Promise.all([
    prisma.contractor.findUnique({
      where: { id: contractorId },
      select: {
        name: true,
        email: true,
        phone: true,
        contractorFullName: true,
        manualApplicationInfo: true,
        candidateApplication: { select: { responses: true } },
      },
    }),
    prisma.subBid.findMany({
      where: { contractorId: null },
      orderBy: [{ receivedOn: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        projectId: true,
        project: { select: { jobTitle: true } },
        bidderName: true,
        bidderCompany: true,
        bidderEmail: true,
        bidderPhone: true,
        amountCents: true,
        receivedOn: true,
      },
    }),
  ]);
  if (!contractor) return [];
  const keys = matchKeys(contractor);

  const rows = bids.map((b): UnlinkedBid => {
    const reason = keys.emails.has(norm(b.bidderEmail))
      ? "Same email"
      : keys.phones.has(phoneKey(b.bidderPhone))
        ? "Same phone"
        : keys.names.has(norm(b.bidderCompany))
          ? "Same company name"
          : keys.names.has(norm(b.bidderName))
            ? "Same name"
            : null;
    return {
      id: b.id,
      projectId: b.projectId,
      projectTitle: b.project.jobTitle,
      bidder: [b.bidderCompany, b.bidderName].filter(Boolean).join(", ") || "Unnamed sub",
      contact: [b.bidderEmail, b.bidderPhone].filter(Boolean).join(", "),
      amount: centsToDollars(b.amountCents),
      receivedOn: b.receivedOn ? b.receivedOn.toISOString().slice(0, 10) : null,
      matchReason: reason,
    };
  });
  return [...rows.filter((r) => r.matchReason), ...rows.filter((r) => !r.matchReason)];
}

/** A sub who bid with no profile, merged across their bids, for filling in the bid form. */
export type PastBidder = {
  key: string;
  bidderName: string | null;
  bidderCompany: string | null;
  bidderEmail: string | null;
  bidderPhone: string | null;
  bidCount: number;
  lastBidOn: string | null;
};

/**
 * Everyone who bid without a profile, one row per sub. Bids with the same
 * email are the same sub; with no email, the same name + company. The newest
 * bid's details win, and blanks are filled from older ones.
 */
export async function loadPastBidders(): Promise<PastBidder[]> {
  const bids = await prisma.subBid.findMany({
    where: { contractorId: null },
    orderBy: [{ createdAt: "desc" }],
    select: { bidderName: true, bidderCompany: true, bidderEmail: true, bidderPhone: true, receivedOn: true, createdAt: true },
  });
  const byKey = new Map<string, PastBidder>();
  for (const b of bids) {
    const key = bidderKey(b);
    if (!key) continue;
    const day = (b.receivedOn ?? b.createdAt).toISOString().slice(0, 10);
    const row = byKey.get(key);
    if (!row) {
      byKey.set(key, { key, ...b, bidCount: 1, lastBidOn: day });
      continue;
    }
    row.bidCount += 1;
    row.bidderName ??= b.bidderName;
    row.bidderCompany ??= b.bidderCompany;
    row.bidderEmail ??= b.bidderEmail;
    row.bidderPhone ??= b.bidderPhone;
    if (!row.lastBidOn || day > row.lastBidOn) row.lastBidOn = day;
  }
  return [...byKey.values()].map(({ key, bidderName, bidderCompany, bidderEmail, bidderPhone, bidCount, lastBidOn }) => ({
    key,
    bidderName,
    bidderCompany,
    bidderEmail,
    bidderPhone,
    bidCount,
    lastBidOn,
  }));
}
