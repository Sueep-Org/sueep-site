import Link from "next/link";
import { MarketingNav } from "../components/MarketingNav";
import { FranchiseInquiryForm } from "./FranchiseInquiryForm";

export const metadata = {
  title: "Franchise Opportunities | Sueep",
  description:
    "Explore a Sueep franchise opportunity. Build a technology-enabled commercial services business with Sueep in select U.S. markets.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/franchise" },
};

const WHAT_HAPPENS_NEXT = [
  {
    title: "Submit Your Information",
    body: "Tell us about yourself and the market you’re interested in.",
  },
  {
    title: "Initial Conversation",
    body: "A member of the Sueep team will contact you to learn more about your goals and background.",
  },
  {
    title: "Market & Franchise Discussion",
    body: "We’ll discuss the Sueep model, available markets, territory structure, investment, and next steps.",
  },
  {
    title: "Franchise Discovery",
    body: "Qualified candidates can move forward through the Sueep franchise evaluation process.",
  },
];

export default function FranchisePage() {
  const primaryCtaClass =
    "inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] w-full text-center";

  return (
    <main className="bg-white text-gray-900 min-h-screen flex flex-col">
      <MarketingNav cta={{ label: "Apply for a Franchise", href: "/franchise#apply" }} />

      <section className="relative py-16 md:py-24 overflow-hidden">
        <img src="/hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.18]" />
        <div className="relative max-w-2xl mx-auto px-5 text-center">
          <p className="text-[#E73C6E] font-semibold text-sm uppercase tracking-wider mb-3">Franchise</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
            Explore a Sueep Franchise Opportunity
          </h1>
          <p className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed">
            Build a technology-enabled commercial services business with Sueep.
          </p>
          <p className="mt-4 text-gray-600 text-base leading-relaxed">
            Sueep is expanding its franchise network and is looking for motivated entrepreneurs interested in
            building a scalable commercial services business in select U.S. markets. Complete the form below to
            tell us a little about yourself and the market you&apos;re interested in.
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
          <h2 className="text-2xl md:text-3xl font-bold text-center uppercase">Franchise Inquiry</h2>
          <p className="mt-2 text-center text-gray-600 text-sm">
            Fields marked <span className="text-red-500">*</span> are required.
          </p>

          <FranchiseInquiryForm />

          <p className="mt-8 text-center text-sm text-gray-600">
            Prefer email?{" "}
            <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
              contact@sueep.com
            </a>
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-5">
          <h2 className="text-2xl md:text-3xl font-bold text-center uppercase">What Happens Next?</h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-8">
            {WHAT_HAPPENS_NEXT.map((step, i) => (
              <div key={step.title} className="flex gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E73C6E] text-white font-bold">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
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
