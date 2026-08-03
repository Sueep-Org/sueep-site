"use client";

import { useState } from "react";
import { NewProjectForm } from "@/app/erp/(shell)/projects/new/NewProjectForm";

type Role = "property-manager" | null;

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

interface EmployeeOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface Props {
  buildings: BuildingOption[];
  scheduleBuildings: ScheduleBuildingOption[];
  employees: EmployeeOption[];
  janitorialPipelineId: string | null;
}

function RoleCard({
  onClick,
  icon,
  title,
  description,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-pink-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 sm:p-8"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-50 text-pink-600 transition group-hover:bg-pink-100">
        {icon}
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <div className="mt-auto flex items-center gap-1 text-sm font-medium text-pink-600">
        Get started
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 transition group-hover:translate-x-0.5">
          <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
    </button>
  );
}

export function JanitorialTurnoverGate({ buildings, scheduleBuildings, employees, janitorialPipelineId }: Props) {
  const [role, setRole] = useState<Role>(null);

  if (role === "property-manager") {
    return (
      <NewProjectForm
        initialBuildings={buildings}
        initialScheduleBuildings={scheduleBuildings}
        employees={employees}
        janitorialPipelineId={janitorialPipelineId}
        initialSegment="JANITORIAL_TURNOVER_REQUESTS"
        lockedSegment
        allowErpDataFetch={false}
        submitEndpoint="/api/janitorial-turnover-projects"
        successMessage="Your janitorial turnover request was submitted. The SUEEP PM has been notified."
        submitLabel="Submit turnover request"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-500">Step 1 of 1</p>
        <p className="mt-1 text-base font-semibold text-gray-900">What best describes your role?</p>
        <p className="mt-1 text-sm text-gray-500">We&apos;ll take you to the right form based on your answer.</p>
      </div>
      <div className="grid gap-4 sm:max-w-sm">
        <RoleCard
          onClick={() => setRole("property-manager")}
          title="Property Manager"
          description="I manage residential or commercial properties and need to schedule unit turnovers."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
