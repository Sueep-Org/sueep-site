import Link from "next/link";
import { EstimatorAuthForm } from "../components/EstimatorAuthForm";

export default function EstimatorLoginPage() {
  return <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5"><section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><h1 className="text-2xl font-semibold">Sign in to Estimator</h1><p className="mb-6 mt-2 text-sm text-slate-600">Use your standalone estimator account.</p><EstimatorAuthForm mode="signin" /><div className="mt-5 flex justify-between text-sm"><Link className="text-pink-700 hover:underline" href="/estimator/signup">Create account</Link><Link className="text-slate-600 hover:underline" href="/estimator/forgot-password">Forgot password?</Link></div></section></main>;
}