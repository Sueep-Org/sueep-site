import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import PaintingFollowUpFlow from "@/app/(marketing)/painting/PaintingFollowUpFlow";

export default async function ThankYouPage({
  searchParams,
}: {
  // This project’s Next.js PageProps expects `searchParams` to be a Promise.
  // `await` also works if Next passes a plain object at runtime.
  searchParams?: Promise<{ status?: string; service?: string; deposit?: string }>;
}) {
  const sp = (searchParams ? await searchParams : undefined) ?? {};
  const service = String(sp.service || "").toLowerCase();
  const isCleaning = service === "cleaning";
  const status = String(sp.status || "").toLowerCase();
  const isOk = status === "ok";
  const deposit = String(sp.deposit || "").toLowerCase();
  const depositPaid = deposit === "paid";
  const depositSimulated = deposit === "simulated";
  const paintingQuoteFlow = service === "painting" && isOk && !depositPaid && !depositSimulated;
  return (
    <main className="bg-white text-gray-900">
      {isCleaning && isOk && (
        <Script id="cleaning-lead-form-conversion" strategy="afterInteractive">
          {`
if (typeof gtag === 'function') {
  console.log('[Ads] Cleaning lead-form conversion firing');
  gtag('event', 'conversion', {
    'send_to': 'AW-17637968786/DIKoCOSw7oQcEJKXuNpB',
    'value': 1.0,
    'currency': 'USD'
  });
} else {
  console.warn('[Ads] gtag is not defined; cleaning conversion not sent.');
}
          `}
        </Script>
      )}
      <section
        className={
          paintingQuoteFlow
            ? "py-6 md:py-8"
            : "min-h-[66vh] flex flex-col justify-center py-10 md:py-14"
        }
      >
        <div
          className={`mx-auto px-4 sm:px-6 text-center ${paintingQuoteFlow ? "max-w-5xl" : "max-w-3xl"}`}
        >
          <div
            className={`mx-auto flex items-center justify-center rounded-full bg-pink-100 text-[#E73C6E] ${
              paintingQuoteFlow ? "mb-3 h-11 w-11" : "mb-6 h-16 w-16"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={paintingQuoteFlow ? "h-5 w-5" : "h-8 w-8"}
              aria-hidden="true"
            >
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 15-5-5 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7Z"/>
            </svg>
          </div>
          <h1
            className={`font-extrabold uppercase tracking-wide ${
              paintingQuoteFlow ? "text-xl sm:text-2xl md:text-3xl" : "text-3xl md:text-4xl"
            }`}
          >
            Thanks—your request was received
          </h1>
          <p
            className={`mx-auto max-w-2xl text-gray-700 ${paintingQuoteFlow ? "mt-2 text-sm sm:text-base" : "mt-4 text-lg"}`}
          >
            A Sueep team member will reach out shortly to confirm details and timing.
          </p>
          {service === "painting" && depositPaid && (
            <p className="mt-3 text-sm text-gray-700 max-w-2xl mx-auto font-medium">
              Your deposit was received — thank you. We&apos;ll confirm your scope and schedule shortly.
            </p>
          )}
          {service === "painting" && depositSimulated && (
            <p className="mt-3 text-sm text-amber-800 max-w-2xl mx-auto bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Test mode: deposit was not charged. This confirmation is for local testing only.
            </p>
          )}
          {service === "painting" && isOk && !depositPaid && !depositSimulated && (
            <>
              <p className="mx-auto mt-2 max-w-2xl text-xs text-gray-600 sm:text-sm">
                <strong className="text-gray-800">We&apos;re on it.</strong> Answer a few quick questions for your range
                and optional deposit — same browser you used to submit works best.
              </p>
              <div className="mx-auto mt-5 w-full max-w-5xl text-left">
                <PaintingFollowUpFlow variant="thankYou" />
              </div>
              <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-gray-500">
                Financing: ask about Acorn Finance when we follow up.
              </p>
            </>
          )}
          {service === "painting" && (!isOk || depositPaid || depositSimulated) && (
            <p className="mt-3 text-sm text-gray-600 max-w-2xl mx-auto">
              Need flexibility? Ask us about financing options available through Acorn Finance.
            </p>
          )}
          {paintingQuoteFlow ? (
            <p className="mt-3 text-center text-xs text-gray-500">
              <a href="/painting#estimate-form" className="font-medium text-[#E73C6E] hover:underline">
                New painting estimate
              </a>
              <span className="mx-2 text-gray-300">|</span>
              <Link href="/painting" className="font-medium text-gray-600 hover:underline">
                Back to painting
              </Link>
            </p>
          ) : (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {isCleaning ? (
                <>
                  <a
                    href="/commercial-cleaning#estimate-form"
                    className="px-6 py-3 bg-[#E73C6E] text-white rounded-md font-medium hover:opacity-90"
                  >
                    Submit Another Cleaning Request
                  </a>
                  <Link
                    href="/commercial-cleaning"
                    className="px-6 py-3 border border-gray-300 rounded-md font-medium hover:bg-gray-50"
                  >
                    Back to Commercial Cleaning Page
                  </Link>
                </>
              ) : (
                <>
                  <a
                    href="/painting#estimate-form"
                    className="px-6 py-3 bg-[#E73C6E] text-white rounded-md font-medium hover:opacity-90"
                  >
                    Submit Another Painting Request
                  </a>
                  <Link
                    href="/painting"
                    className="px-6 py-3 border border-gray-300 rounded-md font-medium hover:bg-gray-50"
                  >
                    Back to Painting Page
                  </Link>
                </>
              )}
            </div>
          )}
          <p className={`text-sm text-gray-600 ${paintingQuoteFlow ? "mt-3" : "mt-6"}`}>
            Prefer to talk?{" "}
            <a className="font-semibold" href="tel:+12672173596">
              267-217-3596
            </a>
          </p>
        </div>
      </section>
      <footer className="bg-black text-gray-400 text-sm py-6">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center justify-center gap-3">
            <Image src="/sueeplogo.png" alt="Sueep logo" width={64} height={64} className="h-12 md:h-14 lg:h-16 w-auto" />
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


