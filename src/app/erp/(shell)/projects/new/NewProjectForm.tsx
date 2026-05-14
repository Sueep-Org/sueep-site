"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [serviceType, setServiceType] = useState("");
  const [customType, setCustomType] = useState("");

  // Job Title dropdown state (populated from schedule / existing projects)
  const [jobOptions, setJobOptions] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [customJobTitle, setCustomJobTitle] = useState("");

  const descriptionValue = serviceType === "__other__" ? customType.trim() : serviceType;

  // Load job titles from projects API (proxy for schedule jobs). Fallback to examples if needed.
  useEffect(() => {
    let mounted = true;
    fetch("/api/erp/projects")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;
        const titles = Array.from(
          new Set(
            (Array.isArray(data) ? data : data?.projects || [])
              .map((p: any) => p?.jobTitle || p?.title || p?.name)
              .filter(Boolean)
          )
        ) as string[];
        setJobOptions(titles.length ? titles : fallbackJobTitles);
      })
      .catch(() => {
        if (mounted) setJobOptions(fallbackJobTitles);
      });
    return () => { mounted = false; };
  }, []);

  const fallbackJobTitles = [
    "Blumberg Homes — 2323 Jefferson",
    "Acme Tower — Lobby Refresh",
    "Parkview Apartments Turnover Q2",
    "Riverside Office Park — Common Areas",
    "Harborview Condos — Unit Turns",
  ];

  const isCustomJob = jobTitle === "__custom__";
  const finalJobTitle = isCustomJob ? customJobTitle.trim() : jobTitle;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      segment: fd.get("segment"),
      jobTitle: finalJobTitle || fd.get("jobTitle") || undefined,
      supervisor: fd.get("supervisor") || undefined,
      description: descriptionValue || undefined,
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
          <select id="segment" name="segment" className={input} defaultValue="COMMERCIAL_CLEANING">
            {PROJECT_SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
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

      {/* Job Title dropdown — populated from schedule / existing projects */}
      <div>
        <label className={label} htmlFor="jobTitle">
          Job title *
        </label>
        <select
          id="jobTitle"
          name="jobTitle"
          required={!isCustomJob}
          className={input}
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        >
          <option value="">— Select from schedule —</option>
          {jobOptions.map((title) => (
            <option key={title} value={title}>
              {title}
            </option>
          ))}
          <option value="__custom__">Other / Enter custom job title…</option>
        </select>
        {isCustomJob && (
          <div className="mt-2">
            <label className={label} htmlFor="customJobTitle">
              Custom job title
            </label>
            <input
              id="customJobTitle"
              name="customJobTitle"
              required
              className={input}
              value={customJobTitle}
              onChange={(e) => setCustomJobTitle(e.target.value)}
              placeholder="e.g. Special Event Setup — Main Hall"
            />
          </div>
        )}
        <p className="mt-1 text-[10px] text-gray-500">Pulled from scheduled jobs. Add more via Schedule module.</p>
      </div>

      <div>
        <label className={label} htmlFor="supervisor">
          Supervisor / PM *
        </label>
        <input id="supervisor" name="supervisor" required className={input} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="serviceType">
            Work type
          </label>
          <select
            id="serviceType"
            className={input}
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
          >
            <option value="">— Select —</option>
            {SERVICE_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
            </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        {serviceType === "__other__" && (
          <div>
            <label className={label} htmlFor="customType">
              Custom work type
            </label>
            <input
              id="customType"
              type="text"
              className={input}
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="Describe the work"
            />
          </div>
        )}
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estimates & actuals (USD)</p>
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
        <p className="text-sm text-red-400" role="alert">
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
