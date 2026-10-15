import type { ErpRole } from "../erpSession";

/**
 * Dashboard cards: which cards exist, which tab each sits on, and who sees
 * it. Only plain data here, so the Customize panel can use it in the
 * browser too. Each card's data loader lives in dashboardCardLoaders.ts.
 *
 * Rules (DASHBOARDS_PLAN.md):
 * - Every card lives on one of the card tabs below, never on the older
 *   Overview / Operations / Team tabs.
 * - At most MAX_CARDS_PER_TAB cards per tab for any role. A card with
 *   several lists uses inner tabs instead of adding cards.
 * - A tab with no visible cards for someone isn't shown to them.
 */

export const CARD_TABS = ["queue", "accuracy", "wins", "sales", "jobs", "money"] as const;
export type CardTab = (typeof CARD_TABS)[number];

export const CARD_TAB_LABELS: Record<CardTab, string> = {
  queue: "Queue",
  accuracy: "Accuracy",
  wins: "Wins",
  sales: "Sales",
  jobs: "Jobs",
  money: "Money",
};

export const MAX_CARDS_PER_TAB = 3;

export type DashboardCardDef = {
  id: string;
  title: string;
  tab: CardTab;
  roles: readonly ErpRole[];
  /** Helper text behind the card's "i" icon. */
  info: string;
  /** Takes the full width on large screens (charts, wide tables). */
  wide?: boolean;
};

/** Default order within a tab is the order listed here. */
export const DASHBOARD_CARDS: readonly DashboardCardDef[] = [
  // Estimation
  {
    id: "waiting-on-me",
    title: "Waiting on me",
    tab: "queue",
    roles: ["ESTIMATION"],
    info: "Open jobs missing a labor or material estimate, and turnovers with no price, oldest first. Red when the job starts within 7 days or already started. Change orders with no estimate are listed first on their tab.",
    wide: true,
  },
  {
    id: "estimate-accuracy",
    title: "Estimate accuracy",
    tab: "accuracy",
    roles: ["ESTIMATION"],
    info: [
      "Jobs marked complete that finished in the last 6 months.",
      "Turnovers compare hours, since nobody types an estimate for them. Hour budget = price x 50% / $19.50 an hour (the same budget as the Supervisor badges), vs every hour logged. A $150 turnover has about a 4 hr budget, so 10 hrs logged is 160% over.",
      "Post-con jobs compare dollars. Estimate = labor + material + travel estimates on the project. Actual = logged labor (with overtime), subs, materials and travel. Change orders are left out, since the estimate was for the original job.",
      "Within 5% either way is on target. By type adds up every budget and every actual in the group, so one tiny job can't swing it. Jobs with no estimate or no costs logged are skipped.",
      "Biggest misses: the 3 jobs per type that missed by the most. An estimate higher than the job's own price is flagged as a likely typo.",
    ].join("\n\n"),
  },
  {
    id: "pricing-check",
    title: "Pricing check",
    tab: "accuracy",
    roles: ["ESTIMATION"],
    info: [
      "Jobs marked complete that finished in the last 6 months.",
      "Average price per job and margin, both including change orders. Margin is weighted by job size, so bigger jobs count more. Under 15% shows red.",
      "Turnovers by size groups turnovers by bedrooms and bathrooms. Price per sq ft will come with the sq ft pricing update.",
    ].join("\n\n"),
  },
  {
    id: "win-rate",
    title: "Win rate and turnaround",
    tab: "wins",
    roles: ["ESTIMATION"],
    info: [
      "Live from HubSpot, post-construction and janitorial pipelines, refreshed hourly.",
      "Counts deals created in the last 90 days or 12 months, by the stage each is in today. Won: post-con at Quote Approved or later, janitorial at Active Turnovers or later. Lost: Deal Lost or Not Awarded. Anything else is open.",
      "Win rate = won / (won + lost). Open deals don't count until they're decided. By $ is the same using HubSpot deal amounts.",
      "Time to send a quote: median days from a deal being created to entering Quote Sent (post-con) or Proposal (janitorial).",
      "The 90-day view is deals that came in during those 90 days, not deals decided in them. A deal created 4 months ago and won last week is only in the 12-month view.",
    ].join("\n\n"),
  },
  // Sales
  {
    id: "contract-renewals",
    title: "Contract renewals",
    tab: "sales",
    roles: ["SALES"],
    info: "Open janitorial contracts by their renewal date, or their end date if one is set. Red when it's within 90 days or already past.",
  },
  {
    id: "my-commission",
    title: "My commission",
    tab: "sales",
    roles: ["SALES"],
    info: "Your deals, janitorial contract months and bid bonuses, the same numbers as the Commission tab on Payroll. Counted by the date each one became commissionable.",
  },
  // Jobs (Project Managers, Business Manager, Admin)
  {
    id: "job-status-board",
    title: "Job status board",
    tab: "jobs",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Every active job with its problems: past its end date, budget (turnovers use the same hour budget as the Supervisor dashboard, other jobs cost or hours vs the estimate), scheduled days in the last 14 with nothing logged, and COIs expired or expiring within 30 days.",
    wide: true,
  },
  {
    id: "waiting-on-others",
    title: "Waiting on others",
    tab: "jobs",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Property manager turnover requests, cancels and new dates nobody has answered. Change orders in Draft or Submitted over 3 days. Subs on the schedule in the next 14 days with no workers comp on file, or workers comp or liability that will have expired by their first day.",
  },
  {
    id: "crew-conflicts",
    title: "Crew conflicts",
    tab: "jobs",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Next 14 days. Double-booked: an employee on two different jobs the same day (subs can run more than one crew, so they aren't flagged). Time off: crew or supervisors scheduled on a day they have approved or requested time off.",
  },
  // Money (Project Managers, Business Manager, Admin)
  {
    id: "needs-action",
    title: "Needs action",
    tab: "money",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Overdue: open HubSpot invoices past their due date, counted once per invoice. Ready to bill: finished work still Not billed since Aug 1. Payroll: whether the last pay period is locked. Liens: steps due in the next 30 days.",
  },
  {
    id: "checks",
    title: "Checks",
    tab: "money",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Losing money: open jobs costing more than their price, or more than their estimate (change orders included). Reconciliation: HubSpot invoices not linked to anything in the ERP, and lines marked Billed over 7 days ago with no invoice linked, since Aug 1.",
  },
  {
    id: "cash-forecast",
    title: "Cash forecast",
    tab: "money",
    roles: ["PROJECT_MANAGER", "BUSINESS_MANAGER", "ADMIN"],
    info: "Next 8 weeks. In: open invoices by due date (overdue in week 1), work ready to bill and janitorial months paid after the payment terms. Out: payroll at its recent rate on each payday, commission owed, and subcontractors, materials, reimbursements and insurance at their recent rate. An estimate, not a bank balance.",
    wide: true,
  },
];

export function isCardTab(value: unknown): value is CardTab {
  return typeof value === "string" && (CARD_TABS as readonly string[]).includes(value);
}

export function cardById(id: string): DashboardCardDef | undefined {
  return DASHBOARD_CARDS.find((c) => c.id === id);
}

/** A person's saved layout, already cleaned (see dashboardPrefs.ts). */
export type DashboardLayoutPrefs = {
  hiddenCards: string[];
  cardOrder: Partial<Record<CardTab, string[]>>;
  startTab: string | null;
};

export const DEFAULT_LAYOUT_PREFS: DashboardLayoutPrefs = { hiddenCards: [], cardOrder: {}, startTab: null };

/** Every card on this tab the role can see, in default order, hidden ones included. */
export function roleCardsForTab(role: ErpRole, tab: CardTab, cards: readonly DashboardCardDef[] = DASHBOARD_CARDS): DashboardCardDef[] {
  return cards.filter((c) => c.tab === tab && c.roles.includes(role));
}

/** Saved order first (unknown or out-of-tab ids skipped), then any cards the
 * saved list doesn't mention, in default order. So a card added after
 * someone saved a layout still shows up, at the end. */
export function orderCards(defaults: DashboardCardDef[], savedOrder: string[] | undefined): DashboardCardDef[] {
  if (!savedOrder?.length) return defaults;
  const byId = new Map(defaults.map((c) => [c.id, c]));
  const out: DashboardCardDef[] = [];
  for (const id of savedOrder) {
    const card = byId.get(id);
    if (card) {
      out.push(card);
      byId.delete(id);
    }
  }
  return [...out, ...defaults.filter((c) => byId.has(c.id))];
}

/** The cards to render on a tab for this person: their order, minus hidden. */
export function cardsForTab(
  role: ErpRole,
  tab: CardTab,
  prefs: DashboardLayoutPrefs = DEFAULT_LAYOUT_PREFS,
  cards: readonly DashboardCardDef[] = DASHBOARD_CARDS,
): DashboardCardDef[] {
  const hidden = new Set(prefs.hiddenCards);
  return orderCards(roleCardsForTab(role, tab, cards), prefs.cardOrder[tab]).filter((c) => !hidden.has(c.id));
}

/** Card tabs this person sees, in CARD_TABS order. Empty tabs are left out. */
export function visibleCardTabs(
  role: ErpRole,
  prefs: DashboardLayoutPrefs = DEFAULT_LAYOUT_PREFS,
  cards: readonly DashboardCardDef[] = DASHBOARD_CARDS,
): CardTab[] {
  return CARD_TABS.filter((tab) => cardsForTab(role, tab, prefs, cards).length > 0);
}

/** Problems with a card list: duplicate ids, or a tab over the card limit for some role. */
export function dashboardCardProblems(cards: readonly DashboardCardDef[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of cards) {
    if (seen.has(c.id)) problems.push(`Duplicate dashboard card id "${c.id}"`);
    seen.add(c.id);
  }
  const roles = new Set(cards.flatMap((c) => c.roles));
  for (const role of roles) {
    for (const tab of CARD_TABS) {
      const n = roleCardsForTab(role, tab, cards).length;
      if (n > MAX_CARDS_PER_TAB) problems.push(`${role} has ${n} cards on the ${tab} tab (max ${MAX_CARDS_PER_TAB})`);
    }
  }
  return problems;
}

// Fail loudly the moment this module loads (dev server, build) instead of
// letting a tab quietly grow past the limit.
const problems = dashboardCardProblems(DASHBOARD_CARDS);
if (problems.length) throw new Error(`Dashboard cards: ${problems.join("; ")}`);
