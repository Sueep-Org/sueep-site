"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatUnitDisplay } from "@/lib/erp/unitDisplay";

// ── Shared ────────────────────────────────────────────────────────────────────

type Tab = "post-construction" | "janitorial";

const BILLING_OPTIONS = [
  { value: "NOT_BILLED", label: "Not Billed" },
  { value: "BILLED",     label: "Billed" },
  { value: "PAID",       label: "Paid" },
] as const;

function billingBadgeCls(status: string): string {
  if (status === "PAID")   return "bg-emerald-100 text-emerald-700";
  if (status === "BILLED") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-500";
}

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Post-construction ─────────────────────────────────────────────────────────

type SOVItemRow = {
  id: string;
  description: string;
  scheduledValueCents: number;
  billingStatus: string;
};

type CORow = {
  id: string;
  projectId: string;
  title: string;
  contractValueCents: number;
  billingStatus: string;
  completedAt: string;
};

type PostConProjectRow = {
  projectId: string;
  jobTitle: string;
  projectBillingStatus: string | null;
  items: SOVItemRow[];
  changeOrders: CORow[];
};

type PostConResponse = {
  start: string;
  end: string;
  rows: PostConProjectRow[];
};

function buildPostConCsv(rows: PostConProjectRow[], start: string, end: string): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Project", "Item", "Type", "Value", "Billing Status"].map(escape).join(",");
  const dataRows: string[] = [];
  for (const project of rows) {
    for (const item of project.items) {
      dataRows.push([
        escape(project.jobTitle),
        escape(item.description),
        escape("SOV"),
        escape((item.scheduledValueCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === item.billingStatus)?.label ?? item.billingStatus),
      ].join(","));
    }
    for (const co of (project.changeOrders ?? [])) {
      dataRows.push([
        escape(project.jobTitle),
        escape(`CO: ${co.title}`),
        escape("Change Order"),
        escape((co.contractValueCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === co.billingStatus)?.label ?? co.billingStatus),
      ].join(","));
    }
  }
  const sovTotal = rows.flatMap((r) => r.items).reduce((s, i) => s + i.scheduledValueCents, 0);
  const coTotal = rows.flatMap((r) => r.changeOrders ?? []).reduce((s, c) => s + c.contractValueCents, 0);
  dataRows.push([escape("TOTAL"), escape(""), escape(""), escape(((sovTotal + coTotal) / 100).toFixed(2)), escape("")].join(","));
  void end;
  return [headers, ...dataRows].join("\r\n");
}

function PostConstructionTab({ start, end }: { start: string; end: string }) {
  const [data, setData] = useState<PostConResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/erp/billing/post-construction?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d: PostConResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load billing data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end]);

  const allItems = data?.rows.flatMap((r) => r.items) ?? [];
  const allCOs = data?.rows.flatMap((r) => r.changeOrders ?? []) ?? [];
  const totalCents = allItems.reduce((s, i) => s + i.scheduledValueCents, 0)
    + allCOs.reduce((s, c) => s + c.contractValueCents, 0);

  async function updateCOBillingStatus(projectId: string, coId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.projectId !== projectId ? row : {
            ...row,
            changeOrders: (row.changeOrders ?? []).map((co) =>
              co.id === coId ? { ...co, billingStatus } : co,
            ),
          },
        ),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}/change-orders/${coId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(`/api/erp/billing/post-construction?start=${start}&end=${end}`)
        .then((r) => r.json()).then((d: PostConResponse) => setData(d)).catch(() => {});
    }
  }

  async function updateBillingStatus(projectId: string, itemId: string, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) =>
          row.projectId !== projectId ? row : {
            ...row,
            items: row.items.map((item) => item.id === itemId ? { ...item, billingStatus } : item),
          },
        ),
      };
    });
    try {
      await fetch(`/api/erp/projects/${projectId}/sov/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billingStatus }),
      });
    } catch {
      fetch(`/api/erp/billing/post-construction?start=${start}&end=${end}`)
        .then((r) => r.json()).then((d: PostConResponse) => setData(d)).catch(() => {});
    }
  }

  function downloadCsv() {
    if (!data) return;
    const csv = buildPostConCsv(data.rows, data.start, data.end);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-post-construction-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!data || data.rows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">SOV Item</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3">Billing Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No completed SOV items in this date range.</td></tr>
              ) : (
                data.rows.map((project) => {
                  const allProjectRows = [
                    ...project.items.map((item) => ({ type: "sov" as const, item })),
                    ...(project.changeOrders ?? []).map((co) => ({ type: "co" as const, co })),
                  ];
                  return allProjectRows.map((row, idx) => (
                    <tr key={row.type === "sov" ? row.item.id : row.co.id} className={`border-t border-gray-100 hover:bg-gray-50 ${row.type === "co" ? "bg-blue-50/30" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {idx === 0 ? (
                          <Link href={`/erp/projects/${project.projectId}`} className="hover:text-pink-600 hover:underline">
                            {project.jobTitle}
                          </Link>
                        ) : (
                          <span className="text-gray-300 select-none">↳</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {row.type === "sov" ? row.item.description : (
                          <span className="flex items-center gap-1.5">
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-600">CO</span>
                            <Link href={`/erp/projects/${project.projectId}/change-orders/${row.co.id}`} className="hover:text-pink-600 hover:underline">
                              {row.co.title}
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {row.type === "sov" ? fmt(row.item.scheduledValueCents) : fmt(row.co.contractValueCents)}
                      </td>
                      <td className="px-4 py-3">
                        {row.type === "sov" ? (
                          <select
                            value={row.item.billingStatus}
                            onChange={(e) => updateBillingStatus(project.projectId, row.item.id, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.item.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={row.co.billingStatus}
                            onChange={(e) => updateCOBillingStatus(project.projectId, row.co.id, e.target.value)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(row.co.billingStatus)}`}
                          >
                            {BILLING_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ));
                })
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Total — {allItems.length} SOV item{allItems.length !== 1 ? "s" : ""}
                    {allCOs.length > 0 ? ` + ${allCOs.length} change order${allCOs.length !== 1 ? "s" : ""}` : ""}
                    {" "}across {data.rows.length} project{data.rows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCents)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Janitorial ────────────────────────────────────────────────────────────────

type JanUnitRow = {
  projectId: string;
  turnoverRequestId: string | null;
  jobTitle: string;
  unitNumber: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  completedAt: string;
  contractCents: number;
  billingStatus: string;
};

type JanBuildingRow = {
  buildingId: string;
  buildingName: string;
  units: JanUnitRow[];
};

type JanResponse = {
  start: string;
  end: string;
  rows: JanBuildingRow[];
};

function buildJanCsv(rows: JanBuildingRow[], start: string, end: string): string {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Building", "Unit", "Beds/Baths", "Completed", "Contract Amount", "Billing Status"].map(escape).join(",");
  const dataRows: string[] = [];
  for (const building of rows) {
    for (const unit of building.units) {
      const bedbath = [unit.bedrooms != null ? `${unit.bedrooms}bd` : null, unit.bathrooms != null ? `${unit.bathrooms}ba` : null].filter(Boolean).join("/") || "—";
      dataRows.push([
        escape(building.buildingName),
        escape(formatUnitDisplay(unit.unitNumber) ?? unit.jobTitle),
        escape(bedbath),
        escape(unit.completedAt.slice(0, 10)),
        escape((unit.contractCents / 100).toFixed(2)),
        escape(BILLING_OPTIONS.find((o) => o.value === unit.billingStatus)?.label ?? unit.billingStatus),
      ].join(","));
    }
  }
  const total = rows.flatMap((r) => r.units).reduce((s, u) => s + u.contractCents, 0);
  dataRows.push([escape("TOTAL"), escape(""), escape(""), escape(""), escape((total / 100).toFixed(2)), escape("")].join(","));
  void end;
  return [headers, ...dataRows].join("\r\n");
}

function JanitorialTab({ start, end }: { start: string; end: string }) {
  const [data, setData] = useState<JanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/erp/billing/janitorial?start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d: JanResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError("Could not load billing data."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [start, end]);

  const allUnits = data?.rows.flatMap((r) => r.units) ?? [];
  const totalCents = allUnits.reduce((s, u) => s + u.contractCents, 0);

  async function updateBillingStatus(unit: JanUnitRow, billingStatus: string) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => ({
          ...row,
          units: row.units.map((u) => u.projectId === unit.projectId ? { ...u, billingStatus } : u),
        })),
      };
    });
    try {
      if (unit.turnoverRequestId) {
        await fetch(`/api/erp/turnover-requests/${unit.turnoverRequestId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ billingStatus }),
        });
      } else {
        await fetch(`/api/erp/projects/${unit.projectId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ billingStatus }),
        });
      }
    } catch {
      fetch(`/api/erp/billing/janitorial?start=${start}&end=${end}`)
        .then((r) => r.json()).then((d: JanResponse) => setData(d)).catch(() => {});
    }
  }

  function downloadCsv() {
    if (!data) return;
    const csv = buildJanCsv(data.rows, data.start, data.end);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-janitorial-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!data || data.rows.length === 0}
          className="flex items-center gap-2 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Download CSV
        </button>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-gray-300 bg-gray-200 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-3">Building</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3">Beds / Baths</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-right">Contract Amount</th>
                <th className="px-4 py-3">Billing Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-red-500">{error}</td></tr>
              ) : !data || data.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No completed units in this date range.</td></tr>
              ) : (
                data.rows.map((building) =>
                  building.units.map((unit, idx) => (
                    <tr key={unit.projectId} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {idx === 0 ? building.buildingName : <span className="text-gray-300 select-none">↳</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        <Link href={`/erp/projects/${unit.projectId}`} className="hover:text-pink-600 hover:underline">
                          {formatUnitDisplay(unit.unitNumber) || unit.jobTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {[unit.bedrooms != null ? `${unit.bedrooms} bd` : null, unit.bathrooms != null ? `${unit.bathrooms} ba` : null].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs tabular-nums">
                        {new Date(unit.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {unit.contractCents > 0 ? fmt(unit.contractCents) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={unit.billingStatus}
                          onChange={(e) => updateBillingStatus(unit, e.target.value)}
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold focus:outline-none cursor-pointer ${billingBadgeCls(unit.billingStatus)}`}
                        >
                          {BILLING_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
            {data && data.rows.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-100 text-xs font-semibold text-gray-700">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    Total — {allUnits.length} unit{allUnits.length !== 1 ? "s" : ""} across {data.rows.length} building{data.rows.length !== 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(totalCents)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [tab, setTab] = useState<Tab>("post-construction");
  const [start, setStart] = useState(monthStartISO);
  const [end, setEnd] = useState(todayISO);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (t === "post-construction" || t === "janitorial") setTab(t);
  }, []);

  function updateTab(t: Tab) {
    setTab(t);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", t);
    history.replaceState(null, "", `?${params.toString()}`);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "post-construction", label: "Post-Construction" },
    { id: "janitorial", label: "Janitorial" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-pink-600">Project Billing</h1>
        {/* Date range picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600" htmlFor="bill-start">From</label>
          <input
            id="bill-start"
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
          <label className="text-xs font-medium text-gray-600" htmlFor="bill-end">To</label>
          <input
            id="bill-end"
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateTab(t.id)}
              className={[
                "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-pink-600 text-pink-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "post-construction" && <PostConstructionTab start={start} end={end} />}
      {tab === "janitorial" && <JanitorialTab start={start} end={end} />}
    </div>
  );
}
