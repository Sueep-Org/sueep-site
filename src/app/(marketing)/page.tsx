import Link from "next/link";
import ContactForm from "./components/ContactForm";
import PartnersCarousel from "./components/PartnersCarousel";
import { MarketingNav } from "./components/MarketingNav";

const HOME_NAV_LINKS = [
  { label: "About", href: "#about", anchor: true as const },
  { label: "Services", href: "#services", anchor: true as const },
  { label: "Projects", href: "#projects", anchor: true as const },
  { label: "Contact", href: "#contact", anchor: true as const },
  { label: "Referral program", href: "/referral", subtle: true },
  { label: "Careers", href: "/careers", subtle: true },
  { label: "Blog", href: "/blog", subtle: true },
];

export default function Home() {
  return (
    <main className="bg-white text-gray-900">
      <MarketingNav links={HOME_NAV_LINKS} cta={{ label: "Request a Quote", href: "#contact" }} />

      {/* Hero */}
      <section className="relative h-[80vh] flex items-center justify-center text-center">
        <img src="/hero.jpg" className="absolute inset-0 w-full h-full object-cover" alt="Sueep team at project site" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/10" />
        <div className="relative z-10 px-6">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white uppercase tracking-wide text-shadow-md">
            Cleaning & Painting That Protects Your Schedule and Budget
          </h1>
          <p className="mt-4 text-lg text-white font-medium max-w-2xl mx-auto text-shadow-sm">
            Post-construction and janitorial cleaning, plus residential and commercial painting—crews sized to your deadlines.
          </p>
          <a href="#contact" className="mt-6 inline-block px-6 py-3 bg-[#E73C6E] text-white rounded-md font-medium hover:opacity-90">
            Get Started
          </a>
        </div>
      </section>

      {/* About */}
      <section id="about" className="max-w-7xl mx-auto px-6 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E]">Who we are</p>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase">About Sueep</h2>
        <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#E73C6E]" />
        <p className="mt-6 text-gray-700 max-w-3xl mx-auto text-lg leading-relaxed">
          For over two decades, Sueep has helped property managers and general contractors hit deadlines and handoffs.
          Our teams run predictable, large‑scale programs: construction final cleans, rapid unit turnovers, and daily janitorial.
          We focus on outcomes that matter—clear scopes, tight QC checklists, proactive communication, and crews sized to your schedule.
        </p>
      </section>

      {/* Services */}
      <section id="services" className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E] text-center">What we do</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase text-center">Services</h2>
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#E73C6E]" />
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              {
                title: "Post-Construction Cleaning",
                desc: "Final cleans, debris removal, and turnover support aligned with GC schedules.",
              },
              {
                title: "Janitorial Cleaning",
                desc: "Daily lobby, corridor, and amenity cleaning with QA checklists and night crews.",
              },
              {
                title: "Commercial Painting",
                desc: "Turnover painting with strict prep and primer standards for consistent finishes.",
              },
              {
                title: "Residential Painting",
                desc: "Unit turns and occupied refreshes with consistent prep and clean edges.",
              },
            ].map((service) => (
              <div key={service.title} className="border-t-4 border-[#E73C6E] p-6 border-x border-b border-gray-200 bg-white hover:shadow-md transition">
                <h3 className="font-semibold text-lg">{service.title}</h3>
                <p className="mt-3 text-sm text-gray-600">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="max-w-7xl mx-auto px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E] text-center">Our work</p>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase text-center">Featured Projects</h2>
        <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#E73C6E]" />
        <div className="mt-12 grid md:grid-cols-3 gap-8">
          {[
            { img: "/projects/Vantage.jpg", name: "Vantage View Summer Turns", detail: "30+ workers • 5 years" },
            { img: "/projects/UDR.jpg", name: "UDR Portfolio – King of Prussia", detail: "500k+ sqft janitorial program" },
            { img: "/projects/Birchwood.jpg", name: "Birchwood", detail: "New development" },
          ].map((proj) => (
            <div key={proj.name} className="overflow-hidden border border-gray-200 group">
              <div className="relative overflow-hidden">
                <img src={proj.img} alt={proj.name} className="w-full h-56 object-cover transition duration-300 group-hover:scale-105" />
              </div>
              <div className="p-4 border-t-2 border-[#E73C6E]">
                <h3 className="font-semibold">{proj.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{proj.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Our Story */}
      <section id="story" className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E]">Since 2018</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase">Our Story</h2>
          <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#E73C6E]" />
          <p className="mt-8 text-gray-700 text-lg leading-relaxed max-w-3xl mx-auto">
            Sueep started in 2018 as a family business in the residential cleaning space. Over time, it evolved to serve commercial clients and additional services. Sueep maintains its family approach investing in supervision, clear scopes, and quality control so projects hand off smoothly and portfolios stay consistent.
          </p>
        </div>
      </section>

      {/* Partners */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E] text-center">Trusted by</p>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold uppercase text-center">Companies We Service</h2>
        <div className="mx-auto mt-4 h-1 w-12 rounded-full bg-[#E73C6E]" />
        <div className="mt-12">
          <PartnersCarousel
            intervalMs={2200}
            partners={[
              { logo: "/partners/tcg.svg", name: "Tester Construction Group", url: "https://testerconstruction.com/", scale: 2.0 },
              { logo: "/partners/harkins.svg", name: "Harkins Builders", url: "https://harkinsbuilders.com/", scale: 2.4 },
              { logo: "/partners/ingerman.svg", name: "Ingerman Construction", url: "https://ingerman.com/", scale: 1.2 },
              { logo: "/partners/UDR.svg", name: "UDR", url: "https://www.udr.com/", scale: 0.85 },
            ]}
          />
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="bg-gray-900 text-white py-20">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-8 md:gap-10 items-start">
          <div suppressHydrationWarning>
            <ContactForm />
          </div>
          <div className="md:text-right md:pl-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#E73C6E]">Get in touch</p>
            <h3 className="mt-2 font-semibold text-xl md:text-2xl">Sueep Headquarters</h3>
            <p className="mt-3 text-gray-300 text-base md:text-lg leading-relaxed">2 Bala Plaza, Suite 300<br />Bala Cynwyd, PA 19004</p>
            <p className="mt-3 text-gray-300 text-base md:text-lg leading-relaxed">(267) 217-3596</p>
            <p className="mt-3 text-gray-300 text-base md:text-lg leading-relaxed">contact@sueep.com</p>
            <p className="mt-6 text-gray-400 text-sm md:text-base">Serving PA • NJ • MD • NY</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-gray-400 text-sm py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center justify-center gap-3">
                <img src="/sueeplogo.png" alt="Sueep logo" className="h-12 md:h-14 lg:h-16 w-auto" />
            <div className="flex gap-3">
              <a href="https://www.facebook.com/SueepOfficial" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="transition text-[#E73C6E] hover:text-white">
                <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true">
                  <path fill="currentColor" d="M22 12.07C22 6.48 17.52 2 11.93 2 6.35 2 1.87 6.48 1.87 12.07 1.87 17.1 5.66 21.24 10.44 22v-7.05H7.9v-2.88h2.54V9.41c0-2.5 1.49-3.88 3.77-3.88 1.09 0 2.23.2 2.23.2v2.46h-1.25c-1.23 0-1.61.77-1.61 1.56v1.87h2.74l-.44 2.88h-2.3V22c4.78-.76 8.56-4.9 8.56-9.93Z"/>
                </svg>
              </a>
              <a href="https://www.linkedin.com/company/sueep/?viewAsMember=true" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="transition text-[#E73C6E] hover:text-white">
                <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true">
                  <path fill="currentColor" d="M20.45 3H3.55C2.7 3 2 3.7 2 4.55v14.9C2 20.3 2.7 21 3.55 21h16.9c.85 0 1.55-.7 1.55-1.55V4.55C22 3.7 21.3 3 20.45 3Zm-12.12 15.46H5.66V9.99h2.67v8.47ZM7 8.83c-.85 0-1.55-.7-1.55-1.55S6.15 5.73 7 5.73s1.55.7 1.55 1.55S7.85 8.83 7 8.83Zm11.34 9.63h-2.66v-4.62c0-1.1-.02-2.52-1.53-2.52-1.53 0-1.77 1.2-1.77 2.44v4.7H9.72V9.99h2.55v1.16h.04c.36-.68 1.24-1.4 2.55-1.4 2.73 0 3.23 1.8 3.23 4.14v4.58Z"/>
                </svg>
              </a>
              <a href="https://www.instagram.com/sueepservices/?hl=en" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="transition text-[#E73C6E] hover:text-white">
                <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" aria-hidden="true">
                  <path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm10 2H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm-5 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6ZM18.5 6.5a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"/>
                </svg>
              </a>
            </div>
          </div>
          <div className="mt-4 flex justify-between items-center">
          <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 justify-end">
            <Link href="/referral" className="text-gray-500 hover:text-white text-xs sm:text-sm">
              Referral program
            </Link>
            <Link href="/blog" className="text-gray-500 hover:text-white text-xs sm:text-sm">
              Blog
            </Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <a href="#contact" className="hover:text-white">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}


