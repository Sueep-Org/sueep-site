"use client";

import { useState } from "react";
import { RealEstateForm } from "./RealEstateForm";
import { PropertyManagerForm, type BuildingOption } from "./PropertyManagerForm";

type Role = "property-manager" | "real-estate-agent" | "project-manager" | null;

interface Props {
  buildings: BuildingOption[];
}

function RoleCard({
  onClick,
  icon,
  title,
  description,
  badge,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
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
        <p className="mt-1 text-sm text-gray-500">{description}</p>
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

function WipScreen({ onBack, title, description }: { onBack: () => void; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-xl border border-amber-100 bg-amber-50 px-6 py-16 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
        </svg>
      </div>
      <div>
        <span className="mb-2 inline-block rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          Coming soon
        </span>
        <p className="text-lg font-semibold text-gray-900">{title}</p>
        <p className="mt-2 max-w-sm text-sm text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06Z" clipRule="evenodd" />
        </svg>
        Back
      </button>
    </div>
  );
}

export function TurnoverRequestsGate({ buildings }: Props) {
  const [role, setRole] = useState<Role>(null);

  if (role === "real-estate-agent") {
    return <RealEstateForm onBack={() => setRole(null)} />;
  }

  if (role === "property-manager") {
    return <PropertyManagerForm onBack={() => setRole(null)} buildings={buildings} />;
  }

  if (role === "project-manager") {
    return (
      <WipScreen
        onBack={() => setRole(null)}
        title="Project Manager requests — coming soon"
        description="We're building a dedicated flow for project managers to request change orders and manage approvals. Check back soon or reach out to your Sueep contact directly."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-500">First, tell us who you are</p>
        <p className="mt-1 text-xl font-semibold text-gray-900">What best describes your role?</p>
        <p className="mt-1 text-sm text-gray-500">We&apos;ll take you to the right form based on your answer.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <RoleCard
          onClick={() => setRole("real-estate-agent")}
          title="Real Estate Agent"
          description="I'm an agent representing a property sale or listing and need turnover services."
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          }
        />
        <RoleCard
          onClick={() => setRole("project-manager")}
          title="Project Manager"
          description="I oversee active Sueep projects and need to request change orders or scope adjustments."
          badge="Coming soon"
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
