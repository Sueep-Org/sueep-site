import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { NewProjectForm } from "@/app/erp/(shell)/projects/new/NewProjectForm";
import { MarketingNav } from "../components/MarketingNav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Unit Turnover Requests | Sueep",
  description:
    "Submit a unit turnover cleaning request to Sueep. Fast scheduling, detailed scope tracking, and direct PM notification for property managers.",
  alternates: { canonical: "/turnover-requests" },
};

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Commercial Cleaning", href: "/commercial-cleaning" },
  { label: "Careers", href: "/careers", subtle: true },
];

export default async function TurnoverRequestsPage() {
  const cfg = parseHubSpotPipelineStageMap();

  const [buildings, scheduleBuildings] = await Promise.all([
    prisma.building.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true },
    }),
    prisma.project.findMany({
      where: {
        status: { notIn: ["COMPLETE", "ARCHIVED"] },
        OR: [
          { segment: { in: ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"] } },
          ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
        ],
      },
      orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
      select: { id: true, jobTitle: true, description: true, supervisor: true },
    }),
  ]);

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <MarketingNav links={NAV_LINKS} cta={{ label: "Request a Quote", href: "/" }} />

      {/* Hero */}
      <section className="bg-[#E73C6E] px-6 py-16 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Property Managers</p>
        <h1 className="mt-3 text-3xl font-extrabold md:text-5xl">Unit Turnover Requests</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/90 md:text-lg">
          Submit your unit scope, dates, and pricing information directly to the Sueep team. We&apos;ll confirm and schedule your clean fast.
        </p>
      </section>

      {/* Trust strip */}
      <section className="border-b border-gray-100 bg-gray-50 px-6 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-8 text-center">
          {[
            { stat: "24hr", label: "Average response time" },
            { stat: "2,000+", label: "Units turned annually" },
            { stat: "PA · NJ · NY", label: "Service area" },
          ].map((item) => (
            <div key={item.stat}>
              <p className="text-2xl font-extrabold text-[#E73C6E]">{item.stat}</p>
              <p className="mt-0.5 text-xs text-gray-500">{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900">Submit a request</h2>
          <p className="mt-1 text-sm text-gray-500">
            Fill out the details below and your Sueep PM will be notified immediately.
          </p>
        </div>
        <NewProjectForm
          initialBuildings={buildings}
          initialScheduleBuildings={scheduleBuildings}
          janitorialPipelineId={cfg?.janitorial.pipelineId || null}
          initialSegment="JANITORIAL_TURNOVER_REQUESTS"
          lockedSegment
          allowErpDataFetch={false}
          submitEndpoint="/api/janitorial-turnover-projects"
          successMessage="Your turnover request was submitted. Your Sueep PM has been notified."
          submitLabel="Submit turnover request"
          lockedSueepPm={{ name: "David Rodriguez", email: "david@sueep.com" }}
          disableNewBuilding
          payloadExtra={{ source: "external" }}
        />
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Sueep · <a href="/privacy" className="hover:text-[#E73C6E]">Privacy</a>
      </footer>
    </main>
  );
}
