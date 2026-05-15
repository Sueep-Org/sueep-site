import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Real Estate Agent Referrals | Earn $150–$500+ Per Client | Sueep",
  description:
    "Refer painting and cleaning clients to Sueep. Simple steps, clear payouts, trusted home services across Greater Philadelphia.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/referral" },
};

export default async function ReferralPage({
  searchParams,
}: {
  searchParams?: Promise<{ submitted?: string }>;
}) {
  const sp = (searchParams ? await searchParams : undefined) ?? {};
  const showSuccess = sp.submitted === "1";

  const ctaClass =
    "inline-flex items-center justify-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity min-h-[48px] w-full sm:w-auto text-center";
  const ctaSecondaryClass =
    "inline-flex items-center justify-center px-6 py-3.5 rounded-lg border-2 border-[#E73C6E] text-[#E73C6E] text-sm font-semibold bg-white hover:bg-pink-50 transition-colors min-h-[48px] w-full sm:w-auto text-center";

  return (
    <main className="bg-white text-gray-900">
      {showSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-900 px-4 py-3 text-center text-sm font-medium">
          Thanks — we received your referral. A Sueep team member will follow up shortly.
        </div>
      )}

      {/* Hero */}
      <section className="relative min-h-[85vh] sm:min-h-[80vh] flex flex-col justify-center overflow-hidden">
        <Image
          src="/hero.jpg"
          alt=""
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/60" />
        <div className="relative z-10 max-w-4xl mx-auto px-5 py-16 sm:py-20 md:py-24 text-center">
          <p className="text-[#ff7aa3] font-semibold text-sm uppercase tracking-wider mb-3">
            Sueep partner program
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
            Earn $150–$500+ Per Client You Refer
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/95 max-w-2xl mx-auto leading-relaxed">
            Connect your buyers and sellers with pro painting and cleaning. We handle the work — you get paid when the job completes.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
            <a href="#referral-form" className={ctaClass}>
              Submit a referral
            </a>
            <a href="#how-it-works" className={ctaSecondaryClass}>
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 md:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-5">
          <h2 className="text-2xl md:text-3xl font-bold text-center uppercase tracking-wide">
            How it works
          </h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            Three simple steps from introduction to payout.
          </p>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Send us the lead",
                desc: "Use the form with your client’s name, address, and the service they need — painting, cleaning, or both.",
              },
              {
                step: "2",
                title: "We close the job",
                desc: "Our team quotes, schedules, and completes the work. You stay focused on your transaction.",
              },
              {
                step: "3",
                title: "Get paid",
                desc: "Once the referred job is complete and paid, your referral fee is processed per our tier table.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative bg-white rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md transition-shadow"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E73C6E] text-white text-xl font-bold">
                  {item.step}
                </span>
                <h3 className="mt-5 font-semibold text-lg text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <a href="#referral-form" className={ctaClass}>
              Start a referral
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 md:py-20" aria-labelledby="benefits-heading">
        <div className="max-w-6xl mx-auto px-5">
          <h2 id="benefits-heading" className="text-2xl md:text-3xl font-bold text-center uppercase tracking-wide">
            Why agents partner with Sueep
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Faster closings",
                desc: "Move-ready homes: fresh paint and professional cleaning help listings show better and satisfy buyer walkthroughs.",
              },
              {
                title: "Higher perceived value",
                desc: "Polished spaces photograph stronger and support your pricing strategy without you managing vendors.",
              },
              {
                title: "One trusted partner",
                desc: "Residential painting and commercial-style cleaning programs — coordinated crews and clear communication.",
              },
              {
                title: "You look like the expert",
                desc: "You’re introducing a vetted team your clients can rely on before and after the sale.",
              },
              {
                title: "Simple handoff",
                desc: "No juggling multiple quotes. We take it from your referral to scoped work and scheduling.",
              },
              {
                title: "Transparent payouts",
                desc: "Tiered referral fees so you know what to expect when the job wraps.",
              },
            ].map((b) => (
              <div key={b.title} className="rounded-xl border border-gray-100 bg-gray-50/80 p-6">
                <p className="font-semibold text-[#E73C6E] text-sm uppercase tracking-wide">{b.title}</p>
                <p className="mt-2 text-sm text-gray-700 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <a href="#referral-form" className={ctaClass}>
              Refer a client now
            </a>
          </div>
        </div>
      </section>

      {/* Payout tiers */}
      <section className="py-16 md:py-20 bg-gray-900 text-white" aria-labelledby="payout-heading">
        <div className="max-w-6xl mx-auto px-5">
          <h2 id="payout-heading" className="text-2xl md:text-3xl font-bold text-center uppercase tracking-wide">
            Payout structure
          </h2>
          <p className="mt-3 text-center text-gray-400 max-w-2xl mx-auto text-sm sm:text-base">
            Illustrative tiers — final amounts confirmed when the job is quoted. Subject to program terms.
          </p>
          <div className="mt-10 max-w-3xl mx-auto overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm text-left min-w-[320px]">
              <thead>
                <tr className="bg-gray-800 border-b border-gray-700">
                  <th className="px-4 py-3 font-semibold">Job type / size</th>
                  <th className="px-4 py-3 font-semibold text-right">Referral range</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {[
                  { tier: "Small — touch-up paint or basic cleaning", range: "$150 – $250" },
                  { tier: "Medium — full room paint or deep clean", range: "$250 – $350" },
                  { tier: "Large — multi-room paint or move-in/out", range: "$350 – $500+" },
                ].map((row) => (
                  <tr key={row.tier} className="bg-gray-900/50">
                    <td className="px-4 py-3 text-gray-300">{row.tier}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#ff7aa3] whitespace-nowrap">
                      {row.range}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-xs text-gray-500 max-w-xl mx-auto">
            Payouts issued after referred work is completed and invoiced. One referral fee per distinct job unless otherwise agreed in writing.
          </p>
          <div className="mt-8 text-center">
            <a
              href="#referral-form"
              className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg bg-[#E73C6E] text-white text-sm font-semibold hover:opacity-90 min-h-[48px]"
            >
              Lock in your next referral
            </a>
          </div>
        </div>
      </section>

      {/* Form */}
      <section id="referral-form" className="py-16 md:py-20 bg-gray-50 scroll-mt-20">
        <div className="max-w-2xl mx-auto px-5">
          <h2 className="text-2xl md:text-3xl font-bold text-center uppercase">Referral submission</h2>
          <p className="mt-2 text-center text-gray-600 text-sm">
            Tell us about your client and the property. We&apos;ll reach out right away.
          </p>
          <form
            method="post"
            action="/api/referrals"
            className="mt-10 grid grid-cols-1 gap-4 bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm"
            autoComplete="on"
          >
            <input type="text" name="_honey" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <div>
              <label htmlFor="agentName" className="block text-sm font-medium text-gray-700 mb-1">
                Agent name <span className="text-red-500">*</span>
              </label>
              <input
                id="agentName"
                name="agentName"
                type="text"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label htmlFor="agentContact" className="block text-sm font-medium text-gray-700 mb-1">
                Agent contact info <span className="text-red-500">*</span>
              </label>
              <input
                id="agentContact"
                name="agentContact"
                type="text"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
                placeholder="Email and/or phone"
              />
            </div>
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-1">
                Client name <span className="text-red-500">*</span>
              </label>
              <input
                id="clientName"
                name="clientName"
                type="text"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
                placeholder="Client’s name"
              />
            </div>
            <div>
              <label htmlFor="propertyAddress" className="block text-sm font-medium text-gray-700 mb-1">
                Property address <span className="text-red-500">*</span>
              </label>
              <input
                id="propertyAddress"
                name="propertyAddress"
                type="text"
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
                placeholder="Street, city, state, ZIP"
              />
            </div>
            <div>
              <label htmlFor="serviceType" className="block text-sm font-medium text-gray-700 mb-1">
                Service type <span className="text-red-500">*</span>
              </label>
              <select
                id="serviceType"
                name="serviceType"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
              >
                <option value="" disabled>
                  Select a service
                </option>
                <option value="Painting">Painting</option>
                <option value="Cleaning">Cleaning</option>
                <option value="Painting & Cleaning">Painting & Cleaning</option>
              </select>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#E73C6E]/40 focus:border-[#E73C6E]"
                placeholder="Timing, scope, special instructions, or how you’d like us to introduce ourselves"
              />
            </div>
            <button type="submit" className={`${ctaClass} mt-2`}>
              Submit referral
            </button>
          </form>
        </div>
      </section>

      {/* Trust */}
      <section className="py-16 md:py-20 border-t border-gray-100" aria-labelledby="trust-heading">
        <div className="max-w-6xl mx-auto px-5">
          <h2 id="trust-heading" className="text-2xl md:text-3xl font-bold text-center uppercase">
            Results agents notice
          </h2>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-center">
            {[
              { stat: "20+", label: "Years serving properties" },
              { stat: "500k+", label: "Sq ft under janitorial programs" },
              { stat: "PA • NJ • MD • NY", label: "Service footprint" },
              { stat: "GC‑trusted", label: "Repeat builder partners" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                <p className="text-lg md:text-xl font-extrabold text-[#E73C6E]">{s.stat}</p>
                <p className="mt-1 text-xs text-gray-600">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 grid md:grid-cols-2 gap-6">
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 aspect-[4/3]">
              <Image
                src="/referrals/before.png"
                alt="Home exterior before paint refresh"
                fill
                className="object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white text-sm font-semibold">Before</p>
              </div>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 aspect-[4/3]">
              <Image
                src="/referrals/after.png"
                alt="Home exterior after professional painting"
                fill
                className="object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white text-sm font-semibold">After</p>
              </div>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-gray-500 max-w-2xl mx-auto">
            Photos representative of portfolio work. Every job is scoped to your client&apos;s property and timeline.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center items-stretch">
            <a href="#referral-form" className={ctaClass}>
              Submit another referral
            </a>
            <Link href="/" className={ctaSecondaryClass}>
              Back to Sueep home
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-black text-gray-400 text-sm py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Sueep LLC. Agent referral program.</p>
          <a href="tel:+12672173596" className="text-[#E73C6E] hover:text-white font-medium">
            (267) 217-3596
          </a>
        </div>
      </footer>
    </main>
  );
}
