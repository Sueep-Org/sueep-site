import Image from "next/image";
import Link from "next/link";
import PaintingLeadForm from "./PaintingLeadForm";

export const metadata = {
  title: "Residential Painting in Philadelphia | Sueep",
  description:
    "Interior & exterior residential painting across Greater Philadelphia. Clean prep, crisp lines, on‑time completion. Get a fast estimate.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/painting" },
};

export default function PaintingPage() {
  const HERO_IMAGE = "/painting/hero.jpg";
  const BOTTOM_IMAGE = "/painting/bottom.jpg";
  const phoneHref = "tel:+12672173596";
  return (
    <main className="bg-white text-gray-900">
      {/* Hero Section (match sueep.com homepage cover) */}
      <section className="relative h-[80vh] flex items-center justify-center text-center overflow-hidden">
        <Image
          src={HERO_IMAGE}
          alt="Sueep team with van outside residential building"
          fill
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/10" />
        {/* Top-right prominent phone number */}
        <div className="absolute top-4 right-4 z-20">
          <a
            href={phoneHref}
            className="block text-2xl md:text-4xl font-extrabold text-[#E73C6E] bg-white/90 backdrop-blur px-3 py-2 rounded-md shadow"
            aria-label="Call Sueep at 267-217-3596"
          >
            267-217-3596
          </a>
        </div>
        <div className="relative z-10 px-6">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white uppercase tracking-wide text-shadow-md">
            Residential Painting in Philadelphia
          </h1>
          <p className="mt-4 text-lg text-white font-medium max-w-2xl mx-auto text-shadow-sm">
            Fast quotes • Licensed & insured • Clean, professional crews
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href={phoneHref}
              className="inline-block px-6 py-3 bg-[#E73C6E] text-white rounded-md font-medium hover:opacity-90"
            >
              Call Now
            </a>
            <a
              href="#estimate-form"
              className="inline-block px-6 py-3 bg-white text-[#E73C6E] rounded-md font-medium hover:opacity-90"
            >
              Get Free Estimate
            </a>
          </div>
          <p className="mt-3 text-sm text-white/80 italic">
            Serving Philadelphia, Main Line, Bucks, Montgomery, Delaware County, and South Jersey
          </p>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="sr-only">Trust Badges</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E73C6E] via-[#ff7aa3] to-[#E73C6E] opacity-70" />
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E73C6E]/10 text-[#E73C6E] ring-1 ring-[#E73C6E]/20 shadow">
                  {/* Shield Check */}
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M12 2l7 3v6c0 5-3.4 9.4-7 11c-3.6-1.6-7-6-7-11V5l7-3Zm-1.2 11.9l-2.3-2.3l-1.4 1.4l3.7 3.7l6.1-6.1l-1.4-1.4l-4.7 4.7Z"/>
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">Fully Bonded & Insured</p>
                  <p className="mt-1 text-sm text-gray-600">COIs on request • Liability + worker’s comp protected.</p>
                </div>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E73C6E] via-[#ff7aa3] to-[#E73C6E] opacity-70" />
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E73C6E]/10 text-[#E73C6E] ring-1 ring-[#E73C6E]/20 shadow">
                  {/* Ribbon/Medal */}
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M12 2a7 7 0 1 1 0 14a7 7 0 0 1 0-14Zm-3 18l3-2l3 2l3-2l3 2v2l-3-1l-3 1l-3-1l-3 1l-3-1l-3 1v-2l3-2l3 2Z"/>
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">Quality Workmanship Guaranteed</p>
                  <p className="mt-1 text-sm text-gray-600">Crisp lines, even coverage, and clean job sites.</p>
                </div>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#E73C6E] via-[#ff7aa3] to-[#E73C6E] opacity-70" />
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E73C6E]/10 text-[#E73C6E] ring-1 ring-[#E73C6E]/20 shadow">
                  {/* Check Circle */}
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm-1.4 13.2l-3.7-3.7l1.4-1.4l2.3 2.3l4.7-4.7l1.4 1.4l-6.1 6.1Z"/>
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">Money‑Back Satisfaction</p>
                  <p className="mt-1 text-sm text-gray-600">Not happy? We’ll make it right—or refund labor.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-20 bg-gray-50" aria-labelledby="services-heading">
        <div className="max-w-6xl mx-auto px-6">
          <h2 id="services-heading" className="text-2xl md:text-3xl font-bold uppercase text-center">
            Residential Painting Services
          </h2>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
            {[
              {
                title: "Interior Painting",
                desc: "Walls, ceilings, trim, and doors with crisp, even finishes.",
                icon: "/window.svg",
                img: "/painting/interior.jpg",
                objPos: "object-[50%_40%]",
              },
              {
                title: "Exterior Painting",
                desc: "Durable coatings and thorough prep to protect your home.",
                icon: "/globe.svg",
                img: "/painting/exterior.jpg",
                objPos: "object-center",
              },
            ].map((s) => (
              <div key={s.title} className="w-full max-w-sm p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                {/* Service image (add files to public/painting/) */}
                <div className="relative overflow-hidden rounded-md border border-gray-200 aspect-[16/9]">
                  <Image
                    src={s.img}
                    alt={`${s.title} by Sueep`}
                    fill
                    className={`object-cover ${s.objPos || "object-center"}`}
                  />
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Sueep */}
      <section className="py-20" aria-labelledby="why-heading">
        <div className="max-w-6xl mx-auto px-6">
          <h2 id="why-heading" className="text-2xl md:text-3xl font-bold uppercase text-center">
            Why Choose Sueep
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-8">
            <div className="p-6 border border-gray-200 rounded-lg">
              <p className="text-[#E73C6E] text-sm font-semibold">Professional</p>
              <p className="mt-2 text-gray-700">We’re an in-person company. You’ll work directly with a professional painting team.</p>
            </div>
            <div className="p-6 border border-gray-200 rounded-lg">
              <p className="text-[#E73C6E] text-sm font-semibold">Fast</p>
              <p className="mt-2 text-gray-700">We prioritize your needs and accommodate your schedule to keep things moving.</p>
            </div>
            <div className="p-6 border border-gray-200 rounded-lg">
              <p className="text-[#E73C6E] text-sm font-semibold">Reliable</p>
              <p className="mt-2 text-gray-700">We’re there for you even after the job is complete—relationships matter to us.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility Block */}
      <section className="relative" aria-labelledby="cred-heading">
        <div className="relative h-[340px] md:h-[460px] lg:h-[520px] overflow-hidden">
          <Image
            src={`${BOTTOM_IMAGE}?v=2`}
            alt="Professional painting"
            fill
            className="object-cover object-[50%_70%]"
          />
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 h-full flex items-center justify-center text-center px-6">
            <div>
              <h2 id="cred-heading" className="text-2xl md:text-3xl font-bold text-white max-w-4xl mx-auto">
                Clean, consistent painting delivered on schedule across Greater Philadelphia.
              </h2>
              <p className="mt-3 text-white/90">References available upon request.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Form (no client scripts; posts to FormSubmit) */}
      <section className="py-20" aria-labelledby="lead-heading">
        <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-8 items-start">
          <div>
            <PaintingLeadForm />
          </div>
          <div>
            <div className="p-6 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="font-semibold text-lg">What to Expect</h3>
              <ul className="mt-3 space-y-2 text-sm text-gray-700">
                <li>• Quick call or photo walkthrough</li>
                <li>• Clear, written pricing</li>
                <li>• Clean prep and protection</li>
                <li>• On‑time, tidy completion</li>
              </ul>
            </div>
            <div className="mt-5 p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
              <h3 className="font-semibold text-lg text-gray-900">Finance Your Painting Project</h3>
              <p className="mt-2 text-sm text-gray-700">
                Get your home painted now and pay over time with flexible financing options through Acorn Finance.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
                <li>• Monthly payment options available</li>
                <li>• Fast and simple pre-qualification</li>
                <li>• No need to delay your project</li>
                <li>• Subject to approval through Acorn Finance</li>
              </ul>
              <p className="mt-4 text-sm text-gray-600">
                Ask us about financing when you request your estimate.
              </p>
              <p className="mt-2 text-[11px] leading-snug text-gray-500">
                Financing is provided through Acorn Finance and is subject to credit approval. Terms and conditions may apply.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer (copied from cleaning page style) */}
      <footer className="bg-black text-gray-400 text-sm py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center justify-center gap-3">
            <Image src="/sueeplogo.png" alt="Sueep logo" width={64} height={64} className="h-12 md:h-14 lg:h-16 w-auto" />
          </div>
          <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="/blog" className="text-gray-500 hover:text-white">
                Painting blog
              </Link>
              <Link href="/" className="text-gray-500 hover:text-white">
                Home
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}


