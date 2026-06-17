import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Sueep",
  description:
    "Sueep privacy policy, including mobile opt-in, SMS consent, and how we handle phone numbers for text messaging.",
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
          <p className="mt-3 text-gray-600">Last updated: June 9, 2026</p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 py-10 md:py-14 space-y-10 text-gray-800 leading-relaxed">
        <section>
          <p>
            Sueep LLC (&quot;Sueep,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This policy
            describes how we collect, use, and protect personal information when you interact with our website,
            services, and communications.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Mobile Opt-In &amp; SMS Consent</h2>
          <p className="mt-3">
            Mobile opt-in, SMS consent, and phone numbers collected for SMS communication purposes will not be
            shared with any third party or affiliates for marketing purposes.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">SMS Terms &amp; Conditions</h2>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">1. SMS Consent Communication</h3>
            <p className="mt-2">
              Information (phone numbers) obtained as part of the SMS consent process will not be shared with third
              parties for marketing purposes.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">2. Types of SMS Communications</h3>
            <p className="mt-2">
              If consent has been given to receive text messages from Sueep, messages may be received related to the
              following:
            </p>
            <ul className="mt-3 list-disc pl-6 space-y-2">
              <li>Appointment reminders</li>
              <li>Follow-up messages</li>
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
              Message frequency may vary depending on the type of communication. For example, up to 10 SMS messages per
              week may be received related to appointments, billing, and similar updates.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">4. Potential Fees for SMS Messaging</h3>
            <p className="mt-2">
              Standard message and data rates may apply, depending on the carrier&apos;s pricing plan. These fees may
              vary if the message is sent domestically or internationally.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">5. Opt-In Method</h3>
            <p className="mt-2">
              They fill out our website form on our contact page. By checking this box, I consent to receive SMS from
              Sueep LLC related to Marketing and General follow-up SMS. Reply STOP to opt-out; Reply HELP for support;
              Message &amp; data rates may apply; Messaging frequency may vary. Visit{" "}
              <a href="https://sueep.com/privacy" className="text-[#E73C6E] font-medium hover:underline">
                https://sueep.com/privacy
              </a>{" "}
              to see our privacy policy.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">6. Opt-Out Method</h3>
            <p className="mt-2">
              Opting out of receiving SMS messages can be done at any time by replying &quot;STOP&quot; to any SMS
              message received. Alternatively, direct contact can be made to request removal from the messaging list.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900">7. Help</h3>
            <p className="mt-2">
              For any issues, reply with the keyword HELP. Alternatively, help can be obtained directly from us at{" "}
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

        <section>
          <h2 className="text-xl font-semibold text-gray-900">Contact</h2>
          <p className="mt-3">
            Questions about this policy:{" "}
            <a href="mailto:contact@sueep.com" className="text-[#E73C6E] font-medium hover:underline">
              contact@sueep.com
            </a>{" "}
            or{" "}
            <a href="tel:+12672173596" className="text-[#E73C6E] font-medium hover:underline">
              (267) 217-3596
            </a>
            .
          </p>
        </section>
      </article>

      <footer className="bg-black text-gray-400 text-sm py-6 mt-auto">
        <div className="max-w-3xl mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/#contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
