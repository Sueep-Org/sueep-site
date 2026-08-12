"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_SEGMENT_OPTIONS } from "@/lib/erp/projectSegments";

// Real estate is no longer a segment new projects can be created under.
// It's only still selectable on existing real-estate projects' own setup editor.
const CREATABLE_SEGMENT_OPTIONS = PROJECT_SEGMENT_OPTIONS.filter((opt) => opt.value !== "REAL_ESTATE");
import { SERVICE_TYPE_OPTIONS } from "@/lib/erp/serviceTypes";
import { getTurnoverPricingPackage, TURNOVER_UNIT_LAYOUTS } from "@/lib/turnoverPricingPackages";
import { computeTurnoverPricing } from "@/lib/turnoverPricing";
import { parseBuildingNameFromDealName, parseAddressFromDealName } from "@/lib/hubspot/dealNaming";
import { inputClass, labelClass } from "@/app/erp/components/ui";
import { SearchableSelect } from "@/app/erp/components/SearchableSelect";

const input = inputClass.md;
const label = labelClass.default;

const fallbackJobTitles = [
  "Blumberg Homes — 2323 Jefferson",
  "Acme Tower — Lobby Refresh",
  "Parkview Apartments Turnover Q2",
  "Riverside Office Park — Common Areas",
  "Harborview Condos — Unit Turns",
];
const checkboxLabel = "ml-2 text-sm text-gray-700";
const sectionHeader = "text-sm font-semibold text-gray-900";

const BEDROOM_OPTIONS = ["Studio", "1", "2", "3", "4+"] as const;
const BATHROOM_OPTIONS = ["1", "2", "3+"] as const;
const PARTIAL_TURN_LAYOUT_OPTIONS = TURNOVER_UNIT_LAYOUTS.filter((l) => l !== "common-area");
const PARTIAL_TURN_LAYOUT_LABELS: Record<string, string> = {
  "studio": "Studio",
  "1/1": "1BR/1BA",
  "2/1": "2BR/1BA",
  "2/2": "2BR/2BA",
  "3/1": "3BR/1BA",
  "3/2": "3BR/2BA",
  "3/3": "3BR/3BA",
};
const UNIT_QUALITY_OPTIONS = [
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
] as const;
const BUILDING_ADDRESS_OPTIONS = [
  "751 Vandenburg Rd, King of Prussia, PA 19406 (Park Square)",
  "580 S Goddard Blvd, King of Prussia, PA 19406 (The Smith)",
  "140 Valley Green Ln, King of Prussia, PA 19406 (The George)",
  "3000 Emily Lane Burlington NJ 08016 (J Centra Burlington)",
  "3029 W Glenwood Ave (Equinox)",
  "200 University Dr, Schuylkill Haven, PA, 17972 (Nittany Apartments)",
  "456 N. 5th Street, Philadelphia, PA 19123 (The Block at SONO)",
  "2630 W Girard Ave, Philadelphia PA 19130 (The Gio Apartments)",
] as const;
const ADD_NEW_BUILDING_VALUE = "__add_new_building__";
const ADD_NEW_ADDRESS_VALUE = "__add_new_address__";

type BedroomValue = (typeof BEDROOM_OPTIONS)[number];
type BathroomValue = (typeof BATHROOM_OPTIONS)[number];
type UnitScope = {
  id: string;
  unitNumber: string;
  startDate: string;
  endDate: string;
  paintDate: string;
  cleanDate: string;
  moveOutDate: string;
  moveInDate: string;
  bedrooms: BedroomValue;
  bathrooms: BathroomValue;
  isCommonArea: boolean;
  isPartialTurn: boolean;
  partialTurnLayout: string;
  sqft: string;
  unitQuality: string;
  fullPaint: boolean;
  touchUpPaint: boolean;
  lightWallTouchUps: boolean;
  materialsAdditional: boolean;
  fullClean: boolean;
  carpetCleaning: boolean;
  otherWork: boolean;
  otherDescription: string;
  otherPrice: string;
  /** Covered by the building's flat monthly recurring contract — skips per-unit pricing-package pricing. */
  recurringContractUnit: boolean;
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
    moveInDate: "",
    bedrooms: "1",
    bathrooms: "1",
    isCommonArea: false,
    isPartialTurn: false,
    partialTurnLayout: "",
    sqft: "",
    unitQuality: "",
    fullPaint: false,
    touchUpPaint: false,
    lightWallTouchUps: false,
    materialsAdditional: false,
    fullClean: false,
    carpetCleaning: false,
    otherWork: false,
    otherDescription: "",
    otherPrice: "",
    recurringContractUnit: false,
  };
}

function normalizeBeds(value?: number | null): 1 | 2 | 3 {
  const beds = Number(value ?? 1);
  if (!Number.isFinite(beds) || beds < 1) return 1;
  if (beds >= 3) return 3;
  return beds === 2 ? 2 : 1;
}

function bedroomsToNumber(value: BedroomValue): number {
  if (value === "Studio") return 0;
  if (value === "4+") return 4;
  return Number(value) || 1;
}

function bathroomsToNumber(value: BathroomValue): number {
  if (value === "3+") return 3;
  return Number(value) || 1;
}

function describeUnit(unit: Pick<UnitScope, "isCommonArea" | "bedrooms" | "bathrooms" | "sqft">): string {
  const base = unit.isCommonArea
    ? "Common Area"
    : unit.bedrooms === "Studio"
      ? "Studio"
      : `${unit.bedrooms} bed / ${unit.bathrooms} bath`;
  return unit.sqft.trim() ? `${base}, ${unit.sqft.trim()} sq ft` : base;
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    cents / 100
  );
}

/** computeTurnoverPricing's breakdown lines are "<description>: <$amount>" sentences — split for a two-column display instead of one run-on string. */
function splitBreakdownLine(line: string): { text: string; amount: string | null } {
  const idx = line.lastIndexOf(":");
  if (idx === -1) return { text: line, amount: null };
  return { text: line.slice(0, idx).trim(), amount: line.slice(idx + 1).trim() };
}

function dollarsToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

const UNIT_QUALITY_LABELS: Record<string, string> = { GOOD: "Good", FAIR: "Fair", POOR: "Poor" };

function unitScopeSummary(unit: UnitScope) {
  const dateRange =
    unit.startDate || unit.endDate
      ? `, dates: ${unit.startDate || "TBD"} to ${unit.endDate || "TBD"}`
      : "";
  const scheduledDates = [
    unit.moveOutDate ? `move-out: ${unit.moveOutDate}` : null,
    unit.moveInDate ? `move-in: ${unit.moveInDate}` : null,
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
    unit.otherWork ? `other: ${unit.otherDescription.trim() || "unspecified"}` : null,
  ].filter(Boolean);

  const unitLabel = unit.unitNumber || (unit.isCommonArea ? "Common Area" : "Unit");
  return `${unitLabel} (${describeUnit(unit)}${dateRange}${
    scheduledDates.length ? `, ${scheduledDates.join(", ")}` : ""
  })${unit.unitQuality ? ` - ${UNIT_QUALITY_LABELS[unit.unitQuality] ?? unit.unitQuality}` : ""}: ${
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
  pricingPackage?: unknown;
  recurringContract?: {
    id: string;
    status: string;
    units: { id: string; unitNumber: string }[];
  } | null;
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
  segment?: string | null;
  hubspotPipelineId?: string | null;
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
  /** Pre-fill and lock the SUEEP PM name and email fields */
  lockedSueepPm?: { name: string; email: string };
  /** Hide the "Add new building / address" options — only allow existing buildings */
  disableNewBuilding?: boolean;
  /** Arbitrary extra fields merged into the submission payload */
  payloadExtra?: Record<string, unknown>;
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
const JANITORIAL_CO_REQUEST_TYPES = ["UDR", "Pool", "Grill Cleaning"] as const;

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

function PmSearchDropdown({
  employees,
  value,
  onSelect,
  onClear,
}: {
  employees: EmployeeOption[];
  value: string;
  onSelect: (employee: EmployeeOption) => void;
  onClear: () => void;
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
        onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onClear(); }}
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
                  onSelect(emp);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-gray-900 hover:bg-pink-50 hover:text-pink-700"
              >
                <span>{emp.firstName} {emp.lastName}</span>
                {emp.email && <span className="text-xs text-gray-400">{emp.email}</span>}
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
  lockedSueepPm,
  disableNewBuilding = false,
  payloadExtra,
}: NewProjectFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [segment, setSegment] = useState(initialSegment);
  const [currentStep, setCurrentStep] = useState(1);

  // Change order state
  const [coProjectId, setCoProjectId] = useState("");
  const [coRequestType, setCoRequestType] = useState("");
  const [coTitle, setCoTitle] = useState("");
  const [coStatus, setCoStatus] = useState<typeof CO_STATUSES[number]>("DRAFT");
  const [coRequestedBy, setCoRequestedBy] = useState("");
  const [coComments, setCoComments] = useState("");

  const notifiableEmployees = useMemo(() => employees.filter((e) => e.email), [employees]);
  const defaultNotifyIds = useMemo(() => {
    const ids: string[] = [];
    for (const e of notifiableEmployees) {
      const name = `${e.firstName} ${e.lastName}`.toLowerCase();
      if (name === "david rodriguez" || e.firstName.toLowerCase() === "sergio" || e.firstName.toLowerCase() === "nick") ids.push(e.id);
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
  const [buildingsLoading, setBuildingsLoading] = useState(initialBuildings.length === 0);
  const [scheduleBuildings, setScheduleBuildings] = useState<ScheduleBuildingOption[]>(initialScheduleBuildings);
  const [scheduleBuildingsLoading, setScheduleBuildingsLoading] = useState(initialScheduleBuildings.length === 0);
  const [scheduleBuildingsError, setScheduleBuildingsError] = useState("");
  const [buildingProjectId, setBuildingProjectId] = useState("");
  const [isAddingBuilding, setIsAddingBuilding] = useState(false);
  const [isAddingAddress, setIsAddingAddress] = useState(false);

  const requestType = "TURNOVER";
  const [buildingName, setBuildingName] = useState("");
  const [buildingAddress, setBuildingAddress] = useState("");
  const [dealQuery, setDealQuery] = useState("");
  const [dealCandidates, setDealCandidates] = useState<{ id: string; name: string }[]>([]);
  const [dealSearchLoading, setDealSearchLoading] = useState(false);
  const [dealSearchError, setDealSearchError] = useState("");
  const [hasSearchedDeal, setHasSearchedDeal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");

  async function searchJanitorialDeal(query: string) {
    setDealSearchLoading(true);
    setDealSearchError("");
    try {
      const res = await fetch(`/api/erp/hubspot/janitorial-deal-search?q=${encodeURIComponent(query)}`);
      const data = (await res.json()) as { results?: { id: string; name: string }[]; error?: string };
      if (!res.ok) {
        setDealSearchError(data.error || "Could not search HubSpot.");
        return;
      }
      setDealCandidates(data.results ?? []);
    } catch {
      setDealSearchError("Network error searching HubSpot.");
    } finally {
      setDealSearchLoading(false);
      setHasSearchedDeal(true);
    }
  }

  function selectJanitorialDeal(deal: { id: string; name: string }) {
    setBuildingName(parseBuildingNameFromDealName(deal.name));
    const address = parseAddressFromDealName(deal.name);
    if (address) setBuildingAddress(address);
    setSelectedDealId(deal.id);
  }

  function resetDealSearchState() {
    setDealQuery("");
    setDealCandidates([]);
    setDealSearchError("");
    setHasSearchedDeal(false);
    setSelectedDealId("");
  }
  const [supervisorName, setSupervisorName] = useState(() => {
    const david = employees.find(
      (e) => `${e.firstName} ${e.lastName}`.toLowerCase() === "david rodriguez"
    );
    return david ? `${david.firstName} ${david.lastName}` : "";
  });
  const [pmName, setPmName] = useState("");
  const [pmEmail, setPmEmail] = useState("");
  const [pmPhone, setPmPhone] = useState("");
  const [sueepPmName, setSueepPmName] = useState(() => {
    if (lockedSueepPm?.name) return lockedSueepPm.name;
    const david = employees.find(
      (e) => `${e.firstName} ${e.lastName}`.toLowerCase() === "david rodriguez"
    );
    return david ? `${david.firstName} ${david.lastName}` : "";
  });
  const [sueepPmEmail, setSueepPmEmail] = useState(() => {
    if (lockedSueepPm?.email) return lockedSueepPm.email;
    const david = employees.find(
      (e) => `${e.firstName} ${e.lastName}`.toLowerCase() === "david rodriguez"
    );
    return david?.email ?? "";
  });
  const [unitScopes, setUnitScopes] = useState<UnitScope[]>(() => [createUnitScope("unit-1")]);

  const descriptionValue = serviceType === "__other__" ? customType.trim() : serviceType;

  const isTurnover = segment === "JANITORIAL_TURNOVER_REQUESTS";
  const isMultiStep = lockedSegment && isTurnover;
  const isChangeOrder = segment === "CHANGE_ORDER";
  const isChildWorkRequest = isChangeOrder;
  const childWorkRequestProjects = allProjects;
  const childRequestNoun = "change order";

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
    setBuildingsLoading(initialBuildings.length === 0);
    fetch("/api/erp/buildings")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!mounted) return;
        if (Array.isArray(data)) setBuildings(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setBuildingsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [allowErpDataFetch, initialBuildings.length]);

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
  const normalizedBeds = normalizeBeds(bedroomsToNumber(unitScopes[0]?.bedrooms ?? "1"));
  const normalizedBathrooms = bathroomsToNumber(unitScopes[0]?.bathrooms ?? "1");
  const selectedBuilding = useMemo(() => buildings.find((b) => b.id === buildingProjectId) ?? null, [buildings, buildingProjectId]);
  const pricingPackage = useMemo(
    () => getTurnoverPricingPackage(buildingName, selectedBuilding?.pricingPackage),
    [buildingName, selectedBuilding]
  );
  const activeRecurringContractUnits = useMemo(
    () => new Set((selectedBuilding?.recurringContract?.status === "ACTIVE" ? selectedBuilding.recurringContract.units : []).map((u) => u.unitNumber)),
    [selectedBuilding]
  );
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
        if (patch.isCommonArea) {
          next.isPartialTurn = false;
          next.partialTurnLayout = "";
        }
        if (patch.isPartialTurn) {
          next.isCommonArea = false;
        } else if (patch.isPartialTurn === false) {
          next.partialTurnLayout = "";
        }
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

  function applySelectedBuilding(id: string) {
    if (id === ADD_NEW_BUILDING_VALUE) {
      setIsAddingBuilding(true);
      setBuildingProjectId(id);
      setBuildingName("");
      setBuildingAddress("");
      setIsAddingAddress(true);
      setPmName("");
      setPmEmail("");
      setPmPhone("");
      resetDealSearchState();
      return;
    }

    const building = buildings.find((b) => b.id === id);
    setIsAddingBuilding(false);
    setIsAddingAddress(false);
    setBuildingProjectId(id);
    setBuildingName(building?.name ?? "");
    setBuildingAddress(building?.address ?? "");
    setPmName(building?.pmName ?? "");
    setPmEmail(building?.pmEmail ?? "");
    setPmPhone(building?.pmPhone ?? "");
    resetDealSearchState();
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
      resetDealSearchState();
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
    resetDealSearchState();
  }

  function validateStep(step: number): string {
    if (step === 1) {
      if (!buildingProjectId) return "Please select a building.";
      if (!buildingAddress.trim()) return "Please select or enter a building address.";
      if (!pmName.trim()) return "PM name is required.";
      if (!pmEmail.trim()) return "PM email is required.";
      if (!pmPhone.trim()) return "PM phone is required.";
    }
    if (step === 2) {
      if (unitScopes.some((unit) => !unit.startDate)) return "Start date is required for every unit.";
    }
    if (step === 3) {
      if (!sueepPmName.trim()) return "SUEEP PM name is required.";
      if (!sueepPmEmail.trim()) return "SUEEP PM email is required.";
    }
    return "";
  }

  const packagePricing = useMemo(() => {
    let totalPrice = 0;
    const breakdown: string[] = [];
    const perUnit: { id: string; label: string; description: string; lines: string[]; subtotal: number }[] = [];

    unitScopes.forEach((unit, index) => {
      const unitLabel = unit.unitNumber || (unit.isCommonArea ? "Common Area" : `Unit ${index + 1}`);
      const lines: string[] = [];
      let unitTotal = 0;

      if (unit.recurringContractUnit) {
        lines.push("covered by recurring contract — no charge");
      } else {
        const hasPricedService = unit.fullClean || unit.fullPaint || unit.touchUpPaint || unit.materialsAdditional || unit.carpetCleaning;
        if (hasPricedService) {
          const unitPricing = computeTurnoverPricing({
            requestType: "TURNOVER",
            buildingName,
            pricingPackage,
            bedrooms: unit.isCommonArea ? null : bedroomsToNumber(unit.bedrooms),
            bathrooms: unit.isCommonArea ? null : bathroomsToNumber(unit.bathrooms),
            isCommonArea: unit.isCommonArea,
            isPartialTurn: unit.isPartialTurn,
            partialTurnLayout: unit.partialTurnLayout,
            fullPaint: unit.fullPaint,
            touchUpPaint: unit.touchUpPaint && !unit.fullPaint ? 1 : 0,
            fullClean: unit.fullClean,
            carpetCleaning: unit.carpetCleaning,
            materialsAdditional: unit.materialsAdditional,
            ceilingPaint: false,
          });
          lines.push(...unitPricing.breakdown);
          unitTotal += unitPricing.priceCents;
        }

        if (unit.lightWallTouchUps) {
          lines.push("Light wall touch-ups: not priced");
        }
      }

      if (unit.otherWork) {
        const otherCents = dollarsToCents(unit.otherPrice || "0");
        unitTotal += otherCents;
        lines.push(`${unit.otherDescription.trim() || "Other"}: ${formatUsd(otherCents)}`);
      }

      totalPrice += unitTotal;
      if (lines.length > 0) {
        perUnit.push({ id: unit.id, label: unitLabel, description: describeUnit(unit), lines, subtotal: unitTotal });
        breakdown.push(`${unitLabel} (${describeUnit(unit)}): ${lines.join(" | ")} = ${formatUsd(unitTotal)}`);
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
      perUnit,
      unitCount,
    };
  }, [unitScopes, unitCount, buildingName, pricingPackage]);

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
      if (!res.ok) { setError(data.error || `Failed to create ${childRequestNoun}`); setLoading(false); return; }

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
    if (isMultiStep) {
      const stepError = validateStep(currentStep);
      if (stepError) { setError(stepError); return; }
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const unitDetails = unitScopes.map(unitScopeSummary);
    const turnoverUnitLabel = unitScopes
      .map((unit, index) => unit.unitNumber.trim() || (unit.isCommonArea ? "Common Area" : `Unit ${index + 1}`))
      .join(", ");
    const generatedTurnoverTitle = `${buildingName.trim() || "Janitorial turnover"}${
      turnoverUnitLabel ? ` - ${turnoverUnitLabel}` : ""
    }`;
    const turnoverScheduleDates = unitScopes.flatMap((unit) => [
      unit.startDate,
      unit.endDate,
      unit.moveOutDate,
      unit.moveInDate,
      unit.paintDate,
      unit.cleanDate,
    ]);
    const turnoverStartDate = minDateValue(turnoverScheduleDates);
    const turnoverEndDate = maxDateValue(turnoverScheduleDates);
    const turnoverComments = String(fd.get("turnoverComments") || "").trim();
    const geotrackingEnabled = fd.get("geotrackingEnabled") === "on";
    const geotrackingLocation = String(fd.get("geotrackingLocation") || buildingAddress).trim();
    const geofenceRadiusFeet = String(fd.get("geofenceRadiusFeet") || "").trim();
    const geotrackingCheckMode = String(fd.get("geotrackingCheckMode") || "").trim();
    const geotrackingNotes = String(fd.get("geotrackingNotes") || "").trim();
    const turnoverDescription = [
      isTurnover ? null : descriptionValue,
      isTurnover ? `Property: ${buildingName.trim() || "Unspecified"}` : null,
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
      buildingHubspotDealId: isAddingBuilding ? selectedDealId || undefined : undefined,
      pmName: pmName.trim() || undefined,
      pmEmail: pmEmail.trim() || undefined,
      pmPhone: pmPhone.trim() || undefined,
      sueepPmName: sueepPmName.trim() || undefined,
      sueepPmEmail: sueepPmEmail.trim() || undefined,
      unitNumbers: unitScopes.map((unit, index) => unit.unitNumber.trim() || (unit.isCommonArea ? "Common Area" : `Unit ${index + 1}`)).join(", ") || undefined,
      unitQuality: unitScopes.map((unit) => (unit.unitQuality ? UNIT_QUALITY_LABELS[unit.unitQuality] ?? unit.unitQuality : "")).filter(Boolean).join("; ") || undefined,
      moveOutDates: unitScopes.map((unit) => unit.moveOutDate).filter(Boolean).join(", ") || undefined,
      moveInDates: unitScopes.map((unit) => unit.moveInDate).filter(Boolean).join(", ") || undefined,
      paintDates: unitScopes.map((unit) => unit.paintDate).filter(Boolean).join(", ") || undefined,
      cleanDates: unitScopes.map((unit) => unit.cleanDate).filter(Boolean).join(", ") || undefined,
      bedrooms: normalizedBeds || undefined,
      bathrooms: normalizedBathrooms,
      unitScopes,
      geotrackingEnabled,
      geotrackingLocation: geotrackingEnabled ? geotrackingLocation || undefined : undefined,
      geofenceRadiusFeet: geotrackingEnabled ? geofenceRadiusFeet || undefined : undefined,
      geotrackingCheckMode: geotrackingEnabled ? geotrackingCheckMode || undefined : undefined,
      geotrackingNotes: geotrackingEnabled ? geotrackingNotes || undefined : undefined,
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
      ...(isTurnover && notifyEmployeeIds.length > 0 ? { notifyEmployeeIds } : {}),
      ...payloadExtra,
    };

    try {
      const res = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; projectId?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to create");
        setLoading(false);
        return;
      }
      if (successMessage) {
        setSubmitted(true);
      } else if (isTurnover) {
        router.push(data.projectId ? `/erp/projects/${data.projectId}` : "/erp/projects");
      } else {
        router.push("/erp/projects");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (isChildWorkRequest) {
    return (
      <form onSubmit={onSubmitChangeOrder} className="w-full space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
        <div>
          <label className={label} htmlFor="co-segment">Segment</label>
          <select id="co-segment" className={input} value={segment} onChange={(e) => setSegment(e.target.value)}>
            {CREATABLE_SEGMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>Project *</label>
          <ProjectSearchDropdown
            projects={childWorkRequestProjects}
            value={coProjectId}
            onChange={setCoProjectId}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="co-request-type">Request type</label>
            <select
              id="co-request-type"
              className={input}
              value={coRequestType}
              onChange={(e) => {
                const next = e.target.value;
                setCoRequestType(next);
                if (next && (!coTitle.trim() || JANITORIAL_CO_REQUEST_TYPES.includes(coTitle as typeof JANITORIAL_CO_REQUEST_TYPES[number]))) {
                  setCoTitle(next);
                }
              }}
            >
              <option value="">Custom</option>
              {JANITORIAL_CO_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="co-title">Title *</label>
            <input id="co-title" required className={input} value={coTitle} onChange={(e) => setCoTitle(e.target.value)} placeholder="e.g. UDR" />
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
            {loading ? "Saving…" : `Create ${childRequestNoun}`}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="w-full space-y-6 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6">
      {submitted && successMessage ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
          {successMessage}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {!lockedSegment ? (
          <>
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
                {CREATABLE_SEGMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {isTurnover && (
              <div className="flex items-end sm:col-start-3 sm:justify-end">
                <a
                  href="/janitorial-turnover"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border border-pink-200 bg-white px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-50"
                >
                  External link
                </a>
              </div>
            )}
          </>
        ) : null}
        {!isTurnover && (
          <>
            <div className="min-w-0">
              <label className={label} htmlFor="projectDate">
                Start date *
              </label>
              <input
                id="projectDate"
                name="projectDate"
                type="date"
                required
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
          {isMultiStep && (
            <div className="flex items-center gap-1.5 border-b border-pink-100 pb-3">
              {(["Property Info", "Units & Scope", "Review & Submit"] as const).map((stepLabel, i) => {
                const s = i + 1;
                const done = s < currentStep;
                const active = s === currentStep;
                return (
                  <div key={s} className="flex items-center gap-1.5">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-pink-600 text-white" : active ? "bg-pink-600 text-white ring-2 ring-pink-200" : "bg-gray-200 text-gray-500"}`}>
                      {done ? "✓" : s}
                    </div>
                    {active && <span className="text-xs font-medium text-pink-700">{stepLabel}</span>}
                    {s < 3 && <div className={`h-px w-4 shrink-0 ${done ? "bg-pink-400" : "bg-gray-200"}`} />}
                  </div>
                );
              })}
            </div>
          )}
          <div className={isMultiStep && currentStep !== 1 ? "hidden" : "space-y-2"}>
            <p className={sectionHeader}>Step 1 - Property and Property Manager/Maintenance Manager Info</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label className={label} htmlFor="buildingProjectId">
                  Building
                </label>
                <SearchableSelect
                  id="buildingProjectId"
                  value={buildingProjectId}
                  onChange={applySelectedBuilding}
                  disabled={buildingsLoading}
                  placeholder="Search buildings…"
                  allLabel={buildingsLoading ? "Loading buildings..." : !buildingsLoading && buildings.length === 0 ? "No buildings found" : "Select a building..."}
                  options={[
                    ...buildings.map((building) => ({ value: building.id, label: building.name })),
                    ...(!disableNewBuilding ? [{ value: ADD_NEW_BUILDING_VALUE, label: "Add new building..." }] : []),
                  ]}
                  className="mt-1"
                />
                {isAddingBuilding ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className={label}>Find building from a HubSpot deal</label>
                      <div className="mt-1 flex gap-2">
                        <input
                          value={dealQuery}
                          onChange={(e) => setDealQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void searchJanitorialDeal(dealQuery);
                            }
                          }}
                          placeholder="Search deals by name…"
                          className={input}
                        />
                        <button
                          type="button"
                          onClick={() => searchJanitorialDeal(dealQuery)}
                          disabled={dealSearchLoading || !dealQuery.trim()}
                          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {dealSearchLoading ? "Searching…" : "Search"}
                        </button>
                      </div>

                      {dealSearchError && <p className="mt-1 text-xs text-red-600">{dealSearchError}</p>}

                      {hasSearchedDeal && !dealSearchLoading && dealCandidates.length === 0 && !dealSearchError && (
                        <p className="mt-1 text-xs text-gray-400">No matching deals found — enter the building name manually below.</p>
                      )}

                      {dealCandidates.length > 0 && (
                        <div className="mt-1.5 space-y-1 rounded-md border border-gray-200 p-1.5">
                          {dealCandidates.map((deal) => (
                            <button
                              key={deal.id}
                              type="button"
                              onClick={() => selectJanitorialDeal(deal)}
                              className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs ${
                                selectedDealId === deal.id ? "bg-pink-50 font-medium text-pink-700" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span className="truncate" title={deal.name}>{deal.name}</span>
                              {selectedDealId === deal.id && <span className="shrink-0 text-pink-600">✓ Selected</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={label} htmlFor="newBuildingName">
                        New building name
                      </label>
                      <input
                        id="newBuildingName"
                        name="newBuildingName"
                        required
                        className={input}
                        value={buildingName}
                        onChange={(e) => {
                          setBuildingName(e.target.value);
                          setSelectedDealId("");
                        }}
                        placeholder="Or type the building name manually"
                      />
                    </div>
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
                  {!disableNewBuilding && <option value={ADD_NEW_ADDRESS_VALUE}>Add new address...</option>}
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

          <div className={isMultiStep && currentStep !== 2 ? "hidden" : "space-y-3"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className={sectionHeader}>Step 2 — Units & scope</p>
              <button
                type="button"
                onClick={addUnitScope}
                className="w-full rounded-md border border-pink-200 bg-white px-3 py-2 text-xs font-medium text-pink-700 hover:bg-pink-50 sm:w-auto sm:py-1.5"
              >
                Add unit
              </button>
            </div>
            <div className={isMultiStep ? "flex flex-col gap-4 lg:flex-row lg:items-start" : "space-y-3"}>
            <div className={isMultiStep ? "min-w-0 flex-1 space-y-3" : "space-y-3"}>
              {unitScopes.map((unit, index) => (
                <div key={unit.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
                  <div className={isMultiStep ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_140px_140px_1.5fr_auto]"}>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`unit-${unit.id}`}>
                        {unit.isCommonArea ? "Title" : "Unit number"}
                      </label>
                      <input
                        id={`unit-${unit.id}`}
                        className={input}
                        value={unit.unitNumber}
                        onChange={(e) => updateUnitScope(unit.id, { unitNumber: e.target.value })}
                        placeholder={unit.isCommonArea ? "e.g. Lobby, Hallway" : `Unit ${index + 1}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`start-date-${unit.id}`}>
                        Start date *
                      </label>
                      <input
                        id={`start-date-${unit.id}`}
                        type="date"
                        required
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
                    <div className={isMultiStep ? "min-w-0 sm:col-span-2 lg:col-span-1" : "min-w-0 md:col-span-2 xl:col-span-1"}>
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
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={isMultiStep ? "flex items-end sm:col-span-2 lg:col-span-1" : "flex items-end md:col-span-2 xl:col-span-1"}>
                      <button
                        type="button"
                        onClick={() => removeUnitScope(unit.id)}
                        disabled={unitScopes.length <= 1}
                        className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:border-pink-300 disabled:opacity-40 ${isMultiStep ? "lg:w-auto" : "xl:w-auto"}`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="min-w-0">
                      <label className={label} htmlFor={`bedrooms-${unit.id}`}>
                        Bedrooms
                      </label>
                      <select
                        id={`bedrooms-${unit.id}`}
                        className={input}
                        value={unit.bedrooms}
                        disabled={unit.isCommonArea}
                        onChange={(e) => updateUnitScope(unit.id, { bedrooms: e.target.value as BedroomValue })}
                      >
                        {BEDROOM_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`bathrooms-${unit.id}`}>
                        Bathrooms
                      </label>
                      <select
                        id={`bathrooms-${unit.id}`}
                        className={input}
                        value={unit.bathrooms}
                        disabled={unit.isCommonArea}
                        onChange={(e) => updateUnitScope(unit.id, { bathrooms: e.target.value as BathroomValue })}
                      >
                        {BATHROOM_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className={label} htmlFor={`sqft-${unit.id}`}>
                        Square footage
                      </label>
                      <input
                        id={`sqft-${unit.id}`}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className={input}
                        value={unit.sqft}
                        onChange={(e) => updateUnitScope(unit.id, { sqft: e.target.value })}
                        placeholder="e.g. 850"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={unit.isCommonArea}
                          onChange={(e) => updateUnitScope(unit.id, { isCommonArea: e.target.checked })}
                          className="h-4 w-4 text-pink-600"
                        />
                        <span className={checkboxLabel}>Common area</span>
                      </label>
                    </div>
                  </div>
                  {!unit.isCommonArea && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={unit.isPartialTurn}
                            onChange={(e) => updateUnitScope(unit.id, { isPartialTurn: e.target.checked })}
                            className="h-4 w-4 text-pink-600"
                          />
                          <span className={checkboxLabel}>Partial turn</span>
                        </label>
                      </div>
                      {unit.isPartialTurn && (
                        <div className="min-w-0">
                          <label className={label} htmlFor={`partial-turn-layout-${unit.id}`}>
                            Price as
                          </label>
                          <select
                            id={`partial-turn-layout-${unit.id}`}
                            className={input}
                            value={unit.partialTurnLayout}
                            onChange={(e) => updateUnitScope(unit.id, { partialTurnLayout: e.target.value })}
                          >
                            <option value="">Select a layout...</option>
                            {PARTIAL_TURN_LAYOUT_OPTIONS.map((l) => (
                              <option key={l} value={l}>{PARTIAL_TURN_LAYOUT_LABELS[l] ?? l}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
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
                      <label className={label} htmlFor={`move-in-date-${unit.id}`}>
                        Move-in date (optional)
                      </label>
                      <input
                        id={`move-in-date-${unit.id}`}
                        type="date"
                        className={input}
                        value={unit.moveInDate}
                        onChange={(e) => updateUnitScope(unit.id, { moveInDate: e.target.value })}
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
                      { key: "otherWork", text: "Other" },
                    ].map(({ key, text, disabled }) => (
                      <label key={key} className={`flex min-w-0 items-center rounded-md border border-gray-200 bg-white px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(unit[key as keyof UnitScope])}
                          disabled={disabled}
                          onChange={(e) =>
                            updateUnitScope(unit.id, {
                              [key]: e.target.checked,
                              ...(key === "otherWork" && !e.target.checked ? { otherDescription: "", otherPrice: "" } : {}),
                            } as Partial<UnitScope>)
                          }
                          className="h-4 w-4 text-pink-600"
                        />
                        <span className={`${checkboxLabel} break-words`}>{text}</span>
                      </label>
                    ))}
                  </div>
                  {selectedBuilding?.recurringContract?.status === "ACTIVE" && (
                    <label className="mt-3 flex min-w-0 items-center rounded-md border border-pink-200 bg-pink-50 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={unit.recurringContractUnit}
                        onChange={(e) => updateUnitScope(unit.id, { recurringContractUnit: e.target.checked })}
                        className="h-4 w-4 text-pink-600"
                      />
                      <span className={`${checkboxLabel} break-words`}>
                        Part of this building&apos;s recurring contract — covered by the flat monthly rate, no per-unit charge
                        {unit.unitNumber.trim() && activeRecurringContractUnits.has(unit.unitNumber.trim()) ? " (already enrolled)" : ""}
                      </span>
                    </label>
                  )}
                  {unit.otherWork && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label className={label} htmlFor={`other-description-${unit.id}`}>
                          Describe the other work
                        </label>
                        <input
                          id={`other-description-${unit.id}`}
                          className={input}
                          value={unit.otherDescription}
                          onChange={(e) => updateUnitScope(unit.id, { otherDescription: e.target.value })}
                          placeholder="e.g. Window cleaning"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className={label} htmlFor={`other-price-${unit.id}`}>
                          Price ($)
                        </label>
                        <input
                          id={`other-price-${unit.id}`}
                          type="number"
                          min={0}
                          step="0.01"
                          className={input}
                          value={unit.otherPrice}
                          onChange={(e) => updateUnitScope(unit.id, { otherPrice: e.target.value })}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {isMultiStep && (
              <div className="space-y-4 lg:w-72 lg:shrink-0">
                <div className="sticky top-4 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900">{lockedSueepPm ? "Unit Summary" : "Order summary"}</p>
                    {!lockedSueepPm && selectedBuilding && (
                      <a
                        href={`/erp/buildings/${selectedBuilding.id}?tab=${encodeURIComponent("Pricing Package")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-pink-600 hover:underline"
                      >
                        Edit pricing package
                      </a>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50 px-4">
                    {packagePricing.perUnit.length === 0 ? (
                      <p className="py-4 text-xs italic text-gray-400">Select services to see {lockedSueepPm ? "a summary" : "pricing"}.</p>
                    ) : (
                      packagePricing.perUnit.map((unit) => (
                        <div key={unit.id} className="py-3">
                          <p className="mb-2 text-xs font-semibold text-gray-700">
                            {unit.label}{" "}
                            <span className="font-normal text-gray-400">({unit.description})</span>
                          </p>
                          <div className="space-y-1.5">
                            {unit.lines.map((line) => {
                              if (lockedSueepPm) return <div key={line} className="text-xs text-gray-500">{splitBreakdownLine(line).text}</div>;
                              const { text, amount } = splitBreakdownLine(line);
                              return (
                                <div key={line} className="flex justify-between gap-2 text-xs">
                                  <span className="text-gray-500">{text}</span>
                                  <span className="shrink-0 tabular-nums text-gray-600">{amount ?? ""}</span>
                                </div>
                              );
                            })}
                            {!lockedSueepPm && unit.lines.length > 1 && (
                              <div className="flex justify-between border-t border-gray-100 pt-1.5">
                                <span className="text-xs font-medium text-gray-600">Subtotal</span>
                                <span className="text-xs font-medium tabular-nums text-gray-700">{formatUsd(unit.subtotal)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {!lockedSueepPm && (
                    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="text-sm font-semibold text-gray-700">Estimated total</span>
                      <span className="text-lg font-bold tabular-nums text-gray-900">{packagePricing.totalPriceLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          <div className={isMultiStep && currentStep !== 3 ? "hidden" : "space-y-5"}>
          <div className="space-y-3">
            <p className={sectionHeader}>{lockedSueepPm ? "Step 3 - Review & Submit" : "Step 4 - Estimated total"}</p>
            {!lockedSueepPm && (
              <>
                <div className="min-w-0">
                  <label className={label} htmlFor="sueepPmName">
                    SUEEP PM
                  </label>
                  <PmSearchDropdown
                    employees={notifiableEmployees}
                    value={sueepPmName}
                    onSelect={(emp) => {
                      setSueepPmName(`${emp.firstName} ${emp.lastName}`.trim());
                      setSueepPmEmail(emp.email ?? "");
                    }}
                    onClear={() => { setSueepPmName(""); setSueepPmEmail(""); }}
                  />
                  {sueepPmEmail && <p className="mt-1 text-xs text-gray-500">{sueepPmEmail}</p>}
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">Estimated total: <span className="font-semibold text-gray-900 text-lg">{packagePricing.totalPriceLabel}</span></p>
                    {selectedBuilding && (
                      <a
                        href={`/erp/buildings/${selectedBuilding.id}?tab=${encodeURIComponent("Pricing Package")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-pink-600 hover:underline"
                      >
                        Edit pricing package
                      </a>
                    )}
                  </div>
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">Price details</p>
                    {packagePricing.perUnit.length === 0 ? (
                      <p className="mt-2 text-sm italic text-gray-400">No priceable work selected yet.</p>
                    ) : (
                      <div className="mt-2 divide-y divide-gray-200">
                        {packagePricing.perUnit.map((unit) => (
                          <div key={unit.id} className="py-2 first:pt-0 last:pb-0">
                            <p className="text-sm font-medium text-gray-800">
                              {unit.label} <span className="font-normal text-gray-400">({unit.description})</span>
                            </p>
                            <div className="mt-1 space-y-0.5">
                              {unit.lines.map((line) => {
                                const { text, amount } = splitBreakdownLine(line);
                                return (
                                  <div key={line} className="flex justify-between gap-2 text-sm text-gray-600">
                                    <span>{text}</span>
                                    <span className="shrink-0 tabular-nums">{amount ?? ""}</span>
                                  </div>
                                );
                              })}
                              {unit.lines.length > 1 && (
                                <div className="flex justify-between border-t border-gray-200 pt-1 text-sm font-medium text-gray-700">
                                  <span>Subtotal</span>
                                  <span className="tabular-nums">{formatUsd(unit.subtotal)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {lockedSueepPm && (
              <input type="hidden" name="sueepPmName" value={sueepPmName} />
            )}
            {lockedSueepPm && (
              <input type="hidden" name="sueepPmEmail" value={sueepPmEmail} />
            )}
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
                defaultValue="Scope and expectations have been reviewed with the Project Supervisor and production team to ensure delivery of a move-in ready unit. Any conditions or services identified outside of the approved turnover scope will be documented and communicated for authorization prior to proceeding. Once completion of Unit, sign off by Property Management is needed."
              />
            </div>
          </div>

          {notifiableEmployees.length > 0 && (
            <div className="space-y-3">
              <p className={sectionHeader}>Notify employees</p>
              <p className="text-xs text-gray-600">Select additional team members to notify about this turnover</p>
              <NotifyMultiSelect
                employees={notifiableEmployees}
                selectedIds={notifyEmployeeIds}
                onChange={(ids) => { setNotifyEmployeeIds(ids); setNotifyResult(null); }}
              />
            </div>
          )}
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
                <label className={label} htmlFor="estLabor">
                  Est. labor
                </label>
                <input id="estLabor" name="estLabor" className={input} />
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
      {!(isMultiStep && submitted) && (
        <div className="flex gap-3">
          {isMultiStep ? (
            <>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => { setError(""); setCurrentStep((s) => s - 1); }}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              )}
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    const err = validateStep(currentStep);
                    if (err) { setError(err); return; }
                    setError("");
                    setCurrentStep((s) => s + 1);
                  }}
                  className="rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const err = validateStep(currentStep);
                    if (err) { setError(err); return; }
                    formRef.current?.requestSubmit();
                  }}
                  className="w-full rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50 sm:w-auto"
                >
                  {loading ? "Saving…" : submitLabel}
                </button>
              )}
            </>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Saving…" : submitLabel}
            </button>
          )}
        </div>
      )}
    </form>
  );
}
