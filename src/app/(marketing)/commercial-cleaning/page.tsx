import CommercialLeadForm from "../components/CommercialLeadForm";
import { MarketingNav } from "../components/MarketingNav";

export const metadata = {
  title: "Commercial Janitorial Services in Philadelphia | Sueep Facility Maintenance",
  description:
    "Sueep provides professional janitorial staffing for property and facility managers across Greater Philadelphia. Minimum 5 days/week service for buildings 10,000 sq ft and up.",
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "/commercial-cleaning",
  },
};

export default function CommercialCleaningPage() {
  return (
    <main className="bg-white text-gray-900">
      <MarketingNav />
      {/* Hero Section */}
      <section className="relative min-h-[70vh] flex items-center overflow-hidden">
        <img
          src="/conversionpageimage.png"
          alt="Commercial janitorial team in facility"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#E73C6E]/20 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/0" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-24">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white max-w-4xl">
            Philadelphia’s Trusted Partner for Commercial Cleaning
          </h1>
          <p className="mt-4 text-lg md:text-xl text-white/95 max-w-3xl">
            We provide reliable janitorial staffing for large buildings, schools, medical facilities, and offices.
          </p>
          <a href="#estimate-form" className="mt-8 inline-block px-6 py-3 bg-[#E73C6E] text-white rounded-md font-medium hover:opacity-90">
            Request a Commercial Cleaning Estimate
          </a>
          <p className="mt-3 text-sm text-white/80 italic">Minimum 5 days/week service • 10,000+ sq ft buildings</p>
        </div>
      </section>

      {/* Social Proof / Logos */}
      <section className="py-14 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm text-gray-500">
            Trusted by leading property management and construction firms across Greater Philadelphia.
          </p>
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-10 items-center justify-items-center">
            {[
              { src: "/partners/UDR.svg", alt: "UDR", boxClass: "h-16 md:h-20", imgClass: "max-w-[180px] md:max-w-[220px]" },
              { src: "/partners/tcg.svg", alt: "Tester Construction Group", boxClass: "h-44 md:h-56", imgClass: "max-w-[480px] md:max-w-[600px]" },
              { src: "/partners/harkins.svg", alt: "Harkins Builders", boxClass: "h-52 md:h-72", imgClass: "max-w-[640px] md:max-w-[820px]" },
              { src: "/partners/ingerman.svg", alt: "Ingerman Construction", boxClass: "h-40 md:h-52", imgClass: "max-w-[420px] md:max-w-[520px]" },
            ].map((logo) => (
              <div key={logo.alt} className={`w-full flex items-center justify-center ${logo.boxClass}`}>
                <img
                  src={logo.src}
                  alt={logo.alt}
                  className={`max-h-full w-auto object-contain mix-blend-normal ${logo.imgClass}`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services Overview */}
      <section className="py-20 bg-gray-50" aria-labelledby="services-heading">
        <div className="max-w-6xl mx-auto px-6">
          <h2 id="services-heading" className="text-2xl md:text-3xl font-bold uppercase text-center">
            Services for Commercial Facilities
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Daily & Nightly Janitorial Operations",
                desc: "Consistent, supervised staffing for large commercial buildings.",
                icon: "/window.svg",
              },
              {
                title: "School & Campus Cleaning",
                desc: "Safe, reliable, background-checked custodial teams for education facilities.",
                icon: "/globe.svg",
              },
              {
                title: "Medical & Healthcare Facilities",
                desc: "Disinfection-focused cleaning meeting compliance standards.",
                icon: "/file.svg",
              },
              {
                title: "Office & Corporate Buildings",
                desc: "Day porter and nightly maintenance for multi-tenant offices.",
                icon: "/window.svg",
              },
            ].map((s) => (
              <div key={s.title} className="p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition">
                <div className="h-10 w-10 rounded-md bg-[#E73C6E]/10 flex items-center justify-center">
                  <img src={s.icon} alt="" className="h-5 w-5" />
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
              <p className="text-[#E73C6E] text-sm font-semibold">20+ Years Experience</p>
              <p className="mt-2 text-gray-700">Established processes and seasoned supervisors keep programs predictable across multi-site portfolios.</p>
            </div>
            <div className="p-6 border border-gray-200 rounded-lg">
              <p className="text-[#E73C6E] text-sm font-semibold">Fully Insured & Compliant</p>
              <p className="mt-2 text-gray-700">Certificates, backgrounded crews, and safety protocols tailored to building requirements.</p>
            </div>
            <div className="p-6 border border-gray-200 rounded-lg">
              <p className="text-[#E73C6E] text-sm font-semibold">Proven Performance Across 1M+ sq ft</p>
              <p className="mt-2 text-gray-700">Scalable staffing and QA allow us to support large footprints without sacrificing quality.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Credibility Block */}
      <section className="relative" aria-labelledby="cred-heading">
        <div className="relative h-[340px] md:h-[460px] lg:h-[520px] overflow-hidden">
          <img src="/conversionpageimage.png" alt="Professional facility" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 h-full flex items-center justify-center text-center px-6">
            <div>
              <h2 id="cred-heading" className="text-2xl md:text-3xl font-bold text-white max-w-4xl mx-auto">
                Trusted by property management firms overseeing 1,000,000+ sq ft of commercial space across Greater Philadelphia.
              </h2>
              <p className="mt-3 text-white/90">20+ years of proven janitorial operations and supervision.</p>
            </div>
          </div>
        </div>
        <div className="bg-white">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-md border border-gray-200 bg-white">
                <p className="text-2xl md:text-3xl font-bold">1M+ sq ft</p>
                <p className="text-sm text-gray-600">maintained monthly</p>
              </div>
              <div className="p-4 rounded-md border border-gray-200 bg-white">
                <p className="text-2xl md:text-3xl font-bold">50+ staff</p>
                <p className="text-sm text-gray-600">trained & insured</p>
              </div>
              <div className="p-4 rounded-md border border-gray-200 bg-white">
                <p className="text-2xl md:text-3xl font-bold">20+ sites</p>
                <p className="text-sm text-gray-600">active commercial programs</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Lead Form */}
      <section className="py-20" aria-labelledby="lead-heading">
        <div className="max-w-6xl mx-auto px-6">
          <div>
            <CommercialLeadForm />
          </div>
        </div>
      </section>

      {/* Footer (uses global from root page styling) */}
      <footer className="bg-black text-gray-400 text-sm py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center justify-center gap-3">
            <img src="/sueeplogo.png" alt="Sueep logo" className="h-12 md:h-14 lg:h-16 w-auto" />
          </div>
          <div className="mt-4 flex justify-between items-center">
            <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
            <div className="flex gap-6" />
          </div>
        </div>
      </footer>
    </main>
  );
}


