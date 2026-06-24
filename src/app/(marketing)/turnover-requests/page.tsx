import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { TurnoverRequestsGate } from "./TurnoverRequestsGate";
import { MarketingNav } from "../components/MarketingNav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Submit a Request | Sueep",
  description:
    "Submit a service request to Sueep. For property managers, real estate agents, and project managers — fast scheduling, detailed scope tracking, and direct PM notification.",
  alternates: { canonical: "/turnover-requests" },
};


export default async function TurnoverRequestsPage() {
  const buildings = await prisma.building.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true, pmName: true, pmEmail: true, pmPhone: true },
  });

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-[#E73C6E] px-6 py-16 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Sueep</p>
        <h1 className="mt-3 text-3xl font-extrabold md:text-5xl">Submit a Request</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/90 md:text-lg">
          For property managers, real estate agents, and project managers. Submit your details directly to your Sueep PM and we&apos;ll get you scheduled fast.
        </p>
      </section>

      {/* Form */}
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-14">
        <TurnoverRequestsGate buildings={buildings} />
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Sueep · <a href="/privacy" className="hover:text-[#E73C6E]">Privacy</a>
      </footer>
    </main>
  );
}
