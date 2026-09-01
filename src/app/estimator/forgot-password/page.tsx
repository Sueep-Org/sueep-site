import Link from "next/link";
import { EstimatorAuthForm } from "../components/EstimatorAuthForm";

export default function EstimatorForgotPasswordPage() {
  return <main className="mx-auto flex min-h-[calc(100vh-57px)] max-w-md items-center px-5"><section className="w-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm"><h1 className="text-2xl font-semibold">Reset your password</h1><p className="mb-6 mt-2 text-sm text-slate-600">We will email a password recovery link.</p><EstimatorAuthForm mode="reset" /><p className="mt-5 text-center text-sm"><Link className="text-green-700 hover:underline" href="/estimator/login">Back to sign in</Link></p></section></main>;
}