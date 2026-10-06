import type { ComponentType } from "react";
import type { ErpRole } from "@/lib/erpSession";
import { UploadingAContract } from "./contracts/uploading-a-contract";
import { CreatingAProject } from "./projects/creating-a-project";
import { HubSpotSync } from "./projects/hubspot-sync";
import { CreatingATurnoverRequest } from "./turnover/creating-a-request";
import { OnboardingNewEmployee } from "./sops/onboarding-new-employee";
import {CreatingAChangeOrder} from "./projects/creating-a-change-order";
import { ProjectsOverview } from "./projects/projects-overview";
import { InputtingLaborLogs } from "./workers/labor-logs";
import { AddingEmployees } from "./workers/adding-employees";
import { MaterialsLog } from "./projects/material-logs";
import { AddingContractors } from "./workers/adding-contractors";
import { LoggingContractors } from "./workers/logging-contractors";
import { ScheduleCalendarOverview } from "./schedule/calendar-overview";
import { ManagementCalendar } from "./schedule/management-calendar";
import { NotificationsOverview } from "./notifications/notifications-overview";
import { CompensationOverview } from "./compensation/compensation-overview";
import { QualityChecks } from "./projects/quality-checks";
import { BillingOverview } from "./billing/billing-overview";
import { BuildingsOverview } from "./buildings/buildings-overview";
import { JanitorialContracts } from "./janitorial/janitorial-contracts";
import { JanitorialGettingStarted } from "./janitorial/getting-started";
import { FinanceDashboard } from "./finance/finance-dashboard";
import { InsuranceOverview } from "./insurance/insurance-overview";
import { CoiQuickStart } from "./insurance/coi-quick-start";
import { PropertyManagerLinks } from "./turnover/property-manager-links";

export type ArticleEntry = {
  slug: string;
  title: string;
  category: string;
  description: string;
  order: number;
  component: ComponentType;
  /** If set, only users whose role appears in this list can see this article. */
  roles?: ErpRole[];
};

export const registry: ArticleEntry[] = [
  {
    slug: "contracts/uploading-a-contract",
    title: "Uploading a Contract",
    category: "Projects",
    description: "How to upload a contract PDF and send it for signing through DocuSeal.",
    order: 6,
    component: UploadingAContract,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "projects/creating-a-project",
    title: "Creating a Project",
    category: "Projects",
    description: "How to manually create a new project in the ERP.",
    order: 2,
    component: CreatingAProject,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "projects/hubspot-sync",
    title: "HubSpot Sync",
    category: "Projects",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 7,
    component: HubSpotSync,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "turnover/creating-a-request",
    title: "Creating a Turnover Request",
    category: "Turnovers & Buildings",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 1,
    component: CreatingATurnoverRequest,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "sops/onboarding-new-employee",
    title: "Onboarding a New Employee",
    category: "People & Schedule",
    description: "Standard process for onboarding a new employee into the ERP.",
    order: 2,
    component: OnboardingNewEmployee,
    roles: ["ADMIN"],
  },
  {
    slug: "projects/creating-a-change-order",
    title: "Creating a Change Order",
    category: "Projects",
    description: "How to create a change order for a post-construction project in the ERP",
    order: 3,
    component: CreatingAChangeOrder,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "ESTIMATION"],
  },
  {
    slug: "projects/projects-overview",
    title: "Projects Overview",
    category: "Projects",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 1,
    component: ProjectsOverview,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/labor-logs",
    title: "Inputting Labor Logs",
    category: "People & Schedule",
    description: "How to enter, edit, and sort through labor logs on projects and change orders.",
    order: 3,
    component: InputtingLaborLogs,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-employees",
    title: "Adding and Managing Employees",
    category: "People & Schedule",
    description: "How to enter employees into the system and manage their documentation",
    order: 1,
    component: AddingEmployees,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "projects/material-logs",
    title: "Logging Materials",
    category: "Projects",
    description: "How to log materials bought on projects",
    order: 4,
    component: MaterialsLog,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "workers/adding-contractors",
    title: "Adding Contractors",
    category: "People & Schedule",
    description: "How to register contractors in our system to be added onto projects",
    order: 4,
    component: AddingContractors,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "workers/logging-contractors",
    title: "Assigning Contractors to Projects",
    category: "People & Schedule",
    description: "How to log contractors on projects much like you add laborers",
    order: 5,
    component: LoggingContractors,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES"],
  },
  {
    slug: "schedule/calendar-overview",
    title: "Using the Schedule Calendar",
    category: "People & Schedule",
    description: "How to read the calendar, filter it, and assign supervisors and workers to future days.",
    order: 6,
    component: ScheduleCalendarOverview,
  },
  {
    slug: "schedule/management-calendar",
    title: "Management Calendar",
    category: "People & Schedule",
    description: "Insurance expirations, time off, deadlines and your own events in one calendar, with email reminders.",
    order: 7,
    component: ManagementCalendar,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "notifications/notifications-overview",
    title: "Email Notifications",
    category: "People & Schedule",
    description: "Turn ERP and website emails on or off, change who gets them, and check the Email Log.",
    order: 8,
    component: NotificationsOverview,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "compensation/compensation-overview",
    title: "Compensation Overview",
    category: "Billing, Pay & Finance",
    description: "How Payroll, Offshore Payroll, Commission, Bids, and Reimbursements work.",
    order: 2,
    component: CompensationOverview,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "projects/quality-checks",
    title: "Quality Checks",
    category: "Projects",
    description: "How to create, view, and edit quality checks from a project's Quality Checks tab.",
    order: 5,
    component: QualityChecks,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "ESTIMATION", "SUPERVISOR"],
  },
  {
    slug: "billing/billing-overview",
    title: "Billing Overview",
    category: "Billing, Pay & Finance",
    description: "How to mark completed work billed and paid across Post-Construction, Janitorial, and Recurring, and resolve items in Needs Review.",
    order: 1,
    component: BillingOverview,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "turnover/property-manager-links",
    title: "Property Manager Links",
    category: "Turnovers & Buildings",
    description: "Give property managers a private turnover page, confirm requests from their page and the website form, and handle cancels and new dates.",
    order: 3,
    component: PropertyManagerLinks,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "buildings/buildings-overview",
    title: "Buildings Overview",
    category: "Turnovers & Buildings",
    description: "How to add a building, manage its units, log hours, and set its pricing package.",
    order: 2,
    component: BuildingsOverview,
  },
  {
    slug: "janitorial/getting-started",
    title: "Janitorial Contracts: Getting Started",
    category: "Janitorial Contracts",
    description: "The whole janitorial cycle step by step: set up a contract, schedule janitors, clock-in links, daily and weekly checks, payroll, and billing.",
    order: 1,
    component: JanitorialGettingStarted,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "janitorial/janitorial-contracts",
    title: "Janitorial Contracts",
    category: "Janitorial Contracts",
    description: "How to set up a recurring janitorial contract, schedule janitors, send clock-in links, review hours, and bill its months.",
    order: 2,
    component: JanitorialContracts,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "finance/finance-dashboard",
    title: "Finance Dashboard",
    category: "Billing, Pay & Finance",
    description: "What each number on the dashboard's Finance tab means and how it's calculated: revenue, costs, net profit, billed vs paid, and future revenue.",
    order: 3,
    component: FinanceDashboard,
    roles: ["ADMIN", "PROJECT_MANAGER", "FINANCE"],
  },
  {
    slug: "insurance/insurance-overview",
    title: "Insurance & COIs",
    category: "Insurance & COIs",
    description: "Our insurance policies, certificate holders, COI requests, and the COIs given out on each project.",
    order: 2,
    component: InsuranceOverview,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
  {
    slug: "insurance/coi-quick-start",
    title: "COI Quick Start",
    category: "Insurance & COIs",
    description: "A GC asks for a COI: the 5 steps, keeping COIs current, subs, and insurance words in plain English.",
    order: 1,
    component: CoiQuickStart,
    roles: ["ADMIN", "PROJECT_MANAGER", "SALES", "FINANCE"],
  },
];
