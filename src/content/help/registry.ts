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
    category: "Contracts",
    description: "How to upload a contract PDF and send it for signing through DocuSeal.",
    order: 1,
    component: UploadingAContract,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "projects/creating-a-project",
    title: "Creating a Project",
    category: "Projects",
    description: "How to manually create a new project in the ERP.",
    order: 1,
    component: CreatingAProject,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "projects/hubspot-sync",
    title: "HubSpot Sync",
    category: "Projects",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 6,
    component: HubSpotSync,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "turnover/creating-a-request",
    title: "Creating a Turnover Request",
    category: "Turnover",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 1,
    component: CreatingATurnoverRequest,
    roles: ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR"],
  },
  {
    slug: "sops/onboarding-new-employee",
    title: "Onboarding a New Employee",
    category: "SOPs",
    description: "Standard process for onboarding a new employee into the ERP.",
    order: 1,
    component: OnboardingNewEmployee,
    roles: ["ADMIN"],
  },
  {
    slug: "projects/creating-a-change-order",
    title: "Creating a Change Order",
    category: "Projects",
    description: "How to create a change order for a post-construction project in the ERP",
    order: 2,
    component: CreatingAChangeOrder,
    roles: ["ADMIN", "PROJECT_MANAGER", "ESTIMATION"],
  },
  {
    slug: "projects/projects-overview",
    title: "Projects Overview",
    category: "Projects",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 3,
    component: ProjectsOverview,
    roles: ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR", "ESTIMATION"],
  },
  {
    slug: "workers/labor-logs",
    title: "Inputting Labor Logs",
    category: "Workers",
    description: "How to enter, edit, and sort through labor logs on projects and change orders.",
    order: 2,
    component: InputtingLaborLogs,
    roles: ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-employees",
    title: "Adding and Managing Employees",
    category: "Workers",
    description: "How to enter employees into the system and manage their documentation",
    order: 1,
    component: AddingEmployees,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "projects/material-logs",
    title: "Logging Materials",
    category: "Projects",
    description: "How to log materials bought on projects",
    order: 5,
    component: MaterialsLog,
    roles: ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR"],
  },
  {
    slug: "workers/adding-contractors",
    title: "Adding Contractors",
    category: "Workers",
    description: "How to register contractors in our system to be added onto projects",
    order: 3,
    component: AddingContractors,
    roles: ["ADMIN", "PROJECT_MANAGER"],
  },
  {
    slug: "workers/logging-contractors",
    title: "Assigning Contractors to Projects",
    category: "Workers",
    description: "How to log contractors on projects much like you add laborers",
    order: 4,
    component: LoggingContractors,
    roles: ["ADMIN", "PROJECT_MANAGER", "SUPERVISOR"],
  },
];
