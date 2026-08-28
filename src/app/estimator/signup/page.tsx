import Link from "next/link";
import { EstimatorAuthForm } from "../components/EstimatorAuthForm";

export default function EstimatorSignupPage() {
  return <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5"><section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><h1 className="text-2xl font-semibold">Create an estimator account</h1><p className="mb-6 mt-2 text-sm text-slate-600">Your account is separate from Sueep internal accounts.</p><EstimatorAuthForm mode="signup" /><p className="mt-5 text-center text-sm text-slate-600">Already registered? <Link className="text-pink-700 hover:underline" href="/estimator/login">Sign in</Link></p></section></main>;
}