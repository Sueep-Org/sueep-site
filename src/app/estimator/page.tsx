"use client";

import EstimatorApp from "@/app/erp/(shell)/estimator/page";
import { useEstimatorAuth } from "@/lib/estimatorAuthContext";

export default function StandaloneEstimatorPage() {
  const { user, loading } = useEstimatorAuth();

  if (loading || !user) {
    return (
      <main className="p-8 text-sm text-slate-600">Loading estimator...</main>
    );
  }

  return <EstimatorApp hideFloatingLibraryToggle />;
}
