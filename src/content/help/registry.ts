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
import { SubRatingsAndBidders } from "./workers/sub-ratings-and-bidders";
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
import { HowInvoicingWorks } from "./billing/how-invoicing-works";
import { SendingInvoices } from "./billing/sending-invoices";
import { InvoicesAndPayments } from "./billing/invoices-and-payments";
import { QuickBooksSetup } from "./billing/quickbooks-setup";
import { BuildingsOverview } from "./buildings/buildings-overview";
import { JanitorialContracts } from "./janitorial/janitorial-contracts";
import { JanitorialGettingStarted } from "./janitorial/getting-started";
import { JanitorialSchedulingAndHours } from "./janitorial/scheduling-and-hours";
import { JanitorialQualityChecks } from "./janitorial/quality-checks";
import { FinanceDashboard } from "./finance/finance-dashboard";
import { InsuranceOverview } from "./insurance/insurance-overview";
import { CoiQuickStart } from "./insurance/coi-quick-start";
import { PropertyManagerLinks } from "./turnover/property-manager-links";
import { SubChangeOrders } from "./turnover/sub-change-orders";
import { CompanyInfoOverview } from "./company-info/company-info-overview";
import { CompaniesOverview } from "./companies/companies-overview";
import { RolesAndPermissions } from "./people/roles-and-permissions";
import { OfficeHiring } from "./people/office-hiring";
import { OfferLetters } from "./people/offer-letters";
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
    category: "Projects & Schedule",
    description: "How to upload a contract PDF and send it for signing through DocuSeal.",
    order: 3,
    component: UploadingAContract,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/creating-a-project",
    title: "Creating a Project",
    category: "Projects & Schedule",
    description: "How to manually create a new project in the ERP.",
    order: 2,
    component: CreatingAProject,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/hubspot-sync",
    title: "HubSpot Sync: How Deals Become Projects",
    category: "Projects & Schedule",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 8,
    component: HubSpotSync,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "turnover/creating-a-request",
    title: "Creating a Turnover Request",
    category: "Turnovers & Buildings",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 2,
    component: CreatingATurnoverRequest,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sops/onboarding-new-employee",
    title: "Onboarding a New Employee",
    category: "Team",
    description: "Standard process for onboarding a new employee into the ERP.",
    order: 2,
    component: OnboardingNewEmployee,
    roles: ["ADMIN"],
  },
  {
    slug: "projects/creating-a-change-order",
    title: "Creating a Change Order",
    category: "Projects & Schedule",
    description: "How to create a change order for a post-construction project in the ERP",
    order: 4,
    component: CreatingAChangeOrder,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "projects/projects-overview",
    title: "Projects Overview",
    category: "Projects & Schedule",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 1,
    component: ProjectsOverview,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/labor-logs",
    title: "Inputting Labor Logs",
    category: "Projects & Schedule",
    description: "How to enter, edit, and sort through labor logs on projects and change orders.",
    order: 11,
    component: InputtingLaborLogs,
    roles: [...PM_LEVEL_ROLES, "SALES", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-employees",
    title: "Adding and Managing Employees",
    category: "Team",
    description: "How to enter employees into the system and manage their documentation",
    order: 1,
    component: AddingEmployees,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/material-logs",
    title: "Logging Materials",
    category: "Projects & Schedule",
    description: "How to log materials bought on projects",
    order: 5,
    component: MaterialsLog,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/sub-proposals",
    title: "Sub Bids (Proposals)",
    category: "Projects & Schedule",
    description: "Log the bids subs give on a job on the Proposals tab and see the margin each one leaves us.",
    order: 7,
    component: SubProposals,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/adding-contractors",
    title: "Adding Contractors",
    category: "Team",
    description: "How to register contractors in our system to be added onto projects",
    order: 3,
    component: AddingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "workers/logging-contractors",
    title: "Assigning Contractors to Projects",
    category: "Team",
    description: "How to log contractors on projects much like you add laborers",
    order: 4,
    component: LoggingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "workers/sub-ratings-and-bidders",
    title: "Rating Subs and Bidders",
    category: "Team",
    description: "Star ratings for subs (confidence and pricing), the Bidders tab for subs without a profile, and moving their bids onto a new profile.",
    order: 5,
    component: SubRatingsAndBidders,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "people/roles-and-permissions",
    title: "Roles and Permissions: Who Can Do What",
    category: "Getting Started",
    description: "What each role can see and do, including the Business Manager.",
    order: 1,
    component: RolesAndPermissions,
  },
  {
    slug: "people/office-hiring",
    title: "Office Hiring (Recruitment)",
    category: "Team",
    description: "Office job openings, candidates, stages, and what job ads cost.",
    order: 6,
    component: OfficeHiring,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "people/offer-letters",
    title: "Offer Letters",
    category: "Team",
    description: "Offer letter templates, commission tables, sending a letter and recording the signed copy.",
    order: 7,
    component: OfferLetters,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "schedule/calendar-overview",
    title: "Using the Schedule Calendar",
    category: "Projects & Schedule",
    description: "How to read the calendar, filter it, and assign supervisors and workers to future days.",
    order: 9,
    component: ScheduleCalendarOverview,
  },
  {
    slug: "schedule/management-calendar",
    title: "Management Calendar",
    category: "Projects & Schedule",
    description: "Insurance expirations, time off, deadlines and your own events in one calendar, with email reminders.",
    order: 10,
    component: ManagementCalendar,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "notifications/my-notifications",
    title: "Your Notifications Inbox",
    category: "Getting Started",
    description: "Every ERP email sent to you in one list, with unread counts.",
    order: 2,
    component: MyNotifications,
  },
  {
    slug: "notifications/notifications-overview",
    title: "Email Settings and the Email Log",
    category: "Team",
    description: "Turn ERP and website emails on or off, change who gets them, and check the Email Log.",
    order: 9,
    component: NotificationsOverview,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "compensation/compensation-overview",
    title: "Compensation Overview",
    category: "Pay & Finance",
    description: "How Payroll, Offshore Payroll, Commission, Bids, and Reimbursements work.",
    order: 2,
    component: CompensationOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/quality-checks",
    title: "Project Quality Checks",
    category: "Projects & Schedule",
    description: "How to create, view, and edit quality checks from a project's Quality Checks tab.",
    order: 6,
    component: QualityChecks,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION", "SUPERVISOR"],
  },
  {
    slug: "billing/billing-overview",
    title: "Project Billing: Billed and Paid Status",
    category: "Billing",
    description: "The Project Billing page: finished work by tab, billing status, Bill it, filters, Billed via and lien deadlines.",
    order: 2,
    component: BillingOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "billing/ready-to-send",
    title: "Ready to Send: Drafting and Approving Invoices",
    category: "Billing",
    description: "Draft invoices from finished work and janitorial months, edit lines, approve them into QuickBooks, and turn on Auto-draft.",
    order: 3,
    component: ReadyToSendHelp,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "billing/how-invoicing-works",
    title: "Start Here: How Billing Works",
    category: "Billing",
    description: "The whole path from finished work to a paid invoice, which billing page does what, who can do what, and what each status means.",
    order: 1,
    component: HowInvoicingWorks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "billing/sending-invoices",
    title: "Sending Invoices: Email, Portals and Needs Sending",
    category: "Billing",
    description: "What happens after Approve: the invoice email, choosing recipients, portal uploads, and finishing the Needs sending list.",
    order: 4,
    component: SendingInvoices,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "billing/invoices-and-payments",
    title: "Invoices Page and Getting Paid",
    category: "Billing",
    description: "Find any invoice and its PDF, record payments so work turns Paid, chase overdue invoices, and fix invoices that need linking.",
    order: 5,
    component: InvoicesAndPayments,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "billing/quickbooks-setup",
    title: "QuickBooks Page and Invoice Setup",
    category: "Billing",
    description: "The QuickBooks connection and nightly sync, Invoice setup for customers and products, and the Money owed check.",
    order: 6,
    component: QuickBooksSetup,
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
    category: "Deals & Clients",
    description: "Client companies, how each wants to be billed, and where a building's or project's invoices go.",
    order: 4,
    component: CompaniesOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/win-loss",
    title: "Win/Loss and GC Scorecards",
    category: "Deals & Clients",
    description: "Post-construction win rates by quarter, GC and job size, why we lose, and stale quotes.",
    order: 3,
    component: WinLossHelp,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/pipeline-guide",
    title: "Deals Guide: Win More Jobs",
    category: "Deals & Clients",
    description: "Why we have the Deals board and what to do with it: a one-time clean up, the Monday routine, and what to do when a deal is lost.",
    order: 1,
    component: PipelineGuide,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "sales/pipeline-board",
    title: "Deals Board",
    category: "Deals & Clients",
    description: "Post-construction and janitorial HubSpot deals as cards by stage, with GC, dates, stale quotes and price flags.",
    order: 2,
    component: PipelineBoardHelp,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "buildings/buildings-overview",
    title: "Buildings Overview",
    category: "Turnovers & Buildings",
    description: "How to add a building, manage its units, log hours, and set its pricing package.",
    order: 1,
    component: BuildingsOverview,
  },
  {
    slug: "janitorial/getting-started",
    title: "Janitorial: Getting Started",
    category: "Janitorial Contracts",
    description: "The whole janitorial cycle in order, one short step each, plus quick answers for covers, holidays and missed clock-ins.",
    order: 1,
    component: JanitorialGettingStarted,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/janitorial-contracts",
    title: "Janitorial Contracts: Setup, Pricing and Billing",
    category: "Janitorial Contracts",
    description: "Create a contract, price it with the calculator, renew, pause or end it, and manage its billing months and profit.",
    order: 2,
    component: JanitorialContracts,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/scheduling-and-hours",
    title: "Janitorial Scheduling, Clock-In and Hours",
    category: "Janitorial Contracts",
    description: "Put janitors on the calendar, send clock-in links, watch the Today tab, and check hours before payroll.",
    order: 3,
    component: JanitorialSchedulingAndHours,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/quality-checks",
    title: "Janitorial Quality Checks",
    category: "Janitorial Contracts",
    description: "Schedule site visits, check each key area on your phone, and send the property manager a visit summary.",
    order: 4,
    component: JanitorialQualityChecks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "finance/finance-dashboard",
    title: "Finance Dashboard",
    category: "Pay & Finance",
    description: "What each number on the dashboard's Finance tab means and how it's calculated: revenue, costs, net profit, billed vs paid, and future revenue.",
    order: 1,
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
    category: "Team",
    description: "Our IDs, licenses, banking, financial statements, and website logins: where they live and how locked values work.",
    order: 8,
    component: CompanyInfoOverview,
    roles: [...PM_LEVEL_ROLES],
  },
];
