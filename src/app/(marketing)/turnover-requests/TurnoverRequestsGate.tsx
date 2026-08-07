"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PropertyManagerForm, type BuildingOption } from "./PropertyManagerForm";
import { ProjectManagerForm } from "./ProjectManagerForm";

type Role = "property-manager" | "project-manager" | null;

const ROLE_VALUES: NonNullable<Role>[] = ["property-manager", "project-manager"];

function parseRole(value: string | null): Role {
  return ROLE_VALUES.includes(value as NonNullable<Role>) ? (value as NonNullable<Role>) : null;
}

interface Props {
  buildings: BuildingOption[];
}

function RoleCard({
  onClick,
  icon,
  title,
  requestType,
  description,
  badge,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  requestType: string;
  description: React.ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-[#E73C6E] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E73C6E] sm:p-8"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-[#E73C6E] transition group-hover:bg-pink-100">
          {icon}
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <span className="mt-1.5 inline-block rounded-full bg-[#E73C6E]/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#E73C6E]">
          Submits a {requestType}
        </span>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </div>
      <div className="mt-auto flex items-center gap-1 text-sm font-medium text-[#E73C6E]">
        {badge ? "Learn more" : "Get started"}
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 transition group-hover:translate-x-0.5">
          <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </div>
    </button>
  );
}

function TurnoverRequestsGateInner({ buildings }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [role, setRole] = useState<Role>(() => parseRole(searchParams.get("role")));

  function selectRole(next: Role) {
    setRole(next);
    router.replace(next ? `${pathname}?role=${next}` : pathname, { scroll: false });
  }

  if (role === "property-manager") {
    return <PropertyManagerForm onBack={() => selectRole(null)} buildings={buildings} />;
  }

  if (role === "project-manager") {
    return <ProjectManagerForm onBack={() => selectRole(null)} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-500">First, tell us who you are</p>
        <p className="mt-1 text-xl font-semibold text-gray-900">What best describes your role?</p>
        <p className="mt-1 text-sm text-gray-500">We&apos;ll take you to the right form based on your answer.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <RoleCard
          onClick={() => selectRole("property-manager")}
          title="Property Manager"
          requestType="Turnover Request"
          description={
            <>
              <strong className="font-semibold text-gray-700">Manage a building or portfolio?</strong>{" "}
              Schedule a unit turnover or cleaning for a property you manage.
            </>
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
            </svg>
          }
        />
        <RoleCard
          onClick={() => selectRole("project-manager")}
          title="Project Manager"
          requestType="Change Order"
          description={
            <>
              <strong className="font-semibold text-gray-700">Already working with Sueep on a project?</strong>{" "}
              Submit a change order or scope adjustment for that active project.
            </>
          }
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}

export function TurnoverRequestsGate(props: Props) {
  return (
    <Suspense fallback={null}>
      <TurnoverRequestsGateInner {...props} />
    </Suspense>
  );
}
