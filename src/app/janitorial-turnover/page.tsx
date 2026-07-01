import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseHubSpotPipelineStageMap } from "@/lib/hubspot/pipelineStages";
import { JanitorialTurnoverGate } from "./JanitorialTurnoverGate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Janitorial Turnover Request | Sueep",
  description: "Submit a janitorial turnover request to Sueep.",
  robots: { index: false, follow: false },
};

export default async function JanitorialTurnoverPage() {
  const cfg = parseHubSpotPipelineStageMap();
  const janitorialSegments = cfg?.janitorial.pipelineId
    ? ["JANITORIAL_TURNOVER_REQUESTS"]
    : ["JANITORIAL_TURNOVER_REQUESTS", "COMMERCIAL_CLEANING"];

  const [buildings, scheduleBuildings, employees] = await Promise.all([
    prisma.building.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true },
    }),
    prisma.project.findMany({
      where: {
        status: { notIn: ["COMPLETE", "ARCHIVED"] },
        OR: [
          { segment: { in: janitorialSegments } },
          ...(cfg?.janitorial.pipelineId ? [{ hubspotPipelineId: cfg.janitorial.pipelineId }] : []),
        ],
      },
      orderBy: [{ projectDate: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        jobTitle: true,
        description: true,
        supervisor: true,
      },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <main className="flex-1 px-4 py-8 sm:py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">Sueep</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-950">Janitorial turnover request</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Submit unit turnover details, scope, dates, pricing estimate, and SUEEP PM notification information.
            </p>
          </div>
          <JanitorialTurnoverGate
            buildings={buildings}
            scheduleBuildings={scheduleBuildings}
            employees={employees}
            janitorialPipelineId={cfg?.janitorial.pipelineId || null}
          />
        </div>
      </main>
      <footer className="bg-black py-5 text-xs text-gray-400">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
          <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <a href="mailto:contact@sueep.com" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
