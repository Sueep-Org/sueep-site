"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

const BILLING_OPTIONS = [
  { value: "", label: "— None —" },
  { value: "BILLING", label: "Billing" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "INVOICE_PAID", label: "Invoice Paid" },
];

const ESTIMATOR_API = "https://ai-estimator-api-code-gaaaajezb3hfh9ex.eastus2-01.azurewebsites.net";

type Props = {
  projectId: string;
  contractValueCents: number | null;
  percentDone: number;
  percentInvoiced: number;
  billingStatus: string | null;
  estMaterialCents: number | null;
  estTravelCents: number | null;
  estLaborCents: number | null;
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  estHours: number | null;
  actualHours: number | null;
  contractorCostCents: number;
  laborCentsFromLogs: number;
  hoursFromLogs: number;
};

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function ProjectFinancialsEditor({
  projectId,
  contractValueCents,
  percentDone,
  percentInvoiced,
  billingStatus,
  estMaterialCents,
  estTravelCents,
  estLaborCents,
  actualLaborCents,
  actualMaterialCents,
  estHours,
  actualHours,
  contractorCostCents,
  laborCentsFromLogs,
  hoursFromLogs,
}: Props) {
  const hasLaborLogs = laborCentsFromLogs > 0 || hoursFromLogs > 0;
  const router = useRouter();
  const [contractValue, setContractValue] = useState(centsToInput(contractValueCents));
  const [pctDone, setPctDone] = useState(percentDone === 0 ? "" : String(percentDone));
  const [pctInvoiced, setPctInvoiced] = useState(percentInvoiced === 0 ? "" : String(percentInvoiced));
  const [billStatus, setBillStatus] = useState(billingStatus ?? "");
  const [estMat, setEstMat] = useState(centsToInput(estMaterialCents));
  const [estTravel, setEstTravel] = useState(centsToInput(estTravelCents));
  const [estLab, setEstLab] = useState(centsToInput(estLaborCents));
  const [actLab, setActLab] = useState(centsToInput(actualLaborCents));
  const [actMat, setActMat] = useState(centsToInput(actualMaterialCents));
  const [estHrs, setEstHrs] = useState(estHours != null ? String(estHours) : "");
  const [actHrs, setActHrs] = useState(actualHours != null ? String(actualHours) : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Estimator import modal
  const [estModalOpen, setEstModalOpen] = useState(false);
  const [estProjects, setEstProjects] = useState<{ id: string; name: string }[]>([]);
  const [estModalLoading, setEstModalLoading] = useState(false);
  const [estModalError, setEstModalError] = useState("");

  async function openEstimatorImport() {
    const anonId = localStorage.getItem("ai_estimator_anon_id");
    if (!anonId) {
      setEstModalError("Open the AI Estimator page at least once to link your account.");
      setEstModalOpen(true);
      return;
    }
    setEstModalOpen(true);
    setEstModalLoading(true);
    setEstModalError("");
    try {
      const res = await fetch(`${ESTIMATOR_API}/api/projects`, {
        headers: { "x-anon-id": anonId },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load projects");
      const data = (await res.json()) as { projects?: { id: string; name: string }[] };
      setEstProjects(data.projects ?? []);
      if ((data.projects ?? []).length === 0) setEstModalError("No estimator projects found.");
    } catch {
      setEstModalError("Could not connect to the estimator. Try again.");
    } finally {
      setEstModalLoading(false);
    }
  }

  async function importEstimatorProject(estId: string) {
    const anonId = localStorage.getItem("ai_estimator_anon_id")!;
    setEstModalLoading(true);
    setEstModalError("");
    try {
      const projRes = await fetch(`${ESTIMATOR_API}/api/projects/${estId}`, {
        headers: { "x-anon-id": anonId }, cache: "no-store",
      });
      if (!projRes.ok) throw new Error("Failed to load project");

      const proj = (await projRes.json()) as {
        labor?: number;
        quote?: number;
        labor_breakdown?: {
          cleaner_rate?: number;
          foreman_rate?: number;
          phases?: { persons?: number; days?: number }[];
        };
      };

      // Labor and contract value
      if (proj.labor != null) setEstLab(proj.labor.toFixed(2));
      if (proj.quote != null) setContractValue(proj.quote.toFixed(2));

      // Materials — recalculate from phases (5% of labor per phase)
      const lb = proj.labor_breakdown;
      if (lb) {
        const cleanerRate = lb.cleaner_rate ?? 0;
        const foremanRate = lb.foreman_rate ?? 0;
        let totalMaterials = 0;
        for (const phase of lb.phases ?? []) {
          const laborCost = (phase.persons ?? 0) * (phase.days ?? 0) * cleanerRate * 8
            + (phase.days ?? 0) * foremanRate;
          totalMaterials += laborCost * 0.05;
        }
        if (totalMaterials > 0) setEstMat(totalMaterials.toFixed(2));
      }

      // SOV items — one row per measured PDF page, from the estimator's own
      // "Schedule of Values" feature. That feature never saves to the estimator's
      // server; it's computed client-side from page measurements stored in this
      // browser's localStorage (key: annotations_<estimatorProjectId>). Since the
      // estimator UI is served from this same app/origin, we can read it directly.
      // The user-typed descriptions for each page live separately, under
      // sov_rows_<estimatorProjectId>, and are read here so real descriptions
      // (not just "Page N") carry over into the imported SOV items.
      let sovNote = "";
      const annotJson = localStorage.getItem(`annotations_${estId}`);
      const sovRowsJson = localStorage.getItem(`sov_rows_${estId}`);
      const descriptionByPage = new Map<number, string>();
      if (sovRowsJson) {
        try {
          const parsedRows = JSON.parse(sovRowsJson) as {
            page?: number;
            description?: string;
            deleted?: boolean;
          }[];
          for (const row of parsedRows) {
            if (row.deleted || row.page == null || !row.description) continue;
            descriptionByPage.set(Number(row.page), row.description);
          }
        } catch {
          // ignore malformed SOV row cache
        }
      }
      if (!annotJson) {
        sovNote = "SOV not imported: no page measurements found in this browser for that estimator project. Measurements only exist on the device/browser where the PDF was measured.";
      } else {
        let measurementsByPage: Record<string, { area?: number }[]> = {};
        try {
          const parsed = JSON.parse(annotJson) as { measurements?: Record<string, { area?: number }[]> };
          measurementsByPage = parsed.measurements ?? {};
        } catch {
          measurementsByPage = {};
        }

        const pageAreas = Object.entries(measurementsByPage)
          .map(([page, items]) => ({
            page: Number(page),
            area: items.reduce((sum, m) => sum + (Number(m.area) || 0), 0),
          }))
          .filter((p) => p.area > 0)
          .sort((a, b) => a.page - b.page);
        const totalArea = pageAreas.reduce((s, p) => s + p.area, 0);

        if (pageAreas.length === 0) {
          sovNote = "SOV not imported: no measured pages found for that estimator project in this browser.";
        } else if (!proj.quote || proj.quote <= 0) {
          sovNote = "SOV not imported: the estimator project has no contract value set, so per-page dollar amounts can't be calculated.";
        } else {
          const sovItems = pageAreas
            .map((p, idx) => ({
              description: descriptionByPage.get(p.page) ?? `Page ${p.page}`,
              scheduledValueCents: Math.round((p.area / totalArea) * proj.quote! * 100),
              order: idx,
            }))
            .filter((item) => item.scheduledValueCents > 0);

          // Overwrite: clear out any SOV items already on this project before
          // creating the freshly imported ones, so re-importing (or importing
          // a different estimator project) doesn't just pile up duplicates.
          const existingSovRes = await fetch(`/api/erp/projects/${projectId}/sov`, { cache: "no-store" });
          const existingSov = existingSovRes.ok
            ? ((await existingSovRes.json()) as { items?: { id: string }[] })
            : { items: [] };
          await Promise.all(
            (existingSov.items ?? []).map((item) =>
              fetch(`/api/erp/projects/${projectId}/sov/items/${item.id}`, { method: "DELETE" })
            )
          );

          await Promise.all(
            sovItems.map((item) =>
              fetch(`/api/erp/projects/${projectId}/sov/items`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(item),
              })
            )
          );
        }
      }

      setEstModalOpen(false);
      setError(sovNote);
      router.refresh();
    } catch {
      setEstModalError("Could not load that project. Try again.");
    } finally {
      setEstModalLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractValue: contractValue === "" ? null : Number(contractValue),
          percentDone: pctDone === "" ? 0 : Number(pctDone),
          percentInvoiced: pctInvoiced === "" ? 0 : Number(pctInvoiced),
          billingStatus: billStatus || null,
          estMaterial: estMat === "" ? null : Number(estMat),
          estTravel: estTravel === "" ? null : Number(estTravel),
          estLabor: estLab === "" ? null : Number(estLab),
          actualLabor: actLab === "" ? null : Number(actLab),
          actualMaterial: actMat === "" ? null : Number(actMat),
          estHours: estHrs === "" ? null : Number(estHrs),
          actualHours: actHrs === "" ? null : Number(actHrs),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) { setError(data.error || "Update failed"); return; }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Estimator import modal */}
      {estModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Import from AI Estimator</h3>
              <button
                type="button"
                onClick={() => setEstModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              Select a project to pull est. labor, materials, contract value, and SOV (one line per measured PDF
              page — only works if this browser was used to measure that project in the estimator).
            </p>
            {estModalLoading ? (
              <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
            ) : estModalError ? (
              <p className="text-xs text-red-500">{estModalError}</p>
            ) : (
              <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                {estProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => importEstimatorProject(p.id)}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-yellow-50 hover:text-yellow-900"
                    >
                      {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-6">

        {/* Import banner */}
        <div className="flex items-center justify-between rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2">
          <p className="text-xs text-yellow-800">Pull est. labor &amp; contract value from the AI Estimator</p>
          <button
            type="button"
            onClick={openEstimatorImport}
            className="ml-3 shrink-0 rounded-md bg-yellow-400 px-3 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-300 active:bg-yellow-500"
          >
            Import from Estimator
          </button>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contract &amp; Progress</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelCls} htmlFor="fin-contract">Contract value ($)</label>
              <input id="fin-contract" type="number" min={0} step={0.01} className={inputCls} value={contractValue} onChange={(e) => setContractValue(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className={labelCls} htmlFor="fin-pct-done">% Done</label>
              <input id="fin-pct-done" type="number" min={0} max={100} step={1} className={inputCls} value={pctDone} onChange={(e) => setPctDone(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor="fin-pct-invoiced">% Invoiced</label>
              <input id="fin-pct-invoiced" type="number" min={0} max={100} step={1} className={inputCls} value={pctInvoiced} onChange={(e) => setPctInvoiced(e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className={labelCls} htmlFor="fin-bill-status">Billing status</label>
              <select id="fin-bill-status" className={inputCls} value={billStatus} onChange={(e) => setBillStatus(e.target.value)}>
                {BILLING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-2 gap-6">
            {/* Estimated column */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Estimated</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelCls} htmlFor="fin-est-lab">Labor ($)</label>
                  <input id="fin-est-lab" type="number" min={0} step={0.01} className={inputCls} value={estLab} onChange={(e) => setEstLab(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fin-est-mat">Material ($)</label>
                  <input id="fin-est-mat" type="number" min={0} step={0.01} className={inputCls} value={estMat} onChange={(e) => setEstMat(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fin-est-travel">Travel ($)</label>
                  <input id="fin-est-travel" type="number" min={0} step={0.01} className={inputCls} value={estTravel} onChange={(e) => setEstTravel(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="fin-est-hrs">Hours</label>
                  <input id="fin-est-hrs" type="number" min={0} step={0.5} className={inputCls} value={estHrs} onChange={(e) => setEstHrs(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Actual column */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Actual</h3>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Employee labor ($)</label>
                  {hasLaborLogs ? (
                    <>
                      <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 tabular-nums">
                        {(laborCentsFromLogs / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                      </div>
                      <p className="mt-0.5 text-xs text-emerald-600">Calculated from work logs (Rate/hr × hours)</p>
                    </>
                  ) : (
                    <>
                      <input id="fin-act-lab" type="number" min={0} step={0.01} className={inputCls} value={actLab} onChange={(e) => setActLab(e.target.value)} placeholder="0.00" />
                      <p className="mt-0.5 text-xs text-gray-400">Manual fallback — no work logs yet</p>
                    </>
                  )}
                </div>
                {contractorCostCents > 0 && (
                  <div>
                    <label className={labelCls}>Contractor costs ($)</label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-700 tabular-nums">
                      {(contractorCostCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">From contractor assignments</p>
                  </div>
                )}
                {contractorCostCents > 0 && (
                  <div>
                    <label className={labelCls}>Total labor ($)</label>
                    <div className="mt-1 rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 tabular-nums">
                      {(((hasLaborLogs ? laborCentsFromLogs : (Number(actLab) || 0) * 100) + contractorCostCents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">Employee + contractors</p>
                  </div>
                )}
                <div>
                  <label className={labelCls} htmlFor="fin-act-mat">Material ($)</label>
                  <input id="fin-act-mat" type="number" min={0} step={0.01} className={inputCls} value={actMat} onChange={(e) => setActMat(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>Hours</label>
                  {hasLaborLogs ? (
                    <>
                      <div className="mt-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 tabular-nums">
                        {hoursFromLogs.toFixed(2)}
                      </div>
                      <p className="mt-0.5 text-xs text-emerald-600">Calculated from work logs</p>
                    </>
                  ) : (
                    <>
                      <input id="fin-act-hrs" type="number" min={0} step={0.5} className={inputCls} value={actHrs} onChange={(e) => setActHrs(e.target.value)} placeholder="0" />
                      <p className="mt-0.5 text-xs text-gray-400">Manual fallback — no work logs yet</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
        <button type="submit" disabled={loading} className="rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50">
          {loading ? "Saving…" : "Save"}
        </button>
      </form>
    </>
  );
}
