import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PM_LEVEL_ROLES } from "@/lib/erpRoles";
import {
  CLOSED_OFFICE_STAGES,
  OFFICE_STAGES,
  formatSalaryRange,
  officeStageMeta,
  openingStatusMeta,
  workModeLabel,
} from "@/lib/erp/officeHiring";
import { NewOpeningButton } from "./OpeningFormModal";
import { OfficeStageSelect, ShortlistStar } from "./OfficeCandidateControls";

/** Admin, PM and Business Manager logins, for the hiring manager picker. */
export async function loadHiringManagers(): Promise<string[]> {
  const users = await prisma.erpUser.findMany({
    where: { role: { in: [...PM_LEVEL_ROLES] } },
    select: { email: true },
    orderBy: { email: "asc" },
  });
  return users.map((u) => u.email);
}

export function daysOpen(openedAt: Date, closedAt: Date | null): number {
  return Math.max(0, Math.floor(((closedAt ?? new Date()).getTime() - openedAt.getTime()) / 86_400_000));
}

/** Office tab of the Candidates page: one card per job opening, plus a name search across all of them. */
export async function OfficeTab({ search, showAll }: { search: string; showAll: boolean }) {
  const [openings, managers, matches] = await Promise.all([
    prisma.jobOpening.findMany({
      where: showAll ? {} : { status: { in: ["OPEN", "PAUSED"] } },
      include: {
        candidates: { select: { stage: true, shortlisted: true } },
        postings: { select: { costCents: true, applicantCount: true } },
      },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
    }),
    loadHiringManagers(),
    search
      ? prisma.candidateApplication.findMany({
          where: {
            track: "OFFICE",
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
            ],
          },
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            stage: true,
            shortlisted: true,
            expectedSalary: true,
            jobOpening: { select: { id: true, title: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : Promise.resolve(null),
  ]);

  // Open first, then paused, filled, closed (status strings don't sort that way on their own).
  const statusOrder = ["OPEN", "PAUSED", "FILLED", "CLOSED"];
  openings.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex items-center gap-2">
          <input type="hidden" name="track" value="office" />
          {showAll ? <input type="hidden" name="openings" value="all" /> : null}
          <input
            name="search"
            defaultValue={search}
            placeholder="Search office candidates…"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900"
          />
        </form>
        <div className="flex items-center gap-3">
          <Link
            href={showAll ? "/erp/candidates?track=office" : "/erp/candidates?track=office&openings=all"}
            className="text-xs text-pink-600 hover:underline"
          >
            {showAll ? "Hide filled and closed" : "Show filled and closed"}
          </Link>
          <NewOpeningButton managers={managers} />
        </div>
      </div>

      {matches ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">
            {matches.length} match{matches.length === 1 ? "" : "es"} for &ldquo;{search}&rdquo;
            <Link href={`/erp/candidates?track=office${showAll ? "&openings=all" : ""}`} className="ml-2 text-xs font-normal text-pink-600 hover:underline">
              Clear
            </Link>
          </h2>
          {matches.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-gray-300 bg-gray-200 text-xs uppercase text-gray-700">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-4 py-2 font-semibold">Name</th>
                    <th className="px-4 py-2 font-semibold">Opening</th>
                    <th className="px-4 py-2 font-semibold">Contact</th>
                    <th className="px-4 py-2 font-semibold">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((c, i) => (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2.5"><ShortlistStar id={c.id} initial={c.shortlisted} /></td>
                      <td className="px-4 py-2.5 font-medium">
                        <Link href={`/erp/candidates/${c.id}`} className="text-gray-800 hover:underline">{c.fullName}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {c.jobOpening ? (
                          <Link href={`/erp/candidates/openings/${c.jobOpening.id}`} className="hover:underline">{c.jobOpening.title}</Link>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{c.phone || c.email || "-"}</td>
                      <td className="px-4 py-2.5"><OfficeStageSelect id={c.id} initialStage={c.stage} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {openings.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
          No openings yet. Add one to start tracking candidates.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {openings.map((o) => {
            const status = openingStatusMeta(o.status);
            const active = o.candidates.filter((c) => !CLOSED_OFFICE_STAGES.includes(officeStageMeta(c.stage).value));
            const shortlisted = o.candidates.filter((c) => c.shortlisted).length;
            const cost = o.postings.reduce((s, p) => s + (p.costCents ?? 0), 0);
            const applicants = o.postings.reduce((s, p) => s + (p.applicantCount ?? 0), 0);
            const salary = formatSalaryRange(o.salaryMinCents, o.salaryMaxCents);
            const meta = [o.location, workModeLabel(o.workMode), salary].filter(Boolean).join(" · ");
            // Stage counts for the active stages only, in pipeline order.
            const stageCounts = OFFICE_STAGES.filter((s) => !CLOSED_OFFICE_STAGES.includes(s.value))
              .map((s) => ({ ...s, n: active.filter((c) => officeStageMeta(c.stage).value === s.value).length }))
              .filter((s) => s.n > 0);
            const hired = o.candidates.filter((c) => c.stage === "HIRED").length;
            return (
              <Link
                key={o.id}
                href={`/erp/candidates/openings/${o.id}`}
                className="group flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-pink-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-gray-900 group-hover:text-pink-600">{o.title}</h3>
                    {meta ? <p className="mt-0.5 truncate text-xs text-gray-500">{meta}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.label}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stageCounts.length === 0 ? (
                    <span className="text-xs text-gray-400">No active candidates</span>
                  ) : (
                    stageCounts.map((s) => (
                      <span key={s.value} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                        {s.label} {s.n}
                      </span>
                    ))
                  )}
                  {hired > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Hired {hired}</span>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{o.candidates.length} candidate{o.candidates.length === 1 ? "" : "s"}</span>
                  {shortlisted > 0 ? <span>★ {shortlisted}</span> : null}
                  <span>{daysOpen(o.openedAt, o.closedAt)}d open</span>
                  {cost > 0 ? <span>${Math.round(cost / 100).toLocaleString("en-US")} ads{applicants ? `, ${applicants} applied` : ""}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
