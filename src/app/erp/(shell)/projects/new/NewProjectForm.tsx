"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";
import { getTurnoverPricingPackage } from "@/lib/turnoverPricingPackages";

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

const TOUCH_UP_PAINT_CENTS = 12500;
const ADDITIONAL_MATERIALS_CENTS = 8500;
const CARPET_WITH_CLEAN_CENTS = 8000;
const CARPET_STANDALONE_CENTS = 12500;
const UNIT_FEATURE_OPTIONS = [
  { value: "studio", label: "Studio", bedrooms: 0, bathrooms: 1 },
  { value: "1/1", label: "1/1", bedrooms: 1, bathrooms: 1 },
  { value: "2/1", label: "2/1", bedrooms: 2, bathrooms: 1 },
  { value: "2/2", label: "2/2", bedrooms: 2, bathrooms: 2 },
  { value: "3/2", label: "3/2", bedrooms: 3, bathrooms: 2 },
  { value: "3/1", label: "3/1", bedrooms: 3, bathrooms: 1 },
] as const;
const UNIT_QUALITY_OPTIONS = [
  "Vacant",
  "Occupied",
  "Light wear",
  "Heavy dust",
  "Needs trash-out",
  "Needs maintenance",
] as const;
const BUILDING_ADDRESS_OPTIONS = [
  "751 Vandenburg Rd, King of Prussia, PA 19406 (Park Square)",
  "580 S Goddard Blvd, King of Prussia, PA 19406 (The Smith)",
  "140 Valley Green Ln, King of Prussia, PA 19406 (The George)",
  "3000 Emily Lane Bulrington NJ 08016 (J Centra Burlington)",
  "3029 W Glenwood Ave (Equinox)",
  "200 University Dr, Schuylkill Haven, PA, 17972 (Nittany Apartments)",
  "456 N. 5th Street, Philadelphia, PA 19123 (The Block at SONO)",
  "2630 W Girard Ave, Philadelphia PA 19130 (The Gio Apartments)",
] as const;
const ADD_NEW_BUILDING_VALUE = "__add_new_building__";
const ADD_NEW_ADDRESS_VALUE = "__add_new_address__";

type UnitFeatureValue = (typeof UNIT_FEATURE_OPTIONS)[number]["value"];
type UnitScope = {
  id: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  paintDate: string;
  cleanDate: string;
  moveOutDate: string;
  features: UnitFeatureValue;
  unitQuality: string;
  fullPaint: boolean;
  touchUpPaint: boolean;
  lightWallTouchUps: boolean;
  materialsAdditional: boolean;
  fullClean: boolean;
  carpetCleaning: boolean;
};

function createUnitScope(id = `${Date.now()}-${Math.random().toString(36).slice(2)}`): UnitScope {
  return {
    id,
    unitNumber: "",
    startDate: "",
    endDate: "",
    paintDate: "",
    cleanDate: "",
    moveOutDate: "",
    features: "1/1",
    unitQuality: "",
    fullPaint: false,
    touchUpPaint: false,
    lightWallTouchUps: false,
    materialsAdditional: false,
    fullClean: false,
    carpetCleaning: false,
  };
}

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

function getUnitFeature(value: UnitFeatureValue) {
  return UNIT_FEATURE_OPTIONS.find((option) => option.value === value) ?? UNIT_FEATURE_OPTIONS[0];
}

function unitScopeSummary(unit: UnitScope) {
  const feature = getUnitFeature(unit.features);
  const dateRange =
    unit.startDate || unit.endDate
      ? `, dates: ${unit.startDate || "TBD"} to ${unit.endDate || "TBD"}`
      : "";
  const scheduledDates = [
    unit.moveOutDate ? `move-out: ${unit.moveOutDate}` : null,
    unit.paintDate ? `paint: ${unit.paintDate}` : null,
    unit.cleanDate ? `clean: ${unit.cleanDate}` : null,
  ].filter(Boolean);
  const services = [
    unit.fullClean ? "full clean" : null,
    unit.fullPaint ? "full paint" : null,
    unit.touchUpPaint ? "touch-up paint" : null,
    unit.lightWallTouchUps ? "light wall touch-ups" : null,
    unit.materialsAdditional ? "additional materials" : null,
    unit.carpetCleaning ? "carpet cleaning" : null,
  ].filter(Boolean);

  return `${unit.unitNumber || "Unit"} (${feature.label}${dateRange}${
    scheduledDates.length ? `, ${scheduledDates.join(", ")}` : ""
  })${unit.unitQuality ? ` - ${unit.unitQuality}` : ""}: ${
    services.length ? services.join(", ") : "no scope selected"
  }`;
}

function minDateValue(values: string[]) {
  return values.filter(Boolean).sort()[0] || "";
}

function maxDateValue(values: string[]) {
  const sorted = values.filter(Boolean).sort();
  return sorted[sorted.length - 1] || "";
}

interface BuildingOption {
  id: string;
  name: string;
  address: string;
  pmName?: string | null;
  pmEmail?: string | null;
  pmPhone?: string | null;
}

interface ScheduleBuildingOption {
  id: string;
  jobTitle: string;
  description?: string | null;
  supervisor?: string | null;
}

interface ProjectOption {
  id: string;
  jobTitle: string;
}

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface NewProjectFormProps {
  initialBuildings?: BuildingOption[];
  initialScheduleBuildings?: ScheduleBuildingOption[];
  janitorialPipelineId?: string | null;
  allProjects?: ProjectOption[];
  employees?: EmployeeOption[];
  initialSegment?: string;
  lockedSegment?: boolean;
  allowErpDataFetch?: boolean;
  submitEndpoint?: string;
  successMessage?: string;
  submitLabel?: string;
}

function normalizeBuildingName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractAddressFromScheduleProject(project?: ScheduleBuildingOption | null) {
  if (!project?.description) return "";
  const addressLine = project.description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(building\s+address|property\s+address|address)\s*:/i.test(line));

  if (!addressLine) return "";
  return addressLine.replace(/^(building\s+address|property\s+address|address)\s*:\s*/i, "").trim();
}

const CO_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "VOID"] as const;

function ProjectSearchDropdown({
  projects,
  value,
  onChange,
}: {
  projects: ProjectOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = projects.find((p) => p.id === value);

  const filtered = query.trim()
    ? projects.filter((p) => p.jobTitle.toLowerCase().includes(query.toLowerCase()))
    : projects;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={containerRef} className="relative mt-1">
      <input
        type="text"
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        placeholder={selected ? selected.jobTitle : "Search projects…"}
        value={open ? query : (selected?.jobTitle ?? "")}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No projects found</li>
          ) : (
            filtered.map((p) => (
              <li
                key={p.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(p.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={`cursor-pointer px-3 py-2 hover:bg-pink-50 hover:text-pink-700 ${p.id === value ? "font-medium text-pink-700" : "text-gray-900"}`}
              >
                {p.jobTitle}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function NotifyMultiSelect({
  employees,
  selectedIds,
  onChange,
}: {
  employees: EmployeeOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = employees.filter((e) =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const selected = employees.filter((e) => selectedIds.includes(e.id));

  return (
    <div ref={containerRef} className="relative mt-1">
      <div
        className="min-h-[38px] w-full cursor-text rounded-md border border-gray-300 bg-white px-2 py-1.5 focus-within:border-pink-500 focus-within:ring-1 focus-within:ring-pink-500"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => {
            const name = `${e.firstName} ${e.lastName}`.trim();
            return (
              <span key={e.id} className="flex items-center gap-1 rounded bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-800">
                {name}
                <button
                  type="button"
                  onMouseDown={(ev) => { ev.stopPropagation(); toggle(e.id); }}
                  className="ml-0.5 text-pink-500 hover:text-pink-700"
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            type="text"
            className="min-w-[120px] flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            placeholder={selectedIds.length === 0 ? "Search employees…" : ""}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </div>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No results</li>
          ) : (
            filtered.map((e) => {
              const name = `${e.firstName} ${e.lastName}`.trim();
              const isSelected = selectedIds.includes(e.id);
              return (
                <li
                  key={e.id}
                  onMouseDown={(ev) => { ev.preventDefault(); toggle(e.id); setQuery(""); }}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-pink-50 ${isSelected ? "font-medium text-pink-700" : "text-gray-800"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-pink-500 bg-pink-500 text-white" : "border-gray-300"}`}>
                    {isSelected && (
                      <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{name}</span>
                  {e.email && <span className="ml-auto text-xs text-gray-400">{e.email}</span>}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

function SupervisorSearchDropdown({
  employees,
  value,
  onChange,
}: {
  employees: EmployeeOption[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? employees.filter((e) =>
        `${e.firstName} ${e.lastName}`.toLowerCase().includes(query.toLowerCase())
      )
    : employees;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className={input}
        placeholder={value || "Search by name…"}
        value={open ? query : value}
        onFocus={() => { setQuery(""); setOpen(true); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(""); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setQuery(""); } }}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-gray-400">No employees found</li>
          ) : (
            filtered.map((emp) => (
              <li
                key={emp.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(`${emp.firstName} ${emp.lastName}`.trim());
                  setQuery("");
                  setOpen(false);
                }}
                className="cursor-pointer px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
              >
                {emp.firstName} {emp.lastName}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export function NewProjectForm({
  initialBuildings = [],
  initialScheduleBuildings = [],
  janitorialPipelineId = null,
  allProjects = [],
  employees = [],
  initialSegment = "COMMERCIAL_CLEANING",
  lockedSegment = false,
  allowErpDataFetch = true,
  submitEndpoint = "/api/erp/projects",
  successMessage,
  submitLabel = "Create project",
}: NewProjectFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [segment, setSegment] = useState(initialSegment);

  // Change order state
  const [coProjectId, setCoProjectId] = useState("");
  const [coTitle, setCoTitle] = useState("");
  const [coStatus, setCoStatus] = useState<typeof CO_STATUSES[number]>("DRAFT");
  const [coRequestedBy, setCoRequestedBy] = useState("");
  const [coComments, setCoComments] = useState("");

  const notifiableEmployees = useMemo(() => employees.filter((e) => e.email), [employees]);
  const defaultNotifyIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of notifiableEmployees) {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (name === "david rodriguez" || e.firstName.toLowerCase() === "sergio") ids.push(e.id);
    }
    return ids;
  }, [notifiableEmployees]);
  const [notifyEmployeeIds, setNotifyEmployeeIds] = useState<string[]>(() => defaultNotifyIds);
  const [notifyResult, setNotifyResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [serviceType, setServiceType] = useState("");
  const [customType, setCustomType] = useState("");

  const [jobOptions, setJobOptions] = useState<string[]>([]);
  const [jobTitle, setJobTitle] = useState("");
  const [customJobTitle, setCustomJobTitle] = useState("");
  const [buildings, setBuildings] = useState<BuildingOption[]>(initialBuildings);
  const [scheduleBuildings, setScheduleBuildings] = useState<ScheduleBuildingOption[]>(initialScheduleBuildings);
  const [scheduleBuildingsLoading, setScheduleBuildingsLoading] = useState(initialScheduleBuildings.length === 0);
  const [scheduleBuildingsError, setScheduleBuildingsError] = useState("");
  const [buildingProjectId, setBuildingProjectId] = useState("");
  const [isAddingBuilding, setIsAddingBuilding] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  const requestType = "TURNOVER";
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [supervisorName, setSupervisorName] = useState(() => {
    const david = employees.find(
      (e) => `${e.firstName} ${e.lastName}`.toLowerCase() === "david rodriguez"
    );
    return david ? `${david.firstName} ${david.lastName}` : "";
  });
  const [pmName, setPmName] = useState("");
  const [pmEmail, setPmEmail] = useState("");
  const [pmPhone, setPmPhone] = useState("");
  const [sueepPmName, setSueepPmName] = useState("");
  const [sueepPmEmail, setSueepPmEmail] = useState("");
  const [unitScopes, setUnitScopes] = useState<UnitScope[]>(() => [createUnitScope("unit-1")]);

  const descriptionValue = serviceType === "__other__" ? customType.trim() : serviceType;

  const isTurnover = segment === "JANITORIAL_TURNOVER_REQUESTS";
  const isChangeOrder = segment === "CHANGE_ORDER";

  useEffect(() => {
    if (!allowErpDataFetch) {
      setJobOptions(fallbackJobTitles);
      return;
    }
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
  }, [allowErpDataFetch]);

  useEffect(() => {
    if (!allowErpDataFetch) return;
    let mounted = true;
    fetch("/api/erp/buildings")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setBuildings(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [allowErpDataFetch]);

  useEffect(() => {
    if (!allowErpDataFetch) {
      setScheduleBuildingsLoading(false);
      return;
    }
    let mounted = true;
    setScheduleBuildingsLoading(initialScheduleBuildings.length === 0);
    setScheduleBuildingsError("");
    fetch("/api/erp/projects?category=schedule-janitorial")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setScheduleBuildings(data);
      })
      .catch(() => {
        if (mounted) setScheduleBuildingsError("Could not load janitorial schedule buildings.");
      })
      .finally(() => {
        if (mounted) setScheduleBuildingsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [allowErpDataFetch, initialScheduleBuildings.length]);

  const isCustomJob = jobTitle === "__custom__";
  const finalJobTitle = isCustomJob ? customJobTitle.trim() : jobTitle;

  const unitCount = Math.max(1, unitScopes.length);
  const firstUnitFeature = getUnitFeature(unitScopes[0]?.features ?? "1/1");
  const normalizedBeds = normalizeBeds(firstUnitFeature.bedrooms);
  const normalizedBathrooms = firstUnitFeature.bathrooms;
  const addressOptions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...BUILDING_ADDRESS_OPTIONS,
          ...buildings.map((building) => building.address),
          ...scheduleBuildings.map((building) => extractAddressFromScheduleProject(building)),
          buildingAddress,
        ]
          .map((address) => address.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [buildings, scheduleBuildings, buildingAddress]);

  function updateUnitScope(id: string, patch: Partial<UnitScope>) {
    setUnitScopes((prev) =>
      prev.map((unit) => {
        if (unit.id !== id) return unit;
        const next = { ...unit, ...patch };
        if (patch.fullPaint) next.touchUpPaint = false;
        if (patch.touchUpPaint) next.fullPaint = false;
        if (unit.fullPaint && patch.touchUpPaint) next.touchUpPaint = false;
        if (unit.touchUpPaint && patch.fullPaint) next.fullPaint = false;
        return next;
      })
    );
  }

  function addUnitScope() {
    setUnitScopes((prev) => [...prev, createUnitScope()]);
  }

  function removeUnitScope(id: string) {
    setUnitScopes((prev) => (prev.length <= 1 ? prev : prev.filter((unit) => unit.id !== id)));
  }

  function applySelectedScheduleBuilding(id: string, fallback?: Partial<ScheduleBuildingOption> & { address?: string }) {
    if (id === ADD_NEW_BUILDING_VALUE) {
      setIsAddingBuilding(true);
      setBuildingProjectId(id);
      setBuildingName("");
      setBuildingAddress("");
      setIsAddingAddress(true);
      setPmName("");
      setPmEmail("");
      setPmPhone("");
      return;
    }

    const scheduleBuilding = scheduleBuildings.find((option) => option.id === id);
    const scheduleName = scheduleBuilding?.jobTitle || fallback?.jobTitle || "";
    const matchedBuilding = buildings.find((building) => normalizeBuildingName(building.name) === normalizeBuildingName(scheduleName));
    const extractedAddress = extractAddressFromScheduleProject(scheduleBuilding || null);

    setIsAddingBuilding(false);
    setIsAddingAddress(false);
    setBuildingProjectId(id);
    setBuildingName(scheduleName);
    setBuildingAddress(extractedAddress || matchedBuilding?.address || fallback?.address || "");
    setPmName("");
    setPmEmail(matchedBuilding?.pmEmail || "");
    setPmPhone(matchedBuilding?.pmPhone || "");
  }

  const packagePricing = useMemo(() => {
    let totalPrice = 0;
    const breakdown: string[] = [];
    const pricingPackage = getTurnoverPricingPackage(buildingName);

    unitScopes.forEach((unit, index) => {
      const feature = getUnitFeature(unit.features);
      const beds = normalizeBeds(feature.bedrooms);
      const baseCleaning = pricingPackage.cleaningRates[beds] * 100;
      const basePainting = pricingPackage.paintingRates[beds] * 100;
      const unitLines: string[] = [];
      let unitTotal = 0;

      if (unit.fullClean) {
        unitTotal += baseCleaning;
        unitLines.push(`cleaning ${formatUsd(baseCleaning)}`);
      }

      if (unit.fullPaint) {
        unitTotal += basePainting;
        unitLines.push(`painting ${formatUsd(basePainting)}`);
      } else if (unit.touchUpPaint) {
        unitTotal += TOUCH_UP_PAINT_CENTS;
        unitLines.push(`touch-up paint ${formatUsd(TOUCH_UP_PAINT_CENTS)}`);
      }

      if (unit.materialsAdditional) {
        unitTotal += ADDITIONAL_MATERIALS_CENTS;
        unitLines.push(`additional materials ${formatUsd(ADDITIONAL_MATERIALS_CENTS)}`);
      }

      if (unit.carpetCleaning) {
        const carpetPrice = unit.fullClean ? CARPET_WITH_CLEAN_CENTS : CARPET_STANDALONE_CENTS;
        unitTotal += carpetPrice;
        unitLines.push(`carpet cleaning ${formatUsd(carpetPrice)}`);
      }

      if (unit.lightWallTouchUps) {
        unitLines.push("light wall touch-ups not priced");
      }

      totalPrice += unitTotal;
      if (unitLines.length > 0) {
        breakdown.push(
          `${unit.unitNumber || `Unit ${index + 1}`} (${feature.label}): ${unitLines.join(" + ")} = ${formatUsd(unitTotal)}`
        );
      }
    });

    if (breakdown.length === 0) {
      breakdown.push("No priceable work selected yet.");
    }

    return {
      packageLabel: totalPrice > 0 ? "Per-unit estimate" : "No priced package selected",
      totalPriceLabel: formatUsd(totalPrice),
      totalPrice,
      breakdown,
      unitCount,
    };
  }, [buildingName, unitScopes, unitCount]);

  async function onSubmitChangeOrder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setNotifyResult(null);
    if (!coProjectId) { setError("Please select a project."); return; }
    if (!coTitle.trim()) { setError("Title is required."); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/erp/projects/${coProjectId}/change-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: coTitle.trim(),
          status: coStatus,
          requestedBy: coRequestedBy.trim() || undefined,
          description: coComments.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) { setError(data.error || "Failed to create change order"); setLoading(false); return; }

      if (data.id && notifyEmployeeIds.length > 0) {
        try {
          await fetch(`/api/erp/projects/${coProjectId}/change-orders/${data.id}/notify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ employeeIds: notifyEmployeeIds }),
          });
        } catch {
          // Non-fatal — proceed to redirect
        }
      }

      router.push(`/erp/projects/${coProjectId}`);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const unitDetails = unitScopes.map(unitScopeSummary);
    const selectedBuilding = scheduleBuildings.find((building) => building.id === buildingProjectId);
    const turnoverUnitLabel = unitScopes
      .map((unit, index) => unit.unitNumber.trim() || `Unit ${index + 1}`)
      .join(", ");
    const generatedTurnoverTitle = `${buildingName.trim() || selectedBuilding?.jobTitle || "Janitorial turnover"}${
      turnoverUnitLabel ? ` - ${turnoverUnitLabel}` : ""
    }`;
    const turnoverScheduleDates = unitScopes.flatMap((unit) => [
      unit.startDate,
      unit.endDate,
      unit.moveOutDate,
      unit.paintDate,
      unit.cleanDate,
    ]);
    const turnoverStartDate = minDateValue(turnoverScheduleDates);
    const turnoverEndDate = maxDateValue(turnoverScheduleDates);
    const turnoverComments = String(fd.get("turnoverComments") || "").trim();
    const turnoverDescription = [
      isTurnover ? null : descriptionValue,
      isTurnover ? `Property: ${buildingName.trim() || selectedBuilding?.jobTitle || "Unspecified"}` : null,
      isTurnover && buildingAddress.trim() ? `Address: ${buildingAddress.trim()}` : null,
      isTurnover && pmName.trim() ? `Property Manager/Maintenance Manager: ${pmName.trim()}` : null,
      isTurnover && pmEmail.trim() ? `Manager Email: ${pmEmail.trim()}` : null,
      isTurnover && pmPhone.trim() ? `Manager Phone: ${pmPhone.trim()}` : null,
      isTurnover && sueepPmName.trim() ? `SUEEP PM: ${sueepPmName.trim()}` : null,
      isTurnover && sueepPmEmail.trim() ? `SUEEP PM Email: ${sueepPmEmail.trim()}` : null,
      isTurnover && unitDetails.length ? `Units: ${unitDetails.join(" | ")}` : null,
      isTurnover && packagePricing.totalPrice > 0 ? `Estimated Turnover Total: ${packagePricing.totalPriceLabel}` : null,
      isTurnover && packagePricing.breakdown.length ? `Pricing Breakdown: ${packagePricing.breakdown.join(" | ")}` : null,
      isTurnover && turnoverComments ? `Comments: ${turnoverComments}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const payload: Record<string, unknown> = {
      segment,
      jobTitle: isTurnover ? generatedTurnoverTitle : finalJobTitle || fd.get("jobTitle") || undefined,
      supervisor: isTurnover ? pmName.trim() || undefined : supervisorName.trim() || undefined,
      description: turnoverDescription || undefined,
      projectDate: isTurnover ? turnoverStartDate || undefined : fd.get("projectDate") || undefined,
      projectEndDate: isTurnover ? turnoverEndDate || undefined : fd.get("projectEndDate") || undefined,
      ...(isTurnover && janitorialPipelineId ? { hubspotPipelineId: janitorialPipelineId } : {}),
      percentDone: fd.get("percentDone") || undefined,
      percentInvoiced: fd.get("percentInvoiced") || undefined,
      contractValue: fd.get("contractValue") || (isTurnover && packagePricing.totalPrice ? String(packagePricing.totalPrice / 100) : undefined),
      estMaterial: fd.get("estMaterial") || undefined,
      estTravel: fd.get("estTravel") || undefined,
      estLabor: fd.get("estLabor") || undefined,
      actualLabor: fd.get("actualLabor") || undefined,
      actualMaterial: fd.get("actualMaterial") || undefined,
      estHours: fd.get("estHours") || undefined,
      actualHours: fd.get("actualHours") || undefined,
      requestType,
      buildingId: isAddingBuilding ? undefined : buildingProjectId || undefined,
      buildingProjectId: isAddingBuilding ? undefined : buildingProjectId || undefined,
      buildingName: buildingName.trim() || undefined,
      buildingAddress: buildingAddress.trim() || undefined,
      pmName: pmName.trim() || undefined,
      pmEmail: pmEmail.trim() || undefined,
      pmPhone: pmPhone.trim() || undefined,
      sueepPmName: sueepPmName.trim() || undefined,
      sueepPmEmail: sueepPmEmail.trim() || undefined,
      unitNumbers: unitScopes.map((unit, index) => unit.unitNumber.trim() || `Unit ${index + 1}`).join(", ") || undefined,
      unitQuality: unitScopes.map((unit) => unit.unitQuality.trim()).filter(Boolean).join("; ") || undefined,
      moveOutDates: unitScopes.map((unit) => unit.moveOutDate).filter(Boolean).join(", ") || undefined,
      paintDates: unitScopes.map((unit) => unit.paintDate).filter(Boolean).join(", ") || undefined,
      cleanDates: unitScopes.map((unit) => unit.cleanDate).filter(Boolean).join(", ") || undefined,
      bedrooms: normalizedBeds || undefined,
      bathrooms: normalizedBathrooms,
      unitScopes,
      fullPaint: unitScopes.some((unit) => unit.fullPaint),
      touchUpPaint: unitScopes.some((unit) => unit.touchUpPaint),
      lightWallTouchUps: unitScopes.some((unit) => unit.lightWallTouchUps),
      materialsAdditional: unitScopes.some((unit) => unit.materialsAdditional),
      fullClean: unitScopes.some((unit) => unit.fullClean),
      carpetCleaning: unitScopes.some((unit) => unit.carpetCleaning),
      supervisorSignOff: isTurnover ? pmName.trim() || undefined : supervisorName.trim() || undefined,
      pricing: {
        packageLabel: packagePricing.packageLabel,
        unitCount: packagePricing.unitCount,
        totalPrice: packagePricing.totalPrice,
      },
    };

    try {
      const res = await fetch(submitEndpoint, {
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
      if (successMessage) {
        setSubmitted(true);
      } else {
        router.push("/erp/projects");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (isChangeOrder) {
    return (
      <form onSubmit={onSubmitChangeOrder} className="w-full space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
        <div>
          <label className={label} htmlFor="co-segment">Segment</label>
          <select id="co-segment" className={input} value={segment} onChange={(e) => setSegment(e.target.value)}>
            {PROJECT_SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Project *</label>
          <ProjectSearchDropdown
            projects={allProjects}
            value={coProjectId}
            onChange={setCoProjectId}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="co-title">Title *</label>
            <input id="co-title" required className={input} value={coTitle} onChange={(e) => setCoTitle(e.target.value)} placeholder="e.g. Add two extra prep coats in lobby" />
          </div>
          <div>
            <label className={label} htmlFor="co-status">Status</label>
            <select id="co-status" className={input} value={coStatus} onChange={(e) => setCoStatus(e.target.value as typeof CO_STATUSES[number])}>
              {CO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="co-requested-by">Requested by</label>
            <input id="co-requested-by" className={input} value={coRequestedBy} onChange={(e) => setCoRequestedBy(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <label className={label} htmlFor="co-comments">Comments</label>
            <textarea id="co-comments" rows={3} className={input} value={coComments} onChange={(e) => setCoComments(e.target.value)} />
          </div>
        </div>

        {notifiableEmployees.length > 0 && (
          <div>
            <label className={label}>Notify employees</label>
            <NotifyMultiSelect
              employees={notifiableEmployees}
              selectedIds={notifyEmployeeIds}
              onChange={(ids) => { setNotifyEmployeeIds(ids); setNotifyResult(null); }}
            />
          </div>
        )}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        {notifyResult && (
          <p className={`text-xs ${notifyResult.ok ? "text-green-600" : "text-red-500"}`} role="status">
            {notifyResult.msg}
          </p>
        )}
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="w-full rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50 sm:w-auto">
            {loading ? "Saving…" : "Create change order"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
      {submitted && successMessage ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
          {successMessage}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {!lockedSegment ? (
          <div className="min-w-0">
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
        ) : null}
        {!isTurnover && (
          <>
            <div className="min-w-0">
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
            <div className="min-w-0">
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
          </>
        )}
      </div>

      {isTurnover ? (
        <div className="space-y-5 rounded-lg border border-pink-200 bg-white p-4 sm:p-5">
          <div className="space-y-2">
            <p className={sectionHeader}>Step 1 - Property and Property Manager/Maintenance Manager Info</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={label} htmlFor="buildingProjectId">
                  Building
                </label>
                <select
                  id="buildingProjectId"
                  name="buildingProjectId"
                  required
                  className={input}
                  value={buildingProjectId}
                  disabled={scheduleBuildingsLoading}
                  onChange={(e) => {
                    const selected = e.currentTarget.selectedOptions[0];
                    applySelectedScheduleBuilding(e.target.value, {
                      jobTitle: selected?.dataset.name,
                      description: selected?.dataset.description,
                      supervisor: selected?.dataset.supervisor,
                      address: selected?.dataset.address,
                    });
                  }}
                >
                  <option value="">{scheduleBuildingsLoading ? "Loading janitorial schedule..." : "Select a scheduled building..."}</option>
                  {!scheduleBuildingsLoading && scheduleBuildings.length === 0 ? (
                    <option value="" disabled>
                      No janitorial schedule buildings found
                    </option>
                  ) : null}
                  {scheduleBuildings.map((building) => {
                    const matchedBuilding = buildings.find(
                      (savedBuilding) => normalizeBuildingName(savedBuilding.name) === normalizeBuildingName(building.jobTitle)
                    );
                    const address = extractAddressFromScheduleProject(building) || matchedBuilding?.address || "";
                    return (
                    <option
                      key={building.id}
                      value={building.id}
                      data-name={building.jobTitle}
                      data-description={building.description || ""}
                      data-supervisor={building.supervisor || ""}
                      data-address={address}
                    >
                      {building.jobTitle}
                    </option>
                    );
                  })}
                  <option value={ADD_NEW_BUILDING_VALUE}>Add new building...</option>
                </select>
                {scheduleBuildingsError ? <p className="mt-1 text-xs text-red-500">{scheduleBuildingsError}</p> : null}
                {isAddingBuilding ? (
                  <div className="mt-2">
                    <label className={label} htmlFor="newBuildingName">
                      New building name
                    </label>
                    <input
                      id="newBuildingName"
                      name="newBuildingName"
                      required
                      className={input}
                      value={buildingName}
                      onChange={(e) => setBuildingName(e.target.value)}
                      placeholder="Type the building name"
                    />
                  </div>
                ) : null}
                <input type="hidden" name="buildingName" value={buildingName} />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="buildingAddress">
                  Building address
                </label>
                <select
                  id="buildingAddress"
                  name="buildingAddress"
                  required
                  className={input}
                  value={isAddingAddress ? ADD_NEW_ADDRESS_VALUE : buildingAddress}
                  onChange={(e) => {
                    if (e.target.value === ADD_NEW_ADDRESS_VALUE) {
                      setIsAddingAddress(true);
                      setBuildingAddress("");
                      return;
                    }
                    setIsAddingAddress(false);
                    setBuildingAddress(e.target.value);
                  }}
                >
                  <option value="">Select an address...</option>
                  {addressOptions.length === 0 ? (
                    <option value="" disabled>
                      No addresses found
                    </option>
                  ) : null}
                  {addressOptions.map((address) => (
                    <option key={address} value={address}>
                      {address}
                    </option>
                  ))}
                  <option value={ADD_NEW_ADDRESS_VALUE}>Add new address...</option>
                </select>
                {isAddingAddress ? (
                  <div className="mt-2">
                    <label className={label} htmlFor="newBuildingAddress">
                      New building address
                    </label>
                    <input
                      id="newBuildingAddress"
                      name="newBuildingAddress"
                      required
                      className={input}
                      value={buildingAddress}
                      onChange={(e) => setBuildingAddress(e.target.value)}
                      placeholder="Type the building address"
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
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
              <div className="min-w-0">
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
              <div className="min-w-0">
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={sectionHeader}>Step 2 — Units & independent scope</p>
              <button
                type="button"
                onClick={addUnitScope}
                className="w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-xs font-medium text-pink-700 hover:bg-pink-50 sm:w-auto sm:py-1.5"
              >
                Add unit
              </button>
            </div>
            <div className="space-y-3">
              {unitScopes.map((unit, index) => (
                <div key={unit.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_140px_140px_120px_1.5fr_auto]">
                    <div className="min-w-0">
                      <label className={label} htmlFor={`unit-${unit.id}`}>
                        Unit number
                      </label>
                      <input
                        id={`unit-${unit.id}`}
                        className={input}
                        value={unit.unitNumber}
                        onChange={(e) => updateUnitScope(unit.id, { unitNumber: e.target.value })}
                        placeholder={`Unit ${index + 1}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`start-date-${unit.id}`}>
                        Start date
                      </label>
                      <input
                        id={`start-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.startDate}
                        onChange={(e) => updateUnitScope(unit.id, { startDate: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`end-date-${unit.id}`}>
                        End date
                      </label>
                      <input
                        id={`end-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.endDate}
                        onChange={(e) => updateUnitScope(unit.id, { endDate: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`features-${unit.id}`}>
                        Features
                      </label>
                      <select
                        id={`features-${unit.id}`}
                        className={input}
                        value={unit.features}
                        onChange={(e) => updateUnitScope(unit.id, { features: e.target.value as UnitFeatureValue })}
                      >
                        {UNIT_FEATURE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 md:col-span-2 xl:col-span-1">
                      <label className={label} htmlFor={`quality-${unit.id}`}>
                        Unit quality
                      </label>
                      <select
                        id={`quality-${unit.id}`}
                        className={input}
                        value={unit.unitQuality}
                        onChange={(e) => updateUnitScope(unit.id, { unitQuality: e.target.value })}
                      >
                        <option value="">Select quality...</option>
                        {UNIT_QUALITY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end md:col-span-2 xl:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeUnitScope(unit.id)}
                        disabled={unitScopes.length <= 1}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:border-pink-300 disabled:opacity-40 xl:w-auto"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="min-w-0">
                      <label className={label} htmlFor={`move-out-date-${unit.id}`}>
                        Move-out day (optional)
                      </label>
                      <input
                        id={`move-out-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.moveOutDate}
                        onChange={(e) => updateUnitScope(unit.id, { moveOutDate: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`paint-date-${unit.id}`}>
                        Paint date
                      </label>
                      <input
                        id={`paint-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.paintDate}
                        onChange={(e) => updateUnitScope(unit.id, { paintDate: e.target.value })}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`clean-date-${unit.id}`}>
                        Clean date
                      </label>
                      <input
                        id={`clean-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.cleanDate}
                        onChange={(e) => updateUnitScope(unit.id, { cleanDate: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[
                      { key: "fullClean", text: "Full clean" },
                      { key: "fullPaint", text: "Full paint", disabled: unit.touchUpPaint },
                      { key: "touchUpPaint", text: "Touch-up paint", disabled: unit.fullPaint },
                      { key: "materialsAdditional", text: "Additional materials" },
                      { key: "carpetCleaning", text: "Carpet cleaning" },
                    ].map(({ key, text, disabled }) => (
                      <label key={key} className={`flex min-w-0 items-center rounded-md border border-gray-200 bg-white px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(unit[key as keyof UnitScope])}
                          disabled={disabled}
                          onChange={(e) => updateUnitScope(unit.id, { [key]: e.target.checked } as Partial<UnitScope>)}
                          className="h-4 w-4 text-pink-600"
                        />
                        <span className={`${checkboxLabel} break-words`}>{text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Step 3 — Estimated total</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={label} htmlFor="sueepPmName">
                  SUEEP PM name
                </label>
                <input
                  id="sueepPmName"
                  name="sueepPmName"
                  required
                  className={input}
                  value={sueepPmName}
                  onChange={(e) => setSueepPmName(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <label className={label} htmlFor="sueepPmEmail">
                  SUEEP PM email
                </label>
                <input
                  id="sueepPmEmail"
                  name="sueepPmEmail"
                  type="email"
                  required
                  className={input}
                  value={sueepPmEmail}
                  onChange={(e) => setSueepPmEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
              <p className="text-sm text-gray-700">Estimated total: <span className="font-semibold text-gray-900 text-lg">{packagePricing.totalPriceLabel}</span></p>
              <div className="mt-3 border-t border-gray-200 pt-3">
                <p className="text-xs font-semibold uppercase text-gray-500">Price details</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {packagePricing.breakdown.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className={sectionHeader}>Comments</p>
            <div>
              <label className={label} htmlFor="turnoverComments">
                Additional comments
              </label>
              <textarea
                id="turnoverComments"
                name="turnoverComments"
                rows={3}
                className={input}
                placeholder="Access notes, special instructions, timing details, or anything the PM should know"
              />
            </div>
          </div>

        </div>
      ) : null}

      {!isTurnover ? (
        <>
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
            <label className={label}>Supervisor / PM</label>
            <SupervisorSearchDropdown
              employees={employees}
              value={supervisorName}
              onChange={setSupervisorName}
            />
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
              <div className="min-w-0">
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
        </>
      ) : null}

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50 sm:w-auto"
        >
          {loading ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
