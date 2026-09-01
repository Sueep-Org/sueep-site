import Image from "next/image";
import Link from "next/link";
import { EstimatorAuthForm } from "../components/EstimatorAuthForm";

export default function EstimatorSignupPage() {
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
        <EstimatorAuthForm mode="signup" />
        <p className="mt-5 text-center text-sm text-slate-600">
          Already registered? <Link className="text-green-700 hover:underline" href="/estimator/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
