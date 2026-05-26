"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const inputCls =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const labelCls = "block text-xs font-medium text-gray-600";

type Props = {
  projectId: string;
  percentDone: number;
  estMaterialCents: number | null;
  estTravelCents: number | null;
  estLaborCents: number | null;
  actualLaborCents: number | null;
  actualMaterialCents: number | null;
  estHours: number | null;
  actualHours: number | null;
};

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

export function ProjectFinancialsEditor({
  projectId,
  percentDone,
  estMaterialCents,
  estTravelCents,
  estLaborCents,
  actualLaborCents,
  actualMaterialCents,
  estHours,
  actualHours,
}: Props) {
  const router = useRouter();
  const [pctDone, setPctDone] = useState(percentDone === 0 ? "" : String(percentDone));
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
          percentDone: pctDone === "" ? 0 : Number(pctDone),
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
      if (!res.ok) {
        setError(data.error || "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Financials &amp; Hours</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="fin-pct-done">
            % Done
          </label>
          <input
            id="fin-pct-done"
            type="number"
            min={0}
            max={100}
            step={1}
            className={inputCls}
            value={pctDone}
            onChange={(e) => setPctDone(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-est-mat">
            Est. material ($)
          </label>
          <input
            id="fin-est-mat"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={estMat}
            onChange={(e) => setEstMat(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-est-travel">
            Est. travel ($)
          </label>
          <input
            id="fin-est-travel"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={estTravel}
            onChange={(e) => setEstTravel(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-est-lab">
            Est. labor ($)
          </label>
          <input
            id="fin-est-lab"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={estLab}
            onChange={(e) => setEstLab(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-act-lab">
            Actual labor ($)
          </label>
          <input
            id="fin-act-lab"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={actLab}
            onChange={(e) => setActLab(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-act-mat">
            Actual material ($)
          </label>
          <input
            id="fin-act-mat"
            type="number"
            min={0}
            step={0.01}
            className={inputCls}
            value={actMat}
            onChange={(e) => setActMat(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-est-hrs">
            Est. hours
          </label>
          <input
            id="fin-est-hrs"
            type="number"
            min={0}
            step={0.5}
            className={inputCls}
            value={estHrs}
            onChange={(e) => setEstHrs(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="fin-act-hrs">
            Actual hours
          </label>
          <input
            id="fin-act-hrs"
            type="number"
            min={0}
            step={0.5}
            className={inputCls}
            value={actHrs}
            onChange={(e) => setActHrs(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-md bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-50"
      >
        {loading ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
