/**
 * Every value on the Settings page: where it shows, what it means, its
 * default and its limits. Values are stored as text in AppSetting (no row =
 * the default). Client-safe (no prisma), so the page and the API share the
 * same checks. Server reads and saves are in settings.ts.
 */

import { DEFAULT_HEALTH_SHARE_PCT, HEALTH_SHARE_SETTING_KEY } from "./healthCost";
import { DEFAULT_PAYROLL_ANCHOR } from "./payPeriods";
import { DEFAULT_SALES_TAX_PCT } from "./janitorialPricing";
import { DEFAULT_NEXT_DAY_UPCHARGE_PERCENT } from "@/lib/nextDayUpcharge";
import { DEFAULT_CO_COST_RATES, DEFAULT_CO_PRICE_RATES, DEFAULT_CO_DAY_HOURS } from "@/lib/changeOrderLaborRates";
import { DEFAULT_PAYROLL_RULES as PR } from "./payrollRules";
import { parseDated, valueOn, type Dated } from "./datedSettings";

export const SETTINGS_TABS = [
  { id: "pricing", label: "Pricing" },
  { id: "payroll", label: "Payroll" },
  { id: "commission", label: "Commission" },
  { id: "finance", label: "Finance" },
  { id: "subs", label: "Subs" },
  { id: "alerts", label: "Alerts" },
  { id: "lists", label: "Lists" },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

type Base = {
  key: string;
  tab: SettingsTab;
  label: string;
  /** InfoTip text: what it changes, in one or two sentences */
  info: string;
  /** Heading it sits under on its tab */
  section?: string;
};

export type NumberSettingDef = Base & {
  kind: "number";
  default: number;
  min: number;
  max: number;
  /** Shown after the box, e.g. "%" or "days" */
  unit: string;
  /** Shown before the box, e.g. "$" */
  prefix?: string;
  /** Whole numbers only */
  integer: boolean;
  /** An On/Off switch stored as 1/0 (min 0, max 1) */
  toggle?: boolean;
  /** Changes pay or commission: keeps a dated history and asks, on save, whether
   * it starts from a date or applies to everything. appliesTo names what the
   * date is compared to, e.g. "Pay weeks starting"; many and one name the thing. */
  dated?: { appliesTo: string; many: string; one: string };
};

export type DateSettingDef = Base & {
  kind: "date";
  default: string;
  /** Only Mondays are allowed */
  monday?: boolean;
};

export type SettingDef = NumberSettingDef | DateSettingDef;

export const CASH_FORECAST_TERMS_KEY = "cashForecastTermsDays";
export const CASH_FORECAST_TERMS_DEFAULT = 30;
export const CASH_FORECAST_TERMS_MAX = 120;
export const PAYROLL_ANCHOR_KEY = "payrollAnchor";

/** Payroll and commission keys, read together by loadPayrollRules (payrollRulesServer.ts). */
export const PAYROLL_KEYS = {
  otAfterHours: "otAfterHours",
  otPremiumPct: "otPremiumPct",
  yearHours: "salaryYearHours",
  breakAfterHours: "unpaidBreakAfterHours",
  breakMinutes: "unpaidBreakMinutes",
  lateEarlyMinutes: "clockLateEarlyMinutes",
  farFromBuildingMeters: "clockFarFromBuildingMeters",
  inactiveAfterMonths: "inactiveAfterMonths",
  safetyViolationLimit: "safetyViolationLimit",
  commissionTiers: "commissionTiers",
  acceleratorDollars: "commissionAcceleratorDollars",
  recurringYear1Pct: "recurringCommissionYear1Pct",
  recurringYear2Pct: "recurringCommissionYear2Pct",
} as const;

const PAY_WEEKS = { appliesTo: "Pay weeks starting", many: "pay weeks", one: "pay week" };
const WORK_DAYS = { appliesTo: "Work days from", many: "work days", one: "work day" };
const SHIFTS = { appliesTo: "Shifts from", many: "shifts", one: "shift" };
const DEALS = { appliesTo: "Deals finished from", many: "deals", one: "deal" };
const CONTRACT_MONTHS = { appliesTo: "Contract months starting", many: "contract months", one: "contract month" };

type PayrollNumber = Omit<NumberSettingDef, "kind" | "integer"> & { integer?: boolean };
const payrollNumber = (d: PayrollNumber): NumberSettingDef => ({ kind: "number", integer: false, ...d });

/** Pricing keys, read together by loadPricingSettings (pricingSettingsServer.ts). */
export const PRICING_KEYS = {
  nextDayPct: "nextDayUpchargePct",
  coPriceCleaner: "coPriceCleanerPerHour",
  coPriceSupervisor: "coPriceSupervisorPerHour",
  coCostCleaner: "coCostCleanerPerHour",
  coCostSupervisor: "coCostSupervisorPerHour",
  coDayHours: "coDayHours",
  janitorialSalesTaxPct: "janitorialSalesTaxPct",
  turnoverPackage: "standardTurnoverPrices",
  coPackage: "standardCoIssues",
} as const;

const rate = (key: string, label: string, info: string, dflt: number): NumberSettingDef => ({
  key,
  tab: "pricing",
  section: "Change orders",
  kind: "number",
  label,
  info,
  default: dflt,
  min: 0,
  max: 500,
  prefix: "$",
  unit: "/hr",
  integer: false,
});

/** Sub portal rules, read together by loadSubPortalSettings (subPortalSettingsServer.ts). */
export const SUB_PORTAL_KEYS = {
  checkInFarMeters: "subCheckInFarMeters",
  checkInGraceMinutes: "subCheckInGraceMinutes",
  turnoverBeforePhotos: "subPhotosBeforeTurnover",
  turnoverAfterPhotos: "subPhotosAfterTurnover",
  otherBeforePhotos: "subPhotosBeforeOther",
  otherAfterPhotos: "subPhotosAfterOther",
  qcBlocksBilling: "subQcBlocksBilling",
} as const;

const photoMin = (key: string, label: string, info: string): NumberSettingDef => ({
  key,
  tab: "subs",
  section: "Before and after photos",
  kind: "number",
  label,
  info,
  default: 2,
  min: 0,
  max: 20,
  unit: "photos",
  integer: true,
});

const SUB_PORTAL_DEFS: NumberSettingDef[] = [
  {
    key: SUB_PORTAL_KEYS.checkInFarMeters,
    tab: "subs",
    section: "Check-in and check-out",
    kind: "number",
    label: "Flag check-ins farther than this from the job",
    info: "A sub checking in or out this far from the job's address still saves, but shows Off site on the day card. 400 meters is about a quarter mile. The phone's own GPS accuracy is allowed for.",
    default: 400,
    min: 50,
    max: 10000,
    unit: "meters",
    integer: true,
  },
  {
    key: SUB_PORTAL_KEYS.checkInGraceMinutes,
    tab: "subs",
    section: "Check-in and check-out",
    kind: "number",
    label: "Grace window after the start time",
    info: "A sub running a day who hasn't checked in this long after its start time gets the Sub hasn't checked in email to the day's PM. Checking in later than this shows Late on the day card. Days with no start time are never late.",
    default: 15,
    min: 0,
    max: 240,
    unit: "minutes",
    integer: true,
  },
  photoMin(
    SUB_PORTAL_KEYS.turnoverBeforePhotos,
    "Turnovers: before photos needed to check out",
    "The sub running a turnover day can't check out until they've taken this many before photos. A PM, Business Manager or Admin can let them check out without. 0 turns it off.",
  ),
  photoMin(
    SUB_PORTAL_KEYS.turnoverAfterPhotos,
    "Turnovers: after photos needed to check out",
    "The sub running a turnover day can't check out until they've taken this many after photos. 0 turns it off.",
  ),
  photoMin(
    SUB_PORTAL_KEYS.otherBeforePhotos,
    "Post-construction and other jobs: before photos needed",
    "Same rule for every job that isn't a turnover unit, change order days included. 0 turns it off.",
  ),
  {
    key: SUB_PORTAL_KEYS.qcBlocksBilling,
    tab: "subs",
    section: "Quality check",
    kind: "number",
    toggle: true,
    label: "Quality check must pass before billing",
    info: "When on, a job can't be marked Billed while a sub's day on it is waiting for review or needs fixes (Sub Reviews). Off: billing never waits on it.",
    default: 0,
    min: 0,
    max: 1,
    unit: "",
    integer: true,
  },
  photoMin(
    SUB_PORTAL_KEYS.otherAfterPhotos,
    "Post-construction and other jobs: after photos needed",
    "Same rule for every job that isn't a turnover unit, change order days included. 0 turns it off.",
  ),
];

/** Alert timing and dashboard limits, read together by loadAlertSettings (alertSettingsServer.ts). */
export const ALERT_KEYS = {
  budgetWatchPct: "alertBudgetWatchPct",
  coStaleDays: "alertCoStaleDays",
  bidsDueWindowDays: "alertBidsDueWindowDays",
  bidsUrgentDays: "alertBidsUrgentDays",
  jobStaleDays: "alertJobStaleDays",
  billingCutoffRemindDays: "alertBillingCutoffRemindDays",
  janitorialDraftLeadDays: "alertJanitorialDraftLeadDays",
  dealsClosedDays: "alertDealsClosedDays",
  dealsCleanupDays: "alertDealsCleanupDays",
  payrollLagDays: "alertPayrollLagDays",
  sovMismatchDollars: "alertSovMismatchDollars",
} as const;

const alert = (key: string, section: string, label: string, info: string, dflt: number, min: number, max: number, unit: string, prefix?: string): NumberSettingDef => ({
  key,
  tab: "alerts",
  section,
  kind: "number",
  label,
  info,
  default: dflt,
  min,
  max,
  unit,
  integer: true,
  ...(prefix ? { prefix } : {}),
});

const ALERT_DEFS: NumberSettingDef[] = [
  alert(ALERT_KEYS.budgetWatchPct, "Jobs", "Flag a job when it has used this much of its budget", "Active jobs past this share of their estimated cost show amber on the dashboard's Jobs card and in Over budget. Past 100% shows red.", 80, 1, 100, "%"),
  alert(ALERT_KEYS.coStaleDays, "Jobs", "Flag change orders waiting longer than", "Change orders still in Draft or Submitted after this many days show in the dashboard's Waiting on us list.", 3, 1, 60, "days"),
  alert(ALERT_KEYS.jobStaleDays, "Jobs", "Flag active jobs with no work logged for", "Finance dashboard: an Active job with no labor logged this long is called out as possibly stale.", 60, 7, 365, "days"),
  alert(ALERT_KEYS.bidsDueWindowDays, "Sales and estimating", "Show bid dates coming up in the next", "The dashboard's upcoming bids list shows bid due dates, job walks and award dates this far ahead.", 30, 1, 180, "days"),
  alert(ALERT_KEYS.bidsUrgentDays, "Sales and estimating", "Mark bids urgent when due within", "Bids due this soon are marked urgent and counted in the red number on the tab.", 3, 1, 30, "days"),
  alert(ALERT_KEYS.dealsClosedDays, "Sales and estimating", "Deals board shows won and lost deals from the last", "Older closed deals are hidden on the Deals board unless All is picked.", 90, 7, 730, "days"),
  alert(ALERT_KEYS.dealsCleanupDays, "Sales and estimating", "Suggest closing out a deal after it sits in a stage for", "Deals in the same stage this long get a clean-up flag on the Deals board.", 180, 14, 1000, "days"),
  alert(ALERT_KEYS.billingCutoffRemindDays, "Billing", "Remind the PM this many days before a billing cutoff", "Days before a job's billing cutoff that the PM gets the reminder email to update progress.", 5, 1, 30, "days"),
  alert(ALERT_KEYS.janitorialDraftLeadDays, "Billing", "Draft janitorial invoices this many days before the billing day", "A janitorial contract's monthly invoice draft shows on Ready to send this many days before its billing day.", 3, 0, 28, "days"),
  alert(ALERT_KEYS.sovMismatchDollars, "Billing", "Flag a schedule of values that differs from the contract by more than", "Finance dashboard: jobs whose SOV lines add up to more than this away from the contract value are listed to fix.", 1000, 1, 1_000_000, "", "$"),
  alert(ALERT_KEYS.payrollLagDays, "Cash forecast", "Payroll is paid this many days after a pay period ends", "Used by the dashboard cash forecast to place payroll on the right week.", 5, 0, 21, "days"),
];

export const SETTINGS: SettingDef[] = [
  {
    key: PRICING_KEYS.nextDayPct,
    tab: "pricing",
    section: "Next day upcharge",
    kind: "number",
    label: "Extra for work starting today or tomorrow",
    info: "Added to turnover and change order prices when the work starts today or tomorrow: on online requests by itself, and by a checkbox when the office creates the job. Also the Next day surcharge on sub change order requests. Jobs already priced keep their price.",
    default: DEFAULT_NEXT_DAY_UPCHARGE_PERCENT,
    min: 0,
    max: 100,
    unit: "%",
    integer: false,
  },
  rate(
    PRICING_KEYS.coPriceCleaner,
    "What we charge per cleaner hour",
    "Change order price for each cleaner hour, for projects without their own rate. A project can set its own on its Change orders tab.",
    DEFAULT_CO_PRICE_RATES.cleanerHourlyRateCents / 100,
  ),
  rate(
    PRICING_KEYS.coPriceSupervisor,
    "What we charge per supervisor hour",
    "Change order price for each supervisor hour, for projects without their own rate. A project can set its own on its Change orders tab.",
    DEFAULT_CO_PRICE_RATES.foremanHourlyRateCents / 100,
  ),
  rate(
    PRICING_KEYS.coCostCleaner,
    "What we pay per cleaner hour",
    "The real wage, used for a change order's Est. Labor $ (what the work costs us). Not shown to clients.",
    DEFAULT_CO_COST_RATES.cleanerHourlyRateCents / 100,
  ),
  rate(
    PRICING_KEYS.coCostSupervisor,
    "What we pay per supervisor hour",
    "The real wage, used for a change order's Est. Labor $ (what the work costs us). Not shown to clients.",
    DEFAULT_CO_COST_RATES.foremanHourlyRateCents / 100,
  ),
  {
    key: PRICING_KEYS.coDayHours,
    tab: "pricing",
    section: "Change orders",
    kind: "number",
    label: "Hours in a change order work day",
    info: "Change order prices assume each person works this many hours a day, times the days in the planned range.",
    default: DEFAULT_CO_DAY_HOURS,
    min: 1,
    max: 24,
    unit: "hours",
    integer: false,
  },
  {
    key: PRICING_KEYS.janitorialSalesTaxPct,
    tab: "pricing",
    section: "Janitorial contracts",
    kind: "number",
    label: "Sales tax on new contract pricing",
    info: "The sales tax a new janitorial contract's price calculator starts with. Each contract can change its own.",
    default: DEFAULT_SALES_TAX_PCT,
    min: 0,
    max: 25,
    unit: "%",
    integer: false,
  },
  {
    key: PAYROLL_ANCHOR_KEY,
    tab: "payroll",
    section: "Pay periods and benefits",
    kind: "date",
    monday: true,
    label: "Pay periods start on",
    info: "Any Monday that starts a pay period. Pay periods are two weeks long, counted from this day. Changing it moves every pay period, past ones too, so only change it if the pay schedule really changed.",
    default: DEFAULT_PAYROLL_ANCHOR,
  },
  {
    key: HEALTH_SHARE_SETTING_KEY,
    tab: "payroll",
    section: "Pay periods and benefits",
    kind: "number",
    label: "Sueep pays this share of health premiums",
    info: "The part of each health insurance premium the company pays. Used for health costs on Payroll and the Finance dashboard. The rest is what employees pay.",
    default: DEFAULT_HEALTH_SHARE_PCT,
    min: 0,
    max: 100,
    unit: "%",
    integer: false,
  },
  payrollNumber({
    key: PAYROLL_KEYS.otAfterHours,
    tab: "payroll",
    section: "Overtime and salary",
    label: "Overtime after this many hours a week",
    info: "Hourly workers get overtime pay for hours past this in a Monday to Sunday week, counting all their jobs together.",
    default: valueOn(PR.otAfterHours, ""),
    min: 1,
    max: 80,
    unit: "hours",
    dated: PAY_WEEKS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.otPremiumPct,
    tab: "payroll",
    section: "Overtime and salary",
    label: "Overtime pays this much extra",
    info: "On top of the regular rate for each overtime hour. 50% is time and a half.",
    default: valueOn(PR.otPremium, "") * 100,
    min: 0,
    max: 200,
    unit: "%",
    dated: PAY_WEEKS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.yearHours,
    tab: "payroll",
    section: "Overtime and salary",
    label: "Hours in a work year",
    info: "Turns a yearly salary or offshore monthly pay into an hourly cost for job costing. 2080 is 40 hours times 52 weeks.",
    default: valueOn(PR.yearHours, ""),
    min: 1000,
    max: 4000,
    unit: "hours",
    integer: true,
    dated: WORK_DAYS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.breakAfterHours,
    tab: "payroll",
    section: "Janitorial clock-in",
    label: "Unpaid break on shifts this long",
    info: "Janitorial shifts of this many hours or more have the unpaid break taken out of the hours paid.",
    default: valueOn(PR.breakAfterHours, ""),
    min: 1,
    max: 24,
    unit: "hours",
    dated: SHIFTS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.breakMinutes,
    tab: "payroll",
    section: "Janitorial clock-in",
    label: "Unpaid break length",
    info: "Taken out of a long janitorial shift's paid hours. 0 turns the unpaid break off.",
    default: valueOn(PR.breakMinutes, ""),
    min: 0,
    max: 120,
    unit: "minutes",
    integer: true,
    dated: SHIFTS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.lateEarlyMinutes,
    tab: "payroll",
    section: "Janitorial clock-in",
    label: "Flag clock-ins this many minutes off",
    info: "Clocking in late, or leaving early or late, by more than this gets a flag on the hours review. Flags only, pay doesn't change.",
    default: PR.lateEarlyMinutes,
    min: 1,
    max: 240,
    unit: "minutes",
    integer: true,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.farFromBuildingMeters,
    tab: "payroll",
    section: "Janitorial clock-in",
    label: "Flag clock-ins farther than this from the building",
    info: "Clocking in or out this far from the building gets a flag on the hours review. 400 meters is about a quarter mile. Flags only, pay doesn't change.",
    default: PR.farFromBuildingMeters,
    min: 50,
    max: 10000,
    unit: "meters",
    integer: true,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.inactiveAfterMonths,
    tab: "payroll",
    section: "Employees and safety",
    label: "Mark employees inactive after this many months",
    info: "An employee with no hours logged for this long is set to Inactive by the nightly check.",
    default: PR.inactiveAfterMonths,
    min: 1,
    max: 36,
    unit: "months",
    integer: true,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.safetyViolationLimit,
    tab: "payroll",
    section: "Employees and safety",
    label: "Escalate a worker after this many safety violations",
    info: "When a worker reaches this many failed safety checks, the Safety escalation email goes out (who gets it is on Email Settings).",
    default: PR.safetyViolationLimit,
    min: 1,
    max: 20,
    unit: "violations",
    integer: true,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.acceleratorDollars,
    tab: "commission",
    section: "One-time deals",
    label: "Accelerator rate starts after this much revenue in a year",
    info: "Once a rep's revenue for the calendar year passes this, the rest of the year earns the accelerator rate in the tiers above. Recurring contract billing counts toward it.",
    default: valueOn(PR.acceleratorCents, "") / 100,
    min: 0,
    max: 100_000_000,
    prefix: "$",
    unit: "",
    integer: true,
    dated: DEALS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.recurringYear1Pct,
    tab: "commission",
    section: "Recurring janitorial contracts",
    label: "Months 1 to 12 of a contract",
    info: "Commission on each paid month of a recurring contract's first year, as a percent of that month's amount.",
    default: valueOn(PR.recurringYear1Rate, "") * 100,
    min: 0,
    max: 100,
    unit: "%",
    dated: CONTRACT_MONTHS,
  }),
  payrollNumber({
    key: PAYROLL_KEYS.recurringYear2Pct,
    tab: "commission",
    section: "Recurring janitorial contracts",
    label: "Months 13 to 24 of a contract",
    info: "Commission on each paid month of a recurring contract's second year. Nothing after month 24.",
    default: valueOn(PR.recurringYear2Rate, "") * 100,
    min: 0,
    max: 100,
    unit: "%",
    dated: CONTRACT_MONTHS,
  }),
  ...ALERT_DEFS,
  ...SUB_PORTAL_DEFS,
  {
    key: CASH_FORECAST_TERMS_KEY,
    tab: "finance",
    kind: "number",
    label: "Clients pay this many days after billing",
    info: "The cash forecast on the dashboard expects money from unbilled work and janitorial months this many days after they are billed.",
    default: CASH_FORECAST_TERMS_DEFAULT,
    min: 0,
    max: CASH_FORECAST_TERMS_MAX,
    unit: "days",
    integer: true,
  },
];

/** Settings with a bigger editor of their own (also on the Payroll page), opened from their tab. */
export const EDITOR_SETTINGS = [
  {
    id: "turnoverPrices",
    tab: "pricing",
    section: "Price lists",
    label: "Standard turnover prices",
    info: "Cleaning, painting and other prices per unit layout, for buildings without their own prices. A building's Pricing tab can set its own.",
  },
  {
    id: "coIssues",
    tab: "pricing",
    section: "Price lists",
    label: "Standard change order issues",
    info: "Issues a sub can pick when they request a change order on a turnover, with what we charge and what the sub gets. Used by buildings without their own list.",
  },
  {
    id: "commissionTiers",
    tab: "commission",
    section: "One-time deals",
    first: true,
    label: "Commission by margin",
    info: "What a rep earns on a one-time deal, as a percent of its contract value, by the deal's margin. Base rate until the rep's yearly revenue passes the amount below, accelerator rate after.",
  },
  {
    id: "employerTax",
    tab: "payroll",
    section: "Pay periods and benefits",
    label: "Employer tax rates",
    info: "Social Security, Medicare, unemployment and other employer tax rates and wage caps. Usually change once a year.",
  },
  {
    id: "health",
    tab: "payroll",
    section: "Pay periods and benefits",
    label: "Health insurance",
    info: "Who is on the company health plan and each person's monthly premium. Also on the Payroll page.",
  },
] as const satisfies readonly { id: string; tab: SettingsTab; section?: string; first?: boolean; label: string; info: string }[];
export type EditorSettingId = (typeof EDITOR_SETTINGS)[number]["id"];

/** History tab names for keys saved by those editors. */
export const OTHER_SETTING_LABELS: Record<string, string> = {
  employerTaxRates: "Employer tax rates",
  [PRICING_KEYS.turnoverPackage]: "Standard turnover prices",
  [PRICING_KEYS.coPackage]: "Standard change order issues",
  [PAYROLL_KEYS.commissionTiers]: "Commission tiers",
  "list.serviceTypes": "Service types list",
  "list.removalReasons": "Schedule removal reasons list",
  "list.hiringSources": "Hiring sources list",
  "list.janitorialRoles": "Janitorial roles list",
};

export function settingDef(key: string): SettingDef | undefined {
  return SETTINGS.find((s) => s.key === key);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The stored text as a value, or null when it isn't valid (so the default is used). */
export function parseSetting(def: NumberSettingDef, raw: string | null | undefined): number | null;
export function parseSetting(def: DateSettingDef, raw: string | null | undefined): string | null;
export function parseSetting(def: SettingDef, raw: string | null | undefined): number | string | null;
export function parseSetting(def: SettingDef, raw: string | null | undefined): number | string | null {
  if (raw == null || raw.trim() === "") return null;
  return "error" in checkSetting(def, raw) ? null : def.kind === "number" ? Number(raw) : raw.trim();
}

/** A dated number setting's stored history (see datedSettings.ts), with the default when nothing is saved. */
export function datedNumberHistory(def: NumberSettingDef, raw: string | null | undefined): Dated<number> {
  return parseDated(raw, (v) => ("error" in checkSetting(def, v) ? null : Number(v)), def.default);
}

/** Checks what someone typed. Returns the text to store, or a message to show. */
export function checkSetting(def: SettingDef, input: unknown): { value: string } | { error: string } {
  const text = String(input ?? "").trim();
  if (def.kind === "date") {
    const d = new Date(`${text}T00:00:00Z`);
    if (!DATE_KEY.test(text) || isNaN(d.getTime())) return { error: "Pick a date" };
    if (def.monday && d.getUTCDay() !== 1) return { error: "Pick a Monday" };
    return { value: text };
  }
  const n = Number(text);
  if (text === "" || !Number.isFinite(n)) return { error: "Type a number" };
  if (def.integer && !Number.isInteger(n)) return { error: "Use a whole number" };
  if (n < def.min || n > def.max) return { error: `Use ${formatSetting(def, def.min)} to ${formatSetting(def, def.max)}` };
  return { value: String(n) };
}

const dayText = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });

/** A dated setting's history for people to read: "40 hours before Dec 1, 2026 · 38 hours from Dec 1, 2026" */
export function datedHistoryText(def: SettingDef, history: Dated<number>): string {
  return history
    .map((e, i) => {
      const next = history[i + 1];
      const value = formatSetting(def, e.value);
      if (e.from == null) return next?.from ? `${value} before ${dayText(next.from)}` : value;
      return `${value} from ${dayText(e.from)}`;
    })
    .join(" · ");
}

/** A value for people to read, e.g. "25%", "30 days", "Mon, Jan 1, 2024". */
export function formatSetting(def: SettingDef, value: string | number): string {
  if (def.kind === "date") {
    const d = new Date(`${value}T00:00:00Z`);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (def.toggle) return Number(value) ? "On" : "Off";
  if (def.prefix === "$") {
    const digits = def.integer ? 0 : 2;
    return `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${def.unit}`;
  }
  return def.unit === "%" ? `${value}%` : `${value} ${def.unit}`;
}
