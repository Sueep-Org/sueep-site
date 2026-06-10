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
}: Props) {
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
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-6">

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
                <label className={labelCls} htmlFor="fin-act-lab">Employee labor ($)</label>
                <input id="fin-act-lab" type="number" min={0} step={0.01} className={inputCls} value={actLab} onChange={(e) => setActLab(e.target.value)} placeholder="0.00" />
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
                    {(((Number(actLab) || 0) * 100 + contractorCostCents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">Employee + contractors</p>
                </div>
              )}
              <div>
                <label className={labelCls} htmlFor="fin-act-mat">Material ($)</label>
                <input id="fin-act-mat" type="number" min={0} step={0.01} className={inputCls} value={actMat} onChange={(e) => setActMat(e.target.value)} placeholder="0.00" />
              </div>
              <div className="invisible">
                <label className={labelCls}>Travel ($)</label>
                <input type="number" className={inputCls} disabled tabIndex={-1} />
              </div>
              <div>
                <label className={labelCls} htmlFor="fin-act-hrs">Hours</label>
                <input id="fin-act-hrs" type="number" min={0} step={0.5} className={inputCls} value={actHrs} onChange={(e) => setActHrs(e.target.value)} placeholder="0" />
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
  );
}
