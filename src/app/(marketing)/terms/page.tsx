import Link from "next/link";
import type { Metadata } from "next";
import { MarketingNav } from "../components/MarketingNav";

export const metadata: Metadata = {
  title: "Terms of Use | Sueep",
  description: "Terms of use and end user license agreement for Sueep's website and the Sueep ERP business software.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
};

const link = "text-[#E73C6E] font-medium hover:underline";

export default function TermsPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen">
      <MarketingNav />
      <header className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-14">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Terms of Use and End User License Agreement</h1>
          <p className="mt-3 text-gray-600">Last updated: October 27, 2026</p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 py-10 md:py-14 space-y-10 text-gray-800 leading-relaxed">

        <section>
          <p>
            These terms apply to the Sueep website and to the Sueep ERP, the business software Sueep LLC
            (&quot;Sueep,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) uses to run its operations, including
            app.sueep.com. By using the website or signing in to the Sueep ERP, you agree to these terms. If you do not
            agree, please do not use them.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Who Can Use the Sueep ERP</h2>
          <p className="mt-3">
            The Sueep ERP is internal software for Sueep&apos;s own business. It is used by Sueep employees and by people
            Sueep invites, such as contractors and property managers who receive a private link. It is not offered for
            sale or for use by other companies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">License</h2>
          <p className="mt-3">
            Sueep grants you a limited, personal, non-exclusive, non-transferable and revocable license to use the Sueep
            ERP only for work you do for or with Sueep. You may not copy, sell, rent, reverse engineer or redistribute
            the software, or use it for any other purpose. Sueep may end this license or your access at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Your Account</h2>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Keep your login and any private links to yourself. You are responsible for activity under them.</li>
            <li>Tell us right away if you think someone else has used your account or link.</li>
            <li>Only access the information your role allows, and only for Sueep business.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Connected Services</h2>
          <p className="mt-3">
            The Sueep ERP connects to other services Sueep uses, such as Intuit QuickBooks Online and HubSpot. A
            connection is made only when an authorized Sueep administrator approves it, and it can be disconnected at any
            time from the Sueep ERP or from the other service&apos;s own settings.
          </p>
          <p className="mt-3">
            The QuickBooks connection reads Sueep&apos;s own QuickBooks company (reports, customers, invoices, payments and
            expenses) to show financial information inside the Sueep ERP. It does not change anything in QuickBooks.
            Each connected service is governed by its own terms and privacy policy, and Sueep is not responsible for those
            services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Your Information</h2>
          <p className="mt-3">
            Information in the Sueep ERP belongs to Sueep and is handled as described in our{" "}
            <Link href="/privacy" className={link}>Privacy Policy</Link>. We do not sell it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Acceptable Use</h2>
          <p className="mt-3">You agree not to:</p>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Try to get into accounts, data or parts of the system you are not allowed to use</li>
            <li>Interfere with the website or software, or upload anything harmful</li>
            <li>Share confidential Sueep, client or employee information outside of Sueep business</li>
            <li>Use the website or software in a way that breaks any law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">No Warranty</h2>
          <p className="mt-3">
            The website and the Sueep ERP are provided &quot;as is&quot; and &quot;as available,&quot; without warranties
            of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose and
            non-infringement. Figures shown in the software, such as financial summaries and deadlines, are for internal
            planning and are not legal, tax or accounting advice.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Limitation of Liability</h2>
          <p className="mt-3">
            To the fullest extent allowed by law, Sueep is not liable for any indirect, incidental, special, consequential
            or punitive damages, or for lost profits or data, arising from your use of the website or the Sueep ERP.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Changes to These Terms</h2>
          <p className="mt-3">
            We may update these terms from time to time. When we do, we will change the &quot;Last updated&quot; date at
            the top of this page. Continuing to use the website or the Sueep ERP after a change means you accept the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Governing Law</h2>
          <p className="mt-3">These terms are governed by the laws of the Commonwealth of Pennsylvania.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
          <p className="mt-3">Questions about these terms can be sent to:</p>
          <p className="mt-3">
            <strong>Sueep LLC</strong><br />
            Email:{" "}
            <a href="mailto:contact@sueep.com" className={link}>
              contact@sueep.com
            </a>
            <br />
            Phone:{" "}
            <a href="tel:+12672173596" className={link}>
              (267) 217-3596
            </a>
          </p>
        </section>

      </article>

      <footer className="bg-black text-gray-400 text-sm py-6 mt-auto">
        <div className="max-w-3xl mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/#contact" className="hover:text-white">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
