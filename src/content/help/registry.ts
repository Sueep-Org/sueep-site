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
import { SubPortal } from "./workers/sub-portal";
import { AddingContractors } from "./workers/adding-contractors";
import { LoggingContractors } from "./workers/logging-contractors";
import { ScheduleCalendarOverview } from "./schedule/calendar-overview";
import { ManagementCalendar } from "./schedule/management-calendar";
import { NotificationsOverview } from "./notifications/notifications-overview";
import { MyNotifications } from "./notifications/my-notifications";
import { SettingsOverview } from "./settings/settings-overview";
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
import { AdSpend } from "./finance/ad-spend";
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
  /** Extra words people might search for: synonyms and terms from the article text. Searched with the title and description. */
  keywords?: string[];
  order: number;
  component: ComponentType;
  /** If set, only users whose role appears in this list can see this article. */
  roles?: ErpRole[];
};

export const registry: ArticleEntry[] = [
  {
    slug: "contracts/uploading-a-contract",
    keywords: ["docuseal", "sign", "signature", "e-sign", "pdf", "upload signed", "send for signing", "agreement"],
    title: "Uploading a Contract",
    category: "Projects & Schedule",
    description: "How to upload a contract PDF and send it for signing through DocuSeal.",
    order: 3,
    component: UploadingAContract,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/creating-a-project",
    keywords: ["new project", "create", "job", "manual", "segment", "post-construction", "painting", "cleaning"],
    title: "Creating a Project",
    category: "Projects & Schedule",
    description: "How to manually create a new project in the ERP.",
    order: 2,
    component: CreatingAProject,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/hubspot-sync",
    keywords: ["hubspot", "deal", "sync", "import", "closed lost", "missing project", "crm", "webhook"],
    title: "HubSpot Sync: How Deals Become Projects",
    category: "Projects & Schedule",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 8,
    component: HubSpotSync,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "turnover/creating-a-request",
    keywords: ["turnover", "unit", "unit turn", "move out", "scope", "new building", "checklist", "bedrooms", "work order"],
    title: "Creating a Turnover Request",
    category: "Turnovers & Buildings",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 2,
    component: CreatingATurnoverRequest,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sops/onboarding-new-employee",
    keywords: ["onboarding", "hire", "new hire", "paperwork", "i9", "w4", "candidate", "add employee", "documents"],
    title: "Onboarding a New Employee",
    category: "Team",
    description: "Standard process for onboarding a new employee into the ERP.",
    order: 2,
    component: OnboardingNewEmployee,
    roles: ["ADMIN"],
  },
  {
    slug: "projects/creating-a-change-order",
    keywords: ["change order", "co", "extra work", "add on", "udr", "pool", "grill", "reject", "void", "notify"],
    title: "Creating a Change Order",
    category: "Projects & Schedule",
    description: "How to create a change order for a post-construction project in the ERP",
    order: 4,
    component: CreatingAChangeOrder,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "projects/projects-overview",
    keywords: ["project page", "tabs", "overview", "financials", "safety checklist", "sov", "schedule of values", "client", "layout"],
    title: "Projects Overview",
    category: "Projects & Schedule",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 1,
    component: ProjectsOverview,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/labor-logs",
    keywords: ["labor", "hours", "clock in", "clock out", "timesheet", "time", "worker", "commute", "transportation", "log hours"],
    title: "Inputting Labor Logs",
    category: "Projects & Schedule",
    description: "How to enter, edit, and sort through labor logs on projects and change orders.",
    order: 11,
    component: InputtingLaborLogs,
    roles: [...PM_LEVEL_ROLES, "SALES", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-employees",
    keywords: ["employee", "new employee", "hourly", "salary", "pay rate", "time off", "pto", "vacation", "sick", "ssn", "documents", "language", "delete"],
    title: "Adding and Managing Employees",
    category: "Team",
    description: "How to enter employees into the system and manage their documentation",
    order: 1,
    component: AddingEmployees,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/material-logs",
    keywords: ["materials", "supplies", "paint", "cleaning products", "receipt", "cost", "expense"],
    title: "Logging Materials",
    category: "Projects & Schedule",
    description: "How to log materials bought on projects",
    order: 5,
    component: MaterialsLog,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/sub-proposals",
    keywords: ["bid", "bids", "proposal", "quote", "sub", "subcontractor", "margin", "awarded"],
    title: "Sub Bids (Proposals)",
    category: "Projects & Schedule",
    description: "Log the bids subs give on a job on the Proposals tab and see the margin each one leaves us.",
    order: 7,
    component: SubProposals,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/adding-contractors",
    keywords: ["contractor", "sub", "subcontractor", "w9", "insurance", "workers comp", "coi", "compliance", "background check", "language", "delete"],
    title: "Adding Contractors",
    category: "Team",
    description: "How to register contractors in our system to be added onto projects",
    order: 3,
    component: AddingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "workers/logging-contractors",
    keywords: ["contractor", "sub", "subcontractor", "cost", "contractor pay", "log"],
    title: "Assigning Contractors to Projects",
    category: "Team",
    description: "How to log contractors on projects much like you add laborers",
    order: 4,
    component: LoggingContractors,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "workers/sub-ratings-and-bidders",
    keywords: ["rating", "score", "stars", "bidder", "sub", "quality", "reliability", "confidence", "pricing score"],
    title: "Rating Subs and Bidders",
    category: "Team",
    description: "Star ratings for subs (confidence and pricing), the Bidders tab for subs without a profile, and moving their bids onto a new profile.",
    order: 5,
    component: SubRatingsAndBidders,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "workers/sub-portal",
    keywords: ["sub portal", "sub", "subcontractor", "job offer", "check in", "check out", "photos", "late", "off site", "spanish", "language", "fixes"],
    title: "The Sub Portal: Offers, Check-ins, Photos and Reviews",
    category: "Team",
    description: "Give a sub their jobs page, send job offers, what happens on the day (check-in, photos, check-out), reviewing their work, and the rules on Settings, Subs.",
    order: 6,
    component: SubPortal,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "people/roles-and-permissions",
    keywords: ["role", "permission", "access", "who can", "admin", "business manager", "supervisor", "sales", "estimation", "user"],
    title: "Roles and Permissions: Who Can Do What",
    category: "Getting Started",
    description: "What each role can see and do, including the Business Manager.",
    order: 1,
    component: RolesAndPermissions,
  },
  {
    slug: "people/office-hiring",
    keywords: ["hiring", "recruiting", "recruitment", "job opening", "job ad", "candidate", "interview", "office"],
    title: "Office Hiring (Recruitment)",
    category: "Team",
    description: "Office job openings, candidates, stages, and what job ads cost.",
    order: 6,
    component: OfficeHiring,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "people/offer-letters",
    keywords: ["offer letter", "offer", "template", "hire", "commission", "signed", "decline"],
    title: "Offer Letters",
    category: "Team",
    description: "Offer letter templates, commission tables, sending a letter and recording the signed copy.",
    order: 7,
    component: OfferLetters,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "schedule/calendar-overview",
    keywords: ["schedule", "calendar", "gantt", "assign", "crew", "reschedule", "drag", "supervisor", "job offer", "invite", "confirm"],
    title: "Using the Schedule Calendar",
    category: "Projects & Schedule",
    description: "How to read the calendar, filter it, and assign supervisors and workers to future days.",
    order: 9,
    component: ScheduleCalendarOverview,
  },
  {
    slug: "schedule/management-calendar",
    keywords: ["management calendar", "reminder", "expiring", "expiration", "bids", "billing cutoff", "time off", "pto", "birthday", "event", "due date"],
    title: "Management Calendar",
    category: "Projects & Schedule",
    description: "Insurance expirations, time off, deadlines and your own events in one calendar, with email reminders.",
    order: 10,
    component: ManagementCalendar,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "notifications/my-notifications",
    keywords: ["notifications", "inbox", "emails", "unread", "alerts"],
    title: "Your Notifications Inbox",
    category: "Getting Started",
    description: "Every ERP email sent to you in one list, with unread counts.",
    order: 2,
    component: MyNotifications,
  },
  {
    slug: "settings/settings-overview",
    keywords: ["settings", "rates", "prices", "pricing", "holidays", "upcharge", "commission rate", "payroll", "alerts", "lists", "dropdown", "default"],
    title: "Settings",
    category: "Team",
    description: "Change prices, payroll and commission rules, payment terms, and see who changed what.",
    order: 8,
    component: SettingsOverview,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "notifications/notifications-overview",
    keywords: ["email settings", "email", "recipients", "turn off email", "cc", "email log", "failed email", "resend", "backup pm"],
    title: "Email Settings and the Email Log",
    category: "Team",
    description: "Turn ERP and website emails on or off, change who gets them, and check the Email Log.",
    order: 9,
    component: NotificationsOverview,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "compensation/compensation-overview",
    keywords: ["payroll", "pay", "commission", "reimbursement", "offshore", "salary", "pay period", "add hours", "overtime", "paycheck"],
    title: "Compensation Overview",
    category: "Pay & Finance",
    description: "How Payroll, Offshore Payroll, Commission, Bids, and Reimbursements work.",
    order: 2,
    component: CompensationOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "projects/quality-checks",
    keywords: ["quality check", "inspection", "sign off", "signature", "evidence photos", "pm approval", "qc"],
    title: "Project Quality Checks",
    category: "Projects & Schedule",
    description: "How to create, view, and edit quality checks from a project's Quality Checks tab.",
    order: 6,
    component: QualityChecks,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION", "SUPERVISOR"],
  },
  {
    slug: "billing/billing-overview",
    keywords: ["billing", "project billing", "not billed", "billed", "paid", "void", "bill it", "lien", "csv", "export"],
    title: "Project Billing: Billed and Paid Status",
    category: "Billing",
    description: "The Project Billing page: finished work by tab, billing status, Bill it, filters, Billed via and lien deadlines.",
    order: 2,
    component: BillingOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "billing/ready-to-send",
    keywords: ["ready to send", "invoice", "draft", "approve", "auto-draft", "janitorial billing", "due date", "edit invoice", "switch", "hubspot backup"],
    title: "Ready to Send: Drafting and Approving Invoices",
    category: "Billing",
    description: "Draft invoices from finished work and janitorial months, edit lines, approve them into QuickBooks, and set up Auto-draft on janitorial contracts.",
    order: 3,
    component: ReadyToSendHelp,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "billing/how-invoicing-works",
    keywords: ["invoice", "invoicing", "billing", "steps", "statuses", "who can", "overview", "hubspot backup"],
    title: "Start Here: How Billing Works",
    category: "Billing",
    description: "The whole path from finished work to a paid invoice, which billing page does what, who can do what, and what each status means.",
    order: 1,
    component: HowInvoicingWorks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "billing/sending-invoices",
    keywords: ["send invoice", "email invoice", "portal", "procore", "coupa", "upload", "needs sending", "recipients", "cutoff", "pay app", "resubmit"],
    title: "Sending Invoices: Email, Portals and Needs Sending",
    category: "Billing",
    description: "What happens after Approve: the invoice email, recipients, portal uploads with proof, the pay app, portal status, sent back and resubmit, and cutoff warnings.",
    order: 4,
    component: SendingInvoices,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "billing/invoices-and-payments",
    keywords: ["invoices", "payment", "paid", "unpaid", "overdue", "follow up", "short pay", "retainage", "collections", "ar", "accounts receivable"],
    title: "Invoices Page and Getting Paid",
    category: "Billing",
    description: "Find any invoice, its PDF and History, record payments so work turns Paid, log follow-ups, explain short pays, and fix invoices that need linking.",
    order: 5,
    component: InvoicesAndPayments,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "billing/quickbooks-setup",
    keywords: ["quickbooks", "qbo", "connect", "reconnect", "sync", "customer", "products", "money owed", "month close", "accounting"],
    title: "QuickBooks Page and Invoice Setup",
    category: "Billing",
    description: "The QuickBooks connection and nightly sync, Invoice setup for customers and products, and the Money owed check.",
    order: 6,
    component: QuickBooksSetup,
    roles: ["ADMIN", "BUSINESS_MANAGER"],
  },
  {
    slug: "turnover/property-manager-links",
    keywords: ["property manager", "pm portal", "private link", "turnover request", "weekly email", "monday email", "book", "cancel"],
    title: "Property Manager Links",
    category: "Turnovers & Buildings",
    description: "Give property managers a private turnover page, confirm requests from their page and the website form, and handle cancels and new dates.",
    order: 3,
    component: PropertyManagerLinks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "turnover/sub-change-orders",
    keywords: ["sub change order", "co request", "property manager approval", "approve", "deny", "surcharge", "sub pay"],
    title: "Sub Change Orders on Turnovers",
    category: "Turnovers & Buildings",
    description: "Subs ask for change orders from their schedule email with photos, property managers approve by email, and approved ones become change orders.",
    order: 4,
    component: SubChangeOrders,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "companies/companies-overview",
    keywords: ["company", "client", "gc", "general contractor", "billing contact", "invoice recipients", "portal login", "procore", "password", "contacts"],
    title: "Companies and Billing Info",
    category: "Deals & Clients",
    description: "Client companies, how each wants to be billed, and where a building's or project's invoices go.",
    order: 4,
    component: CompaniesOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/win-loss",
    keywords: ["win", "loss", "win rate", "lost", "why we lose", "gc scorecard", "price", "sq ft", "report"],
    title: "Win/Loss and GC Scorecards",
    category: "Deals & Clients",
    description: "Post-construction win rates by quarter, GC and job size, why we lose, and stale quotes.",
    order: 3,
    component: WinLossHelp,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "sales/pipeline-guide",
    keywords: ["deals", "pipeline", "sales", "follow up", "next step", "lost reason", "job walk", "weekly", "process"],
    title: "Deals Guide: Win More Jobs",
    category: "Deals & Clients",
    description: "Why we have the Deals board and what to do with it: a one-time clean up, the Monday routine, and what to do when a deal is lost.",
    order: 1,
    component: PipelineGuide,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "sales/pipeline-board",
    keywords: ["deals", "pipeline", "board", "hubspot", "stage", "forecast", "new deal", "mark lost", "clone", "filters"],
    title: "Deals Board",
    category: "Deals & Clients",
    description: "Post-construction and janitorial HubSpot deals as cards by stage, with GC, dates, stale quotes and price flags.",
    order: 2,
    component: PipelineBoardHelp,
    roles: [...PM_LEVEL_ROLES, "SALES", "ESTIMATION"],
  },
  {
    slug: "buildings/buildings-overview",
    keywords: ["building", "property", "units", "pricing package", "property manager", "building contact", "log hours", "address"],
    title: "Buildings Overview",
    category: "Turnovers & Buildings",
    description: "How to add a building, manage its units, log hours, and set its pricing package.",
    order: 1,
    component: BuildingsOverview,
  },
  {
    slug: "janitorial/getting-started",
    keywords: ["janitorial", "janitor", "recurring", "contract", "clock in", "start here", "monthly"],
    title: "Janitorial: Getting Started",
    category: "Janitorial",
    description: "The whole janitorial cycle in order, one short step each, plus quick answers for covers, holidays and missed clock-ins.",
    order: 1,
    component: JanitorialGettingStarted,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/janitorial-contracts",
    keywords: ["janitorial contract", "recurring", "monthly price", "renew", "expiration", "pricing calculator", "profit", "auto-draft", "pause", "end contract"],
    title: "Janitorial Contracts: Setup, Pricing and Billing",
    category: "Janitorial",
    description: "Create a contract, price it with the calculator, renew, pause or end it, and manage its billing months and profit.",
    order: 2,
    component: JanitorialContracts,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/scheduling-and-hours",
    keywords: ["janitor", "shift", "schedule", "clock in", "clock in link", "hours", "today", "late", "location", "gps", "timesheet"],
    title: "Janitorial Scheduling, Clock-In and Hours",
    category: "Janitorial",
    description: "Put janitors on the calendar, send clock-in links, watch the Today tab, and check hours before payroll.",
    order: 3,
    component: JanitorialSchedulingAndHours,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "janitorial/quality-checks",
    keywords: ["janitorial quality", "site visit", "inspection", "key areas", "visit summary", "needs attention"],
    title: "Janitorial Quality Checks",
    category: "Janitorial",
    description: "Schedule site visits, check each key area on your phone, and send the property manager a visit summary.",
    order: 4,
    component: JanitorialQualityChecks,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "finance/finance-dashboard",
    keywords: ["finance", "dashboard", "revenue", "costs", "profit", "net profit", "margin", "p&l", "overhead", "budget", "report"],
    title: "Finance Dashboard",
    category: "Pay & Finance",
    description: "What each number on the dashboard's Finance tab means and how it's calculated: revenue, costs, net profit, billed vs paid, and future revenue.",
    order: 1,
    component: FinanceDashboard,
    roles: [...PM_LEVEL_ROLES],
  },
  {
    slug: "finance/ad-spend",
    keywords: ["ads", "ad spend", "meta", "facebook", "instagram", "marketing", "leads", "cost per lead", "campaign"],
    title: "Ad Spend (Facebook & Instagram)",
    category: "Pay & Finance",
    description: "What we spend on Meta ads, cost per lead by campaign and month, picking dates, and how it lines up with QuickBooks.",
    order: 2,
    component: AdSpend,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "insurance/insurance-overview",
    keywords: ["insurance", "policy", "policies", "certificate holder", "coi", "renewal", "umbrella", "coverage", "expiring"],
    title: "Insurance & COIs",
    category: "Insurance & COIs",
    description: "Our insurance policies, certificate holders, COI requests, and the COIs given out on each project.",
    order: 2,
    component: InsuranceOverview,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "insurance/coi-quick-start",
    keywords: ["coi", "certificate of insurance", "coverdash", "gc request", "insurance certificate", "additional insured", "how to"],
    title: "COI Quick Start",
    category: "Insurance & COIs",
    description: "A GC asks for a COI: the 5 steps, keeping COIs current, subs, and insurance words in plain English.",
    order: 1,
    component: CoiQuickStart,
    roles: [...PM_LEVEL_ROLES, "SALES"],
  },
  {
    slug: "company-info/company-info-overview",
    keywords: ["sueep info", "company info", "tax id", "ein", "license", "logins", "password", "bank", "encrypted", "access log", "expiration"],
    title: "Sueep Info",
    category: "Team",
    description: "Our IDs, licenses, banking, financial statements, and website logins: where they live and how locked values work.",
    order: 8,
    component: CompanyInfoOverview,
    roles: [...PM_LEVEL_ROLES],
  },
];
