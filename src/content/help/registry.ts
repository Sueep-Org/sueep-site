import type { ComponentType } from "react";
import type { ErpRole } from "@/lib/erpSession";
import { PM_LEVEL_ROLES } from "@/lib/erpRoles";
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
import { SubProposals } from "./projects/sub-proposals";
import { AddingContractors } from "./workers/adding-contractors";
import { LoggingContractors } from "./workers/logging-contractors";
import { ScheduleCalendarOverview } from "./schedule/calendar-overview";
import { ManagementCalendar } from "./schedule/management-calendar";
import { NotificationsOverview } from "./notifications/notifications-overview";
import { MyNotifications } from "./notifications/my-notifications";
import { CompensationOverview } from "./compensation/compensation-overview";
import { QualityChecks } from "./projects/quality-checks";
import { BillingOverview } from "./billing/billing-overview";
import { ReadyToSendHelp } from "./billing/ready-to-send";
import { BuildingsOverview } from "./buildings/buildings-overview";
import { JanitorialContracts } from "./janitorial/janitorial-contracts";
import { JanitorialGettingStarted } from "./janitorial/getting-started";
import { FinanceDashboard } from "./finance/finance-dashboard";
import { InsuranceOverview } from "./insurance/insurance-overview";
import { CoiQuickStart } from "./insurance/coi-quick-start";
import { PropertyManagerLinks } from "./turnover/property-manager-links";
import { SubChangeOrders } from "./turnover/sub-change-orders";
import { CompanyInfoOverview } from "./company-info/company-info-overview";
import { CompaniesOverview } from "./companies/companies-overview";
import { RolesAndPermissions } from "./people/roles-and-permissions";
import { OfficeHiring } from "./people/office-hiring";
import { WinLossHelp } from "./sales/win-loss";
import { PipelineBoardHelp } from "./sales/pipeline-board";
import { PipelineGuide } from "./sales/pipeline-guide";

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
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/creating-a-project",
    title: "Creating a Project",
    category: "Projects",
    description: "How to manually create a new project in the ERP.",
    order: 2,
    component: CreatingAProject,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/hubspot-sync",
    title: "HubSpot Sync",
    category: "Projects",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 7,
    component: HubSpotSync,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "turnover/creating-a-request",
    title: "Creating a Turnover Request",
    category: "Turnovers & Buildings",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 1,
    component: CreatingATurnoverRequest,
    roles: [...PM_LEVEL_ROLES, "SALES"],
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
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "projects/projects-overview",
    title: "Projects Overview",
    category: "Projects",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 1,
    component: ProjectsOverview,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/labor-logs",
    title: "Inputting Labor Logs",
    category: "People & Schedule",
    description: "How to enter, edit, and sort through labor logs on projects and change orders.",
    order: 3,
    component: InputtingLaborLogs,
    roles: [...PM_LEVEL_ROLES, "SALES", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-employees",
    title: "Adding and Managing Employees",
    category: "People & Schedule",
    description: "How to enter employees into the system and manage their documentation",
    order: 1,
    component: AddingEmployees,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/material-logs",
    title: "Logging Materials",
    category: "Projects",
    description: "How to log materials bought on projects",
    order: 4,
    component: MaterialsLog,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/sub-proposals",
    title: "Sub Bids (Proposals)",
    category: "Projects",
    description: "Log the bids subs give on a job and see the margin each one leaves us.",
    order: 8,
    component: SubProposals,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/adding-contractors",
    title: "Adding Contractors",
    category: "People & Schedule",
    description: "How to register contractors in our system to be added onto projects",
    order: 4,
    component: AddingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "workers/logging-contractors",
    title: "Assigning Contractors to Projects",
    category: "People & Schedule",
    description: "How to log contractors on projects much like you add laborers",
    order: 5,
    component: LoggingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "people/roles-and-permissions",
    title: "Roles and Permissions",
    category: "People & Schedule",
    description: "What each role can see and do, including the Business Manager.",
    order: 0,
    component: RolesAndPermissions,
  },
  {
    slug: "people/office-hiring",
    title: "Office Hiring",
    category: "People & Schedule",
    description: "Office job openings, candidates, stages, and what job ads cost.",
    order: 2,
    component: OfficeHiring,
    roles: [...PM_LEVEL_ROLES],
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
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "notifications/my-notifications",
    title: "Your Notifications",
    category: "People & Schedule",
    description: "Every ERP email sent to you in one list, with unread counts.",
    order: 8,
    component: MyNotifications,
  },
  {
    slug: "notifications/notifications-overview",
    title: "Email Notifications",
    category: "People & Schedule",
    description: "Turn ERP and website emails on or off, change who gets them, and check the Email Log.",
    order: 8,
    component: NotificationsOverview,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "compensation/compensation-overview",
    title: "Compensation Overview",
    category: "Billing, Pay & Finance",
    description: "How Payroll, Offshore Payroll, Commission, Bids, and Reimbursements work.",
    order: 2,
    component: CompensationOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/quality-checks",
    title: "Quality Checks",
    category: "Projects",
    description: "How to create, view, and edit quality checks from a project's Quality Checks tab.",
    order: 5,
    component: QualityChecks,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION", "SUPERVISOR"],
  },
  {
    slug: "billing/billing-overview",
    title: "Billing Overview",
    category: "Billing, Pay & Finance",
    description: "How to mark completed work billed and paid across Post-Construction, Janitorial, and Recurring.",
    order: 1,
    component: BillingOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "billing/ready-to-send",
    title: "Ready to Send (Auto-Drafted Invoices)",
    category: "Billing, Pay & Finance",
    description: "Draft HubSpot invoices for janitorial months and finished work, then review, approve or discard them.",
    order: 2,
    component: ReadyToSendHelp,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "turnover/property-manager-links",
    title: "Property Manager Links",
    category: "Turnovers & Buildings",
    description: "Give property managers a private turnover page, confirm requests from their page and the website form, and handle cancels and new dates.",
    order: 3,
    component: PropertyManagerLinks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "turnover/sub-change-orders",
    title: "Sub Change Orders on Turnovers",
    category: "Turnovers & Buildings",
    description: "Subs ask for change orders from their schedule email with photos, property managers approve by email, and approved ones become change orders.",
    order: 4,
    component: SubChangeOrders,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "companies/companies-overview",
    title: "Companies and Billing Info",
    category: "Turnovers & Buildings",
    description: "Client companies, how each wants to be billed, and where a building's or project's invoices go.",
    order: 4,
    component: CompaniesOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/win-loss",
    title: "Win/Loss and GC Scorecards",
    category: "Projects",
    description: "Post-construction win rates by quarter, GC and job size, why we lose, and stale quotes.",
    order: 9,
    component: WinLossHelp,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/pipeline-guide",
    title: "Deals Guide: Win More Jobs",
    category: "Projects",
    description: "Why we have the Deals board and what to do with it: a one-time clean up, the Monday routine, and what to do when a deal is lost.",
    order: 10,
    component: PipelineGuide,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "sales/pipeline-board",
    title: "Deals Board",
    category: "Projects",
    description: "Post-construction and janitorial HubSpot deals as cards by stage, with GC, dates, stale quotes and price flags.",
    order: 11,
    component: PipelineBoardHelp,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
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
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/janitorial-contracts",
    title: "Janitorial Contracts",
    category: "Janitorial Contracts",
    description: "How to set up a recurring janitorial contract, schedule janitors, send clock-in links, review hours, and bill its months.",
    order: 2,
    component: JanitorialContracts,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "finance/finance-dashboard",
    title: "Finance Dashboard",
    category: "Billing, Pay & Finance",
    description: "What each number on the dashboard's Finance tab means and how it's calculated: revenue, costs, net profit, billed vs paid, and future revenue.",
    order: 3,
    component: FinanceDashboard,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "insurance/insurance-overview",
    title: "Insurance & COIs",
    category: "Insurance & COIs",
    description: "Our insurance policies, certificate holders, COI requests, and the COIs given out on each project.",
    order: 2,
    component: InsuranceOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "insurance/coi-quick-start",
    title: "COI Quick Start",
    category: "Insurance & COIs",
    description: "A GC asks for a COI: the 5 steps, keeping COIs current, subs, and insurance words in plain English.",
    order: 1,
    component: CoiQuickStart,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "company-info/company-info-overview",
    title: "Company Info",
    category: "Company Info",
    description: "Our IDs, licenses, banking, financial statements, and website logins: where they live and how locked values work.",
    order: 1,
    component: CompanyInfoOverview,
    roles: [...PM_LEVEL_ROLES],
  },
];
