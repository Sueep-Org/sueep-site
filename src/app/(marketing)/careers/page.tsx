import Script from "next/script";
import Link from "next/link";
import { MarketingNav } from "../components/MarketingNav";
import { CareersPixelEvents } from "./CareersPixelEvents";


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
  searchParams?: Promise<{ submitted?: string }>;
}) {
  const sp = (searchParams ? await searchParams : undefined) ?? {};
  const submitted = sp.submitted;
  const showSuccess = submitted === "1";
  const showError = submitted === "0";

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  const primaryCtaClass =
    "inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] w-full text-center";

  return (
    <main className="bg-white text-gray-900 min-h-screen flex flex-col">
      <Script id="hs-do-not-track" strategy="beforeInteractive">
        {`window._hsq = window._hsq || []; window._hsq.push(['doNotTrack']);`}
      </Script>
      {showSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-4 py-3 text-center text-sm font-medium">
          Thanks — we received your application. Our team will review it and reach out if there&apos;s a next step.
        </div>
      )}
      {showError && (
        <div className="bg-red-50 border-b border-red-200 text-red-900 px-4 py-3 text-center text-sm font-medium">
          Something went wrong. Please check required fields and try again, or email{" "}
          <a href="mailto:contact@sueep.com" className="underline font-medium">
            contact@sueep.com
          </a>
          .
        </div>
      )}

      <CareersPixelEvents submitted={showSuccess} />
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
            you, our hiring team will email you. Please note this application is for cleaning and janitorial positions.
          </p>
          <div className="mt-8">
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

          <form
            method="post"
            action="/api/candidate-applications"
            className="mt-8 grid grid-cols-1 gap-4 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
            autoComplete="on"
          >
            <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

            <div>
              <label htmlFor="fullName" className={labelClass}>
                Full name <span className="text-red-500">*</span>
              </label>
              <input id="fullName" name="fullName" type="text" required className={inputClass} placeholder="Your name" />
            </div>

            <div>
              <label htmlFor="email" className={labelClass}>
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className={inputClass}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className={inputClass}
                placeholder="Best number to reach you"
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="location" className={labelClass}>
                Location <span className="text-red-500">*</span>
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                className={inputClass}
                placeholder="City, State (e.g. Philadelphia, PA)"
                autoComplete="address-level2"
              />
            </div>

            <div>
              <label className={labelClass}>
                Do you have cleaning experience? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="cleaningExperience" value="yes" required className="accent-[#E73C6E]" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="cleaningExperience" value="no" required className="accent-[#E73C6E]" />
                  No
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="cleaningYears" className={labelClass}>
                If yes, how many years of cleaning experience?
              </label>
              <input
                id="cleaningYears"
                name="cleaningYears"
                type="number"
                min="0"
                max="99"
                className={inputClass}
                placeholder="e.g. 3"
              />
            </div>

            <div>
              <label className={labelClass}>
                Do you have a vehicle? <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="hasVehicle" value="yes" required className="accent-[#E73C6E]" />
                  Yes
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="radio" name="hasVehicle" value="no" required className="accent-[#E73C6E]" />
                  No
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="additionalNotes" className={labelClass}>
                Additional comments
              </label>
              <textarea
                id="additionalNotes"
                name="additionalNotes"
                rows={4}
                className={`${inputClass} resize-y min-h-[100px]`}
                placeholder="Anything else you'd like us to know…"
              />
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              By submitting, you agree we may contact you about opportunities at Sueep. We use your information only for
              hiring and onboarding.
            </p>

            <button
              type="submit"
              className="mt-2 inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px]"
            >
              Submit application
            </button>
          </form>

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