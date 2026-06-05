import type { ComponentType } from "react";
import { UploadingAContract } from "./contracts/uploading-a-contract";
import { CreatingAProject } from "./projects/creating-a-project";
import { HubSpotSync } from "./projects/hubspot-sync";
import { CreatingATurnoverRequest } from "./turnover/creating-a-request";
import { OnboardingNewEmployee } from "./sops/onboarding-new-employee";
import {CreatingAChangeOrder} from "./projects/creating-a-change-order";
import { ProjectsOverview } from "./projects/projects-overview";
import { InputtingLaborLogs } from "./projects/labor-logs";

export type ArticleEntry = {
  slug: string;
  title: string;
  category: string;
  description: string;
  order: number;
  component: ComponentType;
};

export const registry: ArticleEntry[] = [
  {
    slug: "contracts/uploading-a-contract",
    title: "Uploading a Contract",
    category: "Contracts",
    description: "How to upload a contract PDF and send it for signing through DocuSeal.",
    order: 1,
    component: UploadingAContract,
  },
  {
    slug: "projects/creating-a-project",
    title: "Creating a Project",
    category: "Projects",
    description: "How to manually create a new project in the ERP.",
    order: 1,
    component: CreatingAProject,
  },
  {
    slug: "projects/hubspot-sync",
    title: "HubSpot Sync",
    category: "Projects",
    description: "How HubSpot deals sync into the ERP and which fields are affected.",
    order: 5,
    component: HubSpotSync,
  },
  {
    slug: "turnover/creating-a-request",
    title: "Creating a Turnover Request",
    category: "Turnover",
    description: "How to create and manage a turnover or regular cleaning request.",
    order: 1,
    component: CreatingATurnoverRequest,
  },
  {
    slug: "sops/onboarding-new-employee",
    title: "Onboarding a New Employee",
    category: "SOPs",
    description: "Standard process for onboarding a new employee into the ERP.",
    order: 1,
    component: OnboardingNewEmployee,
  },
  {
    slug: "projects/creating-a-change-order",
    title: "Creating a Change Order",
    category: "Projects",
    description: "How to create a change order for a post-construction project in the ERP",
    order: 2,
    component: CreatingAChangeOrder,
  },
  {
    slug: "projects/projects-overview",
    title: "Projects Overview",
    category: "Projects",
    description: "Overview of the projects table, project details page, and editing projects.",
    order: 3,
    component: ProjectsOverview,

  },
  {
    slug: "projects/labor-logs",
    title: "Inputting Labor Logs",
    category: "Projects",
    description: "How to enter, edit, and sort through labor logs on projects and change orders",
    order: 4,
    component: InputtingLaborLogs,
  }
];
