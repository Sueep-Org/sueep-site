import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OFFER_LETTER_STATUSES, formatOfferDate, parseOfferValues } from "@/lib/erp/offerLetters";

/** Offer tab on an office candidate: their letters, newest first, and a button to make one. */
export async function OfferLettersSection({ candidateId }: { candidateId: string }) {
  const letters = await prisma.offerLetter.findMany({
    where: { candidateId },
    select: { id: true, status: true, values: true, createdAt: true, createdBy: true, template: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Offer letters</h2>
        <Link
          href={`/erp/candidates/${candidateId}/offer-letter`}
          className="rounded-md bg-pink-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-pink-500"
        >
          Make offer letter
        </Link>
      </div>
      {letters.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No offer letters yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-4 py-2 font-semibold">Template</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Salary</th>
                <th className="px-4 py-2 font-semibold">Start</th>
                <th className="px-4 py-2 font-semibold">Made</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {letters.map((l, i) => {
                const v = parseOfferValues(l.values);
                const status = OFFER_LETTER_STATUSES[l.status] ?? OFFER_LETTER_STATUSES.DRAFT;
                return (
                  <tr key={l.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2.5">
                      <Link href={`/erp/candidates/${candidateId}/offer-letter/${l.id}`} className="font-medium text-gray-800 hover:underline">
                        {l.template?.name ?? "Offer letter"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{v.salary || "-"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{v.startDate ? formatOfferDate(v.startDate, "short") : "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500" title={l.createdBy ?? undefined}>
                      {l.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <a href={`/api/erp/candidates/${candidateId}/offer-letters/${l.id}/pdf?download=1`} className="text-xs font-medium text-pink-600 hover:underline">
                        Download
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
