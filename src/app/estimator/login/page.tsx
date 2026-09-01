import Image from "next/image";
import Link from "next/link";
import { EstimatorAuthForm } from "../components/EstimatorAuthForm";

export default function EstimatorLoginPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5">
      <section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/estimator/piramid-full-logo.png"
            alt="Piramid"
            width={172}
            height={163}
            className="mb-6 h-36 w-auto"
            priority
          />
        </div>
        <EstimatorAuthForm mode="signin" />
        <div className="mt-5 flex justify-between text-sm">
          <Link className="text-green-700 hover:underline" href="/estimator/signup">Create account</Link>
          <Link className="text-slate-600 hover:underline" href="/estimator/forgot-password">Forgot password?</Link>
        </div>
      </section>
    </main>
  );
}
