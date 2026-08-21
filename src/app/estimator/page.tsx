"use client";

import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

export default function StandaloneEstimatorPage() {
  const { user, loading } = useEstimatorAuth();
  if (loading || !user) return <main className="p-8 text-sm text-slate-600">Loading estimator...</main>;
  return <main className="mx-auto max-w-5xl px-5 py-10"><h1 className="text-3xl font-semibold">Estimator workspace</h1><p className="mt-2 text-slate-600">Welcome, {user.displayName || user.email}. Your standalone estimator account is ready.</p><div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">Estimator tools will be connected to this authenticated workspace in the next phase.</div></main>;
}