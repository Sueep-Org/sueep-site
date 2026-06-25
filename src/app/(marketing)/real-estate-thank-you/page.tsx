import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request Confirmed | Sueep",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ status?: string; deposit?: string }> };

export default async function RealEstateThankyouPage({ searchParams }: Props) {
  const sp = await searchParams;
  const depositPaid = String(sp.deposit || "").toLowerCase() === "paid";

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-[#E73C6E]">
          <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-1 15-5-5 1.41-1.41L11 14.17l5.59-5.59L18 10l-7 7Z" />
          </svg>
        </div>

        <h1 className="mt-6 text-3xl font-extrabold text-gray-900 md:text-4xl">
          You&apos;re all set!
        </h1>

        <p className="mx-auto mt-4 max-w-md text-base text-gray-600">
          Your agreement has been signed and your request submitted to Sueep.
        </p>

        {depositPaid && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-green-200 bg-green-50 px-5 py-4">
            <p className="text-sm font-medium text-green-900">Deposit received — thank you.</p>
            <p className="mt-1 text-sm text-green-700">
              Your 50% deposit has been processed. We&apos;ll confirm your schedule and scope shortly.
            </p>
          </div>
        )}

        <p className="mx-auto mt-6 max-w-sm text-sm text-gray-500">
          A Sueep team member will be in touch shortly to confirm details and timing. Questions?{" "}
          <a href="tel:+12672173596" className="font-semibold text-[#E73C6E]">
            267-217-3596
          </a>
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/turnover-requests"
            className="rounded-md bg-[#E73C6E] px-6 py-3 text-sm font-medium text-white hover:opacity-90"
          >
            Submit another request
          </Link>
          <Link
            href="/"
            className="rounded-md border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Sueep
          </Link>
        </div>
      </section>

      <footer className="bg-black py-6 text-sm text-gray-400">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-center gap-3">
            <Image src="/sueeplogo.png" alt="Sueep logo" width={64} height={64} className="h-12 w-auto" />
          </div>
          <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p>© {new Date().getFullYear()} Sueep LLC. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
              <a href="mailto:contact@sueep.com" className="hover:text-white">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
