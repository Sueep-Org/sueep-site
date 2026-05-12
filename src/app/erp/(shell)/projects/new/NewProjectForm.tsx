"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-zinc-600";

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      segment: fd.get("segment"),
      jobTitle: fd.get("jobTitle"),
      supervisor: fd.get("supervisor") || undefined,
      description: fd.get("description") || undefined,
      projectDate: fd.get("projectDate") || undefined,
      projectEndDate: fd.get("projectEndDate") || undefined,
      percentDone: fd.get("percentDone") || undefined,
      percentInvoiced: fd.get("percentInvoiced") || undefined,
      contractValue: fd.get("contractValue") || undefined,
      estMaterial: fd.get("estMaterial") || undefined,
      estTravel: fd.get("estTravel") || undefined,
      estLabor: fd.get("estLabor") || undefined,
      actualLabor: fd.get("actualLabor") || undefined,
      actualMaterial: fd.get("actualMaterial") || undefined,
      estHours: fd.get("estHours") || undefined,
      actualHours: fd.get("actualHours") || undefined,
    };

    try {
      const res = await fetch("/api/erp/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create");
        setLoading(false);
        return;
      }
      if (data.id) router.push(`/erp/projects/${data.id}`);
      else router.push("/erp/projects");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="segment">
            Segment
          </label>
          <select id="segment" name="segment" className={input} defaultValue="COMMERCIAL">
            <option value="COMMERCIAL">Commercial</option>
            <option value="RESIDENTIAL">Residential</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="projectDate">
            Start date
          </label>
          <input id="projectDate" name="projectDate" type="date" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="projectEndDate">
            Target end (optional)
          </label>
          <input id="projectEndDate" name="projectEndDate" type="date" className={input} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="jobTitle">
          Job title *
        </label>
        <input id="jobTitle" name="jobTitle" required className={input} placeholder="e.g. Blumberg Homes — 2323 Jefferson" />
      </div>
      <div>
        <label className={label} htmlFor="supervisor">
          Supervisor
        </label>
        <input id="supervisor" name="supervisor" className={input} />
      </div>
      <div>
        <label className={label} htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" rows={2} className={input} placeholder="Final cleaning, painting, CO…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="percentDone">
            % done
          </label>
          <input id="percentDone" name="percentDone" type="number" min={0} max={100} step={1} className={input} placeholder="0" />
        </div>
        <div>
          <label className={label} htmlFor="percentInvoiced">
            % invoiced
          </label>
          <input
            id="percentInvoiced"
            name="percentInvoiced"
            type="number"
            min={0}
            max={100}
            step={1}
            className={input}
            placeholder="0"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Estimates & actuals (USD)</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="contractValue">
              Contract value
            </label>
            <input id="contractValue" name="contractValue" className={input} placeholder="0.00" />
          </div>
          <div>
            <label className={label} htmlFor="estMaterial">
              Est. material
            </label>
            <input id="estMaterial" name="estMaterial" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="estTravel">
              Est. travel
            </label>
            <input id="estTravel" name="estTravel" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="estLabor">
              Est. labor
            </label>
            <input id="estLabor" name="estLabor" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="actualLabor">
              Actual labor
            </label>
            <input id="actualLabor" name="actualLabor" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="actualMaterial">
              Actual material
            </label>
            <input id="actualMaterial" name="actualMaterial" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="estHours">
              Est. hours
            </label>
            <input id="estHours" name="estHours" type="text" className={input} placeholder="e.g. 40" />
          </div>
          <div>
            <label className={label} htmlFor="actualHours">
              Actual hours
            </label>
            <input id="actualHours" name="actualHours" type="text" className={input} />
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Create project"}
        </button>
      </div>
    </form>
  );
}
