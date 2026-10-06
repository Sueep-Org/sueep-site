import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getErpAuth, canManagePropertyManagers } from "@/lib/erpAuth";
import { requestLayoutLabel, requestWorkLabels } from "@/lib/erp/propertyManagerRequestShared";
import { todayEasternKey } from "@/lib/erp/dates";
import { PropertyManagersHeader } from "../PropertyManagersHeader";
import { ChangeActions, RequestActions } from "./RequestActions";

const CHANGE_STATUS: Record<string, { label: string; pill: string }> = {
  APPLIED: { label: "Applied", pill: "bg-emerald-50 text-emerald-700" },
  DECLINED: { label: "Declined", pill: "bg-red-50 text-red-700" },
  WITHDRAWN: { label: "Taken back", pill: "bg-gray-100 text-gray-500" },
};
/** Answered changes stay listed this long. */
const CHANGE_HISTORY_DAYS = 14;

export const metadata: Metadata = {
  title: "Property Manager Requests",
};

export const dynamic = "force-dynamic";

const STATUSES = [
  { value: "REQUESTED", label: "Waiting", pill: "bg-violet-50 text-violet-700" },
  { value: "CONFIRMED", label: "Confirmed", pill: "bg-emerald-50 text-emerald-700" },
  { value: "DECLINED", label: "Declined", pill: "bg-red-50 text-red-700" },
  { value: "CANCELLED", label: "Cancelled", pill: "bg-gray-100 text-gray-500" },
] as const;

function day(d: Date | null, withYear = false): string {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }) : "";
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

type PageProps = { searchParams: Promise<{ status?: string }> };

export default async function PropertyManagerRequestsPage({ searchParams }: PageProps) {
  const auth = await getErpAuth();
  if (!auth || !canManagePropertyManagers(auth.role)) redirect("/erp");

  const { status: rawStatus } = await searchParams;
  const status = rawStatus === "ALL" ? null : (STATUSES.find((s) => s.value === rawStatus)?.value ?? "REQUESTED");

  const today = new Date(`${todayEasternKey()}T00:00:00.000Z`);
  const [requests, openCount, changes] = await Promise.all([
    prisma.propertyManagerRequest.findMany({
      where: status ? { status } : {},
      orderBy: status === "REQUESTED" ? { requestedStartDate: "asc" } : { createdAt: "desc" },
      take: 200,
      include: { building: { select: { id: true, name: true } } },
    }),
    prisma.propertyManagerRequest.count({ where: { status: "REQUESTED" } }),
    prisma.propertyManagerChange.findMany({
      where: { OR: [{ status: "OPEN" }, { decidedAt: { gte: new Date(Date.now() - CHANGE_HISTORY_DAYS * 864e5) } }] },
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const changeProjects = await prisma.project.findMany({
    where: { id: { in: changes.map((c) => c.projectId) } },
    select: {
      id: true,
      jobTitle: true,
      projectDate: true,
      _count: { select: { dayAssignments: { where: { date: { gte: today } } }, workerDayAssignments: { where: { date: { gte: today } } } } },
    },
  });
  const projectById = new Map(changeProjects.map((p) => [p.id, p]));
  const openChanges = changes.filter((c) => c.status === "OPEN").length;

  const filters = [...STATUSES.map((s) => ({ value: s.value as string, label: s.label })), { value: "ALL", label: "All" }];

  return (
    <div className="space-y-6">
      <PropertyManagersHeader active="requests" requestCount={openCount + openChanges} />

      {changes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Changes to confirmed turnovers</h2>
          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-amber-50/60 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Asked for</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {changes.map((c) => {
                  const p = projectById.get(c.projectId);
                  const crewDays = p ? p._count.dayAssignments + p._count.workerDayAssignments : 0;
                  const st = CHANGE_STATUS[c.status];
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-3 py-2">
                        {p ? (
                          <Link href={`/erp/projects/${p.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                            {p.jobTitle}
                          </Link>
                        ) : (
                          <span className="text-gray-400">Project deleted</span>
                        )}
                        {p?.projectDate && <div className="text-xs text-gray-500">Now {day(p.projectDate, true)}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-700">
                        <span className="font-medium">{c.kind === "CANCEL" ? "Cancel" : `Move to ${day(c.newStartDate, true)}`}</span>
                        {c.reason && <div className="mt-0.5 text-gray-500">{c.reason}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        <div>{c.requesterName}</div>
                        <div className="text-gray-400">Sent {day(c.createdAt)}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {c.status === "OPEN" && p ? (
                          <ChangeActions
                            change={{
                              id: c.id,
                              label: p.jobTitle,
                              kind: c.kind === "CANCEL" ? "CANCEL" : "RESCHEDULE",
                              crewDays,
                              projectId: p.id,
                            }}
                          />
                        ) : (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st?.pill ?? "bg-gray-100 text-gray-500"}`}>
                            {st?.label ?? c.status}
                          </span>
                        )}
                        {c.status === "OPEN" && crewDays > 0 && <div className="mt-1 text-amber-700">{crewDays} crew day{crewDays === 1 ? "" : "s"} booked</div>}
                        {c.declineReason && <div className="mt-1">{c.declineReason}</div>}
                        {c.decidedBy && c.status !== "OPEN" && <div className="mt-0.5 text-gray-400">by {c.decidedBy}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <h2 className="text-sm font-semibold text-gray-900">New turnover requests</h2>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = (status ?? "ALL") === f.value;
          return (
            <Link
              key={f.value}
              href={`/erp/property-managers/requests?status=${f.value}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                active ? "border-pink-300 bg-pink-50 font-medium text-pink-700" : "border-gray-300 text-gray-600 hover:border-pink-300"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">No requests here.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Work</th>
                <th className="px-3 py-2 font-medium">Preferred start</th>
                <th className="px-3 py-2 font-medium">Move-out / in</th>
                <th className="px-3 py-2 font-medium">Estimate</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {requests.map((r) => {
                const s = STATUSES.find((x) => x.value === r.status);
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-2">
                      <Link href={`/erp/buildings/${r.building.id}`} className="font-medium text-gray-900 hover:text-pink-600">
                        {r.building.name}
                      </Link>
                      {r.source === "WEBSITE" && (
                        <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">Website</span>
                      )}
                      <div className="text-xs text-gray-600">
                        #{r.unitNumber}, {requestLayoutLabel(r.bedrooms, r.bathrooms, r.isCommonArea)}
                        {r.sqft ? `, ${r.sqft} sq ft` : ""}
                        {r.unitQuality ? `, ${r.unitQuality.toLowerCase()} condition` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {requestWorkLabels(r).join(", ")}
                      {r.notes && <div className="mt-1 whitespace-pre-line text-gray-500">{r.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {day(r.requestedStartDate, true)}
                      {r.requestedEndDate && <div className="text-gray-500">to {day(r.requestedEndDate, true)}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {r.moveOutDate || r.moveInDate ? `${day(r.moveOutDate) || "?"} / ${day(r.moveInDate) || "?"}` : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {money(r.estimateCents)}
                      {r.otherWork && <div className="text-amber-700">+ other, not priced</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      <div>{r.requesterName}</div>
                      {r.source === "WEBSITE" && (
                        <div className="text-gray-500">
                          <a href={`mailto:${r.requesterEmail}`} className="hover:text-pink-600">
                            {r.requesterEmail}
                          </a>
                          {r.requesterPhone && <div>{r.requesterPhone}</div>}
                        </div>
                      )}
                      <div className="text-gray-400">Sent {day(r.createdAt)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {r.status === "REQUESTED" ? (
                        <RequestActions
                          request={{
                            id: r.id,
                            label: `${r.building.name} #${r.unitNumber}`,
                            requestedStart: r.requestedStartDate.toISOString().slice(0, 10),
                            requestedEnd: r.requestedEndDate?.toISOString().slice(0, 10) ?? "",
                            estimateCents: r.estimateCents,
                            otherDescription: r.otherWork ? (r.otherDescription ?? "Other") : null,
                          }}
                        />
                      ) : (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${s?.pill ?? ""}`}>{s?.label ?? r.status}</span>
                      )}
                      {r.status === "CONFIRMED" && r.confirmedStartDate && (
                        <div className="mt-1">
                          {day(r.confirmedStartDate)}
                          {r.confirmedEndDate && r.confirmedEndDate.getTime() !== r.confirmedStartDate.getTime() ? ` to ${day(r.confirmedEndDate)}` : ""}
                          {r.priceCents != null && `, ${money(r.priceCents)}`}
                          {r.projectId && (
                            <Link href={`/erp/projects/${r.projectId}`} className="ml-1 text-pink-600 hover:underline">
                              Open unit
                            </Link>
                          )}
                        </div>
                      )}
                      {r.status === "DECLINED" && r.declineReason && <div className="mt-1">{r.declineReason}</div>}
                      {r.decidedBy && <div className="mt-0.5 text-gray-400">by {r.decidedBy}</div>}
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
