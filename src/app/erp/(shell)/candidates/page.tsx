import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  NEW: { label: "New", cls: "bg-blue-100 text-blue-700" },
  SELECTED: { label: "Selected", cls: "bg-purple-100 text-purple-700" },
  QUESTIONNAIRE_SENT: { label: "Questionnaire Sent", cls: "bg-yellow-100 text-yellow-700" },
  QUESTIONNAIRE_COMPLETE: { label: "Questionnaire Complete", cls: "bg-orange-100 text-orange-700" },
  CONTACTED: { label: "Contacted", cls: "bg-cyan-100 text-cyan-700" },
  INTERVIEW: { label: "Interview", cls: "bg-indigo-100 text-indigo-700" },
  OFFER: { label: "Offer", cls: "bg-pink-100 text-pink-700" },
  HIRED: { label: "Hired", cls: "bg-emerald-100 text-emerald-700" },
  DECLINED: { label: "Declined", cls: "bg-gray-100 text-gray-500" },
};

export default async function CandidatesPage() {
  const candidates = await prisma.candidateApplication.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Candidates</h1>
        <p className="mt-1 text-sm text-gray-500">{candidates.length} application{candidates.length !== 1 ? "s" : ""}</p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No applications yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-pink-400 bg-pink-400 text-xs uppercase text-white">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Phone</th>
                <th className="px-4 py-2 font-medium">Position Interest</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {candidates.map((c) => {
                const status = STATUS_LABELS[c.status] ?? { label: c.status, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.fullName}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{c.positionInterest ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.createdAt.toLocaleDateString()}
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