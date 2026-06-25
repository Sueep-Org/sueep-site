import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Sueep",
  description:
    "Sueep privacy policy — how we collect, use, and share your information, including mobile opt-in and SMS consent.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="bg-white text-gray-900 min-h-screen">
      <header className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-3xl mx-auto px-5 py-10 md:py-14">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-[#E73C6E]">
            ← Back to Sueep
          </Link>
          <h1 className="mt-6 text-3xl md:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-3 text-gray-600">Last updated: June 25, 2026</p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 py-10 md:py-14 space-y-10 text-gray-800 leading-relaxed">

        {/* Introduction */}
        <section>
          <p>
            Sueep LLC (&quot;Sueep,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard personal information
            when you visit our website, contact us, or use our services. Please read this policy carefully. If you
            disagree with its terms, please discontinue use of our site and services.
          </p>
        </section>

        {/* Information We Collect */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Information We Collect</h2>
          <p className="mt-3">
            We collect personal information you provide directly to us and information generated through your
            interactions with us. This includes information collected when you:
          </p>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Fill out a contact, quote request, or service request form on our website</li>
            <li>Call, text, or email us</li>
            <li>Apply for a job or submit a career inquiry</li>
            <li>Communicate with us about our services</li>
            <li>Opt in to receive SMS or marketing communications</li>
          </ul>
          <p className="mt-4">The types of personal information we may collect include:</p>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Name and contact information (email address, phone number, mailing address)</li>
            <li>Property or service address</li>
            <li>Job application information (resume, work history, references)</li>
            <li>Communication records (calls, texts, emails, form submissions)</li>
            <li>SMS consent and mobile opt-in information</li>
            <li>Usage data and technical information collected automatically when you visit our website (such as
              IP address, browser type, pages visited, and referring URLs)</li>
          </ul>
        </section>

        {/* How We Use Your Information */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">How We Use Your Information</h2>
          <p className="mt-3">We use the information we collect to:</p>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Respond to inquiries and provide quotes for our services</li>
            <li>Schedule and manage cleaning and painting services</li>
            <li>Send appointment reminders and service updates</li>
            <li>Send marketing messages to customers who have opted in to receive them</li>
            <li>Process job applications and manage hiring</li>
            <li>Improve our website, services, and customer experience</li>
            <li>Comply with applicable legal obligations</li>
          </ul>
        </section>

        {/* How We Share Your Information */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">How We Share Your Information</h2>
          <p className="mt-3">
            We do not sell your personal information. We may share your information with trusted third-party service
            providers that assist us in operating our business — such as CRM systems, phone and SMS platforms, email
            services, and scheduling tools — solely to the extent necessary to provide our services and communicate
            with you.
          </p>
          <p className="mt-3">
            We may also disclose information when required by law, in response to legal process, or to protect the
            rights, property, or safety of Sueep, our customers, or others.
          </p>
          <p className="mt-4 font-semibold text-gray-900">
            Mobile Opt-In, SMS Consent, and phone numbers collected for SMS communication purposes will not be shared
            with any third party or affiliates for marketing purposes.
          </p>
        </section>

        {/* Mobile Opt-In & SMS Consent */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Mobile Opt-In &amp; SMS Consent</h2>
          <p className="mt-3">
            Mobile opt-in, SMS consent, and phone numbers collected for SMS communication purposes will not be
            shared with any third party or affiliates for marketing purposes.
          </p>
        </section>

        {/* SMS Terms & Conditions */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">SMS Terms &amp; Conditions</h2>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">1. SMS Consent Communication</h3>
            <p className="mt-2">
              Information (including phone numbers) obtained as part of the SMS consent process will not be shared
              with third parties for marketing purposes.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">2. Types of SMS Communications</h3>
            <p className="mt-2">
              If you have consented to receive text messages from Sueep for marketing purposes, you may receive
              messages related to:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>Appointment reminders and service updates</li>
              <li>Promotional offers and marketing communications</li>
              <li>Follow-up messages related to quotes or ongoing services</li>
            </ul>
            <p className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-4">
              Example: Thank you for reaching out to Sueep. We&apos;ve received your inquiry and are working on a
              solution. Our team will update you within 24–48 business hours. For any further questions, feel free to
              reply or contact us at{" "}
              <a href="tel:+12672173596" className="text-[#E73C6E] font-medium hover:underline">
                (267) 217-3596
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">3. Message Frequency</h3>
            <p className="mt-2">
              Message frequency may vary depending on the type of communication. For example, up to 10 SMS messages
              per week may be received related to appointments, promotions, and similar updates.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">4. Potential Fees for SMS Messaging</h3>
            <p className="mt-2">
              Standard message and data rates may apply, depending on your carrier&apos;s pricing plan. These fees
              may vary if the message is sent domestically or internationally.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">5. Opt-In Method</h3>
            <p className="mt-2">
              You may opt in to receive marketing SMS communications by checking the consent checkbox on our website
              contact form. By checking that box, you consent to receive SMS messages from Sueep LLC related to
              marketing and general follow-up. Standard messaging disclosures apply: Reply STOP to opt out; Reply
              HELP for support; Message &amp; data rates may apply; Messaging frequency may vary.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">6. Opt-Out Method</h3>
            <p className="mt-2">
              You may opt out of receiving marketing SMS messages at any time by replying &quot;STOP&quot; to any
              message received from us. You may also contact us directly to request removal from our messaging list.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">7. Help</h3>
            <p className="mt-2">
              For any issues, reply with the keyword HELP. You may also reach us directly at{" "}
              <a href="tel:+12672173596" className="text-[#E73C6E] font-medium hover:underline">
                (267) 217-3596
              </a>{" "}
              or{" "}
              <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
                contact@sueep.com
              </a>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">8. Standard Messaging Disclosures</h3>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>Message and data rates may apply.</li>
              <li>Opt out at any time by texting &quot;STOP.&quot;</li>
              <li>
                For assistance, text &quot;HELP&quot; or visit our{" "}
                <Link href="/privacy" className="text-[#E73C6E] font-medium hover:underline">
                  Privacy Policy
                </Link>
                .
              </li>
              <li>Message frequency may vary.</li>
            </ul>
          </div>
        </section>

        {/* Cookies and Tracking */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Cookies and Tracking Technologies</h2>
          <p className="mt-3">
            Our website may use cookies and similar tracking technologies to improve your browsing experience,
            analyze site traffic, and understand where visitors come from. You can control cookie settings through
            your browser. Disabling cookies may affect certain features of our website.
          </p>
        </section>

        {/* Data Security */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Data Security</h2>
          <p className="mt-3">
            We implement reasonable administrative, technical, and physical safeguards to protect your personal
            information from unauthorized access, disclosure, alteration, or destruction. However, no method of
            transmission over the internet or electronic storage is completely secure, and we cannot guarantee
            absolute security.
          </p>
        </section>

        {/* Data Retention */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Data Retention</h2>
          <p className="mt-3">
            We retain personal information for as long as necessary to fulfill the purposes described in this policy,
            comply with legal obligations, resolve disputes, and enforce our agreements. When information is no longer
            needed, we take reasonable steps to delete or de-identify it.
          </p>
        </section>

        {/* Children's Privacy */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Children&apos;s Privacy</h2>
          <p className="mt-3">
            Our services are not directed to children under the age of 13. We do not knowingly collect personal
            information from children under 13. If you believe we have inadvertently collected such information,
            please contact us so we can promptly delete it.
          </p>
        </section>

        {/* Your Rights and Choices */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Your Rights and Choices</h2>
          <p className="mt-3">You have the right to:</p>
          <ul className="mt-3 list-disc pl-6 space-y-2">
            <li>Request access to the personal information we hold about you</li>
            <li>Request correction of inaccurate information</li>
            <li>Request deletion of your personal information, subject to legal requirements</li>
            <li>Opt out of marketing SMS communications at any time by replying STOP</li>
            <li>Opt out of marketing emails by following the unsubscribe instructions in any email</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, please contact us using the information in the Contact section below.
          </p>
        </section>

        {/* Changes to This Policy */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Changes to This Policy</h2>
          <p className="mt-3">
            We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last
            updated&quot; date at the top of this page. We encourage you to review this policy periodically to stay
            informed about how we protect your information.
          </p>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
          <p className="mt-3">
            If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
          </p>
          <p className="mt-3">
            <strong>Sueep LLC</strong><br />
            Email:{" "}
            <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
              contact@sueep.com
            </a>
            <br />
            Phone:{" "}
            <a href="tel:+12672173596" className="text-[#E73C6E] font-medium hover:underline">
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
            <Link href="/#contact" className="hover:text-white">Contact</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
