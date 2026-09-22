import Script from "next/script";
import Link from "next/link";
import { MarketingNav } from "../components/MarketingNav";
import { CareersPixelEvents } from "./CareersPixelEvents";
import { CareersApplicationForm } from "./CareersApplicationForm";

export const metadata = {
  title: "Careers & Join Sueep | Sueep",
  description:
    "Apply to Sueep — share your interest here. If we invite you to the next step, you will receive the questionnaire by email.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/careers" },
};

export default async function CareersPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string }>;
}) {
  const sp = (searchParams ? await searchParams : undefined) ?? {};
  // `role` still drives the hero tab, the default-checked position, and pixel
  // page-view tracking — ad campaigns link to /careers?role=painter for the
  // dedicated pixel, so this stays untouched by the step split below.
  const role = sp.role === "painter" ? "painter" : sp.role === "supervisor" ? "supervisor" : "cleaner";
  const isPainter = role === "painter";
  const isSupervisor = role === "supervisor";
  const roleWord = isPainter ? "painting" : isSupervisor ? "supervisor" : "cleaning";

  const primaryCtaClass =
    "inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] w-full text-center";

  return (
    <main className="bg-white text-gray-900 min-h-screen flex flex-col">
      <Script id="hs-do-not-track" strategy="beforeInteractive">
        {`window._hsq = window._hsq || []; window._hsq.push(['doNotTrack']);`}
      </Script>

      <CareersPixelEvents role={role} />
      {isPainter && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src="https://www.facebook.com/tr?id=248346263857750&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      )}
      <MarketingNav />

      <section className="relative py-16 md:py-24 overflow-hidden">
        <img src="/hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.18]" />
        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <p className="text-[#E73C6E] font-semibold text-sm uppercase tracking-wider mb-3">Careers</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
            Work with Sueep
          </h1>
          <p className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed">
            Submit this short application so we have your contact details and interests on file. If we move forward with
            you, our hiring team will email you.{" "}
            {isSupervisor
              ? "Please note this application is for supervisor positions overseeing our cleaning and painting crews."
              : `Please note this application is for ${roleWord} and janitorial positions.`}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
              <a
                href="/careers?role=cleaner#apply"
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  role === "cleaner" ? "bg-[#E73C6E] text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Cleaner
              </a>
              <a
                href="/careers?role=painter#apply"
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  isPainter ? "bg-[#E73C6E] text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Painter
              </a>
              <a
                href="/careers?role=supervisor#apply"
                className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                  isSupervisor ? "bg-[#E73C6E] text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Supervisor
              </a>
            </div>
            <a href="#apply" className={primaryCtaClass}>
              Apply below
            </a>
          </div>
        </div>
      </section>

      <section id="apply" className="flex-1 pb-20 bg-gray-50 scroll-mt-20 border-t border-gray-100">
        <div className="max-w-2xl mx-auto px-5 pt-14 md:pt-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center uppercase">Application</h2>
          <p className="mt-2 text-center text-gray-600 text-sm">
            Fields marked <span className="text-red-500">*</span> are required. Your submission goes to Sueep&apos;s
            internal hiring system.
          </p>

          <CareersApplicationForm
            defaultCleaner={role === "cleaner"}
            defaultPainter={isPainter}
            defaultSupervisor={isSupervisor}
          />

          <p className="mt-8 text-center text-sm text-gray-600">
            Prefer email?{" "}
            <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
              contact@sueep.com
            </a>
          </p>
        </div>
      </section>

      <footer className="bg-black text-gray-400 text-sm py-8 mt-auto">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Sueep LLC.</p>
          <Link href="/" className="text-[#E73C6E] hover:text-white font-medium">
            sueep.com
          </Link>
        </div>
      </footer>
    </main>
  );
}
