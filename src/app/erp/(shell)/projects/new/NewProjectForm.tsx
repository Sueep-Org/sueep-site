"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";

const input =
  "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500";
const label = "block text-xs font-medium text-gray-600";

const fallbackJobTitles = [
  "Blumberg Homes — 2323 Jefferson",
  "Acme Tower — Lobby Refresh",
  "Parkview Apartments Turnover Q2",
  "Riverside Office Park — Common Areas",
  "Harborview Condos — Unit Turns",
];
const checkboxLabel = "ml-2 text-sm text-gray-700";
const sectionHeader = "text-sm font-semibold text-gray-900";

const CLEANING_RATES = { 1: 185, 2: 255, 3: 385 } as const;
const PAINTING_RATES = { 1: 340, 2: 400, 3: 450 } as const;

function normalizeBeds(value?: number | null): 1 | 2 | 3 {
  const beds = Number(value ?? 1);
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

function parseUnitNumbers(raw: string) {
  return raw
    .split(/[,\n;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
}

export function NewProjectForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [segment, setSegment] = useState("COMMERCIAL_CLEANING");
  const [serviceType, setServiceType] = useState("");
  const [customType, setCustomType] = useState("");

  const [jobOptions, setJobOptions] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [customJobTitle, setCustomJobTitle] = useState("");

  const [requestType, setRequestType] = useState<"TURNOVER" | "REGULAR">("TURNOVER");
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [pmName, setPmName] = useState("");
  const [pmEmail, setPmEmail] = useState("");
  const [pmPhone, setPmPhone] = useState("");
  const [unitNumbers, setUnitNumbers] = useState("");
  const [unitQuality, setUnitQuality] = useState("");
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState<number | "">("");

  const [fullPaint, setFullPaint] = useState(false);
  const [touchUpPaint, setTouchUpPaint] = useState(false);
  const [lightWallTouchUps, setLightWallTouchUps] = useState(false);
  const [materialsAdditional, setMaterialsAdditional] = useState(false);
  const [fullClean, setFullClean] = useState(false);
  const [carpetCleaning, setCarpetCleaning] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [laborerId, setLaborerId] = useState("");
  const [salesNotes, setSalesNotes] = useState("");
  const [laborPool, setLaborPool] = useState<EmployeeOption[]>([]);

  const descriptionValue = serviceType === "__other__" ? customType.trim() : serviceType;

  const isTurnover = segment === "JANITORIAL_TURNOVER_REQUESTS";

  useEffect(() => {
    let mounted = true;
    fetch("/api/erp/projects")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;

        type ProjectLike = { jobTitle?: string; title?: string; name?: string };

        const list: ProjectLike[] = Array.isArray(data) ? data : (data?.projects || []);
        const titles = Array.from(
          new Set(
            list
              .map((p) => p?.jobTitle || p?.title || p?.name)
              .filter((t): t is string => Boolean(t))
          )
        );
        setJobOptions(titles.length ? titles : fallbackJobTitles);
      })
      .catch(() => {
        if (mounted) setJobOptions(fallbackJobTitles);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch("/api/erp/employees")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) {
          setLaborPool(data.slice(0, 100));
        }
      })
      .catch(() => {
        if (!mounted) setLaborPool([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isCustomJob = jobTitle === "__custom__";
  const finalJobTitle = isCustomJob ? customJobTitle.trim() : jobTitle;

  const selectedUnits = useMemo(() => parseUnitNumbers(unitNumbers), [unitNumbers]);
  const unitCount = Math.max(1, selectedUnits.length);
  const normalizedBeds = normalizeBeds(bedrooms ?? 1);

  const packagePricing = useMemo(() => {
    const baseCleaning = CLEANING_RATES[normalizedBeds] * 100;
    const basePainting = PAINTING_RATES[normalizedBeds] * 100;
    let packageLabel = "No package selected";
    let basePerUnit = 0;

    if (fullClean && fullPaint) {
      packageLabel = "Cleaning + painting";
      basePerUnit = baseCleaning + basePainting;
    } else if (fullPaint) {
      packageLabel = "Painting only";
      basePerUnit = basePainting;
    } else if (fullClean) {
      packageLabel = "Cleaning only";
      basePerUnit = baseCleaning;
    } else if (touchUpPaint) {
      packageLabel = "Touch-up paint";
      basePerUnit = 0;
    }

    let totalPrice = basePerUnit * unitCount;
    const breakdown: string[] = [];

    if (packageLabel !== "No package selected") {
      breakdown.push(`${packageLabel} (${normalizedBeds}-bed) × ${unitCount} unit${unitCount === 1 ? "" : "s"}`);
    }

    const touchUpTotal = touchUpPaint ? 12500 * unitCount : 0;
    if (touchUpPaint) {
      totalPrice += touchUpTotal;
      breakdown.push(`Touch-up paint ${unitCount > 1 ? `× ${unitCount}` : ""}: ${formatUsd(touchUpTotal)}`);
    }

    if (materialsAdditional) {
      totalPrice += 8500;
      breakdown.push("Additional materials: $85");
    }

    if (carpetCleaning) {
      const carpetPrice = fullClean ? 8000 : 12500;
      totalPrice += carpetPrice;
      breakdown.push(`Carpet cleaning: ${formatUsd(carpetPrice)}`);
    }

    if (breakdown.length === 0) {
      breakdown.push("No priceable work selected yet.");
    }

    return {
      packageLabel,
      perUnitLabel: formatUsd(basePerUnit),
      totalPriceLabel: formatUsd(totalPrice),
      totalPrice,
      breakdown,
      unitCount,
    };
  }, [normalizedBeds, unitCount, fullClean, fullPaint, touchUpPaint, materialsAdditional, carpetCleaning]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const payload = {
      segment,
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
      requestType,
      buildingName: buildingName.trim() || undefined,
      buildingAddress: buildingAddress.trim() || undefined,
      pmName: pmName.trim() || undefined,
      pmEmail: pmEmail.trim() || undefined,
      pmPhone: pmPhone.trim() || undefined,
      unitNumbers: unitNumbers.trim() || undefined,
      unitQuality: unitQuality.trim() || undefined,
      bedrooms: bedrooms || undefined,
      bathrooms: bathrooms === "" ? undefined : bathrooms,
      fullPaint,
      touchUpPaint,
      lightWallTouchUps,
      materialsAdditional,
      fullClean,
      carpetCleaning,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      laborerId: laborerId || undefined,
      supervisorSignOff: fd.get("supervisor") || undefined,
      salesNotes: salesNotes.trim() || undefined,
      pricing: {
        packageLabel: packagePricing.packageLabel,
        unitCount: packagePricing.unitCount,
        totalPrice: packagePricing.totalPrice,
      },
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
          <select
            id="segment"
            name="segment"
            className={input}
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
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
          <input
            id="projectDate"
            name="projectDate"
            type="date"
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="projectEndDate">
            Target end (optional)
          </label>
          <input
            id="projectEndDate"
            name="projectEndDate"
            type="date"
            className={input}
          />
        </div>
      </div>

      {isTurnover ? (
        <div className="space-y-5 rounded-lg border border-pink-200 bg-white p-5">
          <div className="space-y-2">
            <p className={sectionHeader}>Step 1 — Property & PM info</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="buildingName">
                  Building name
                </label>
                <input
                  id="buildingName"
                  name="buildingName"
                  required
                  className={input}
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="buildingAddress">
                  Building address
                </label>
                <input
                  id="buildingAddress"
                  name="buildingAddress"
                  required
                  className={input}
                  value={buildingAddress}
                  onChange={(e) => setBuildingAddress(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={label} htmlFor="pmName">
                  PM name
                </label>
                <input
                  id="pmName"
                  name="pmName"
                  required
                  className={input}
                  value={pmName}
                  onChange={(e) => setPmName(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="pmEmail">
                  PM email
                </label>
                <input
                  id="pmEmail"
                  name="pmEmail"
                  type="email"
                  required
                  className={input}
                  value={pmEmail}
                  onChange={(e) => setPmEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="pmPhone">
                  PM phone
                </label>
                <input
                  id="pmPhone"
                  name="pmPhone"
                  required
                  className={input}
                  value={pmPhone}
                  onChange={(e) => setPmPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Request type</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { value: "TURNOVER", label: "Turnover request" },
                { value: "REGULAR", label: "Regular request" },
              ].map((option) => (
                <label key={option.value} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm hover:border-pink-500">
                  <input
                    type="radio"
                    name="requestType"
                    value={option.value}
                    checked={requestType === option.value}
                    onChange={() => setRequestType(option.value as "TURNOVER" | "REGULAR")}
                    className="mr-2 h-4 w-4 text-pink-600"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Step 2 — Unit details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="unitNumbers">
                  Unit number(s)
                </label>
                <textarea
                  id="unitNumbers"
                  name="unitNumbers"
                  rows={3}
                  className={input}
                  placeholder="Separate units with commas or line breaks"
                  value={unitNumbers}
                  onChange={(e) => setUnitNumbers(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="unitQuality">
                  Quality of units
                </label>
                <input
                  id="unitQuality"
                  name="unitQuality"
                  className={input}
                  value={unitQuality}
                  onChange={(e) => setUnitQuality(e.target.value)}
                  placeholder="e.g. Vacant, light wear, heavy dust"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="bedrooms">
                  Bedrooms
                </label>
                <input
                  id="bedrooms"
                  name="bedrooms"
                  type="number"
                  min={1}
                  max={10}
                  className={input}
                  value={bedrooms}
                  onChange={(e) => setBedrooms(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <label className={label} htmlFor="bathrooms">
                  Bathrooms
                </label>
                <input
                  id="bathrooms"
                  name="bathrooms"
                  type="number"
                  min={0}
                  max={10}
                  className={input}
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Step 3 — Scope of work</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Paint</p>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={fullPaint} onChange={(e) => setFullPaint(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Full paint</span>
                </label>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={touchUpPaint} onChange={(e) => setTouchUpPaint(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Touch-up paint</span>
                </label>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Materials</p>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={lightWallTouchUps} onChange={(e) => setLightWallTouchUps(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Light wall touch-ups</span>
                </label>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={materialsAdditional} onChange={(e) => setMaterialsAdditional(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Additional materials</span>
                </label>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Cleaning</p>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={fullClean} onChange={(e) => setFullClean(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Full clean</span>
                </label>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm font-semibold text-gray-900">Add-ons</p>
                <label className="flex items-center mt-3">
                  <input type="checkbox" checked={carpetCleaning} onChange={(e) => setCarpetCleaning(e.target.checked)} className="h-4 w-4 text-pink-600" />
                  <span className={checkboxLabel}>Carpet cleaning (Add-on)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Step 4 — Pricing package</p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2">Package</th>
                    <th className="px-3 py-2">1 Bed</th>
                    <th className="px-3 py-2">2 Bed</th>
                    <th className="px-3 py-2">3 Bed/TH</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className={packagePricing.packageLabel === "Cleaning only" ? "bg-pink-50" : "bg-white"}>
                    <td className="px-3 py-2">Cleaning Only</td>
                    <td className="px-3 py-2">$185</td>
                    <td className="px-3 py-2">$255</td>
                    <td className="px-3 py-2">$385</td>
                  </tr>
                  <tr className={packagePricing.packageLabel === "Painting only" ? "bg-pink-50" : "bg-white"}>
                    <td className="px-3 py-2">Painting Only</td>
                    <td className="px-3 py-2">$340</td>
                    <td className="px-3 py-2">$400</td>
                    <td className="px-3 py-2">$450</td>
                  </tr>
                  <tr className={packagePricing.packageLabel === "Cleaning + painting" ? "bg-pink-50" : "bg-white"}>
                    <td className="px-3 py-2">Cleaning + Painting</td>
                    <td className="px-3 py-2">$525</td>
                    <td className="px-3 py-2">$655</td>
                    <td className="px-3 py-2">$835</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm text-gray-700">Selected package: <span className="font-semibold text-gray-900">{packagePricing.packageLabel}</span></p>
              <p className="text-sm text-gray-700">Bedrooms: <span className="font-semibold text-gray-900">{normalizedBeds}</span></p>
              <p className="text-sm text-gray-700">Units: <span className="font-semibold text-gray-900">{unitCount}</span></p>
              <p className="text-sm text-gray-700">Estimated total: <span className="font-semibold text-gray-900">{packagePricing.totalPriceLabel}</span></p>
              <div className="mt-3 space-y-1 text-xs text-gray-500">
                {packagePricing.breakdown.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Step 5 — Scheduling & assignment</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="startDate">
                  Start date
                </label>
                <input
                  id="startDate"
                  name="startDate"
                  type="date"
                  required
                  className={input}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="endDate">
                  End date
                </label>
                <input
                  id="endDate"
                  name="endDate"
                  type="date"
                  required
                  className={input}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="laborerId">
                  Assign laborer
                </label>
                <select
                  id="laborerId"
                  name="laborerId"
                  className={input}
                  value={laborerId}
                  onChange={(e) => setLaborerId(e.target.value)}
                >
                  <option value="">— Select laborer —</option>
                  {laborPool.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.firstName} {employee.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="salesNotes">
                  Sales / PM notes
                </label>
                <textarea
                  id="salesNotes"
                  name="salesNotes"
                  rows={3}
                  className={input}
                  value={salesNotes}
                  onChange={(e) => setSalesNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
        {isCustomJob ? (
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
        ) : null}
        <p className="mt-1 text-[10px] text-gray-500">Pulled from scheduled jobs. Add more via Schedule module.</p>
      </div>

      <div>
        <label className={label} htmlFor="supervisor">
          Supervisor / PM *
        </label>
        <input id="supervisor" name="supervisor" required={isTurnover} className={input} />
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
        {serviceType === "__other__" ? (
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
        ) : null}
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
