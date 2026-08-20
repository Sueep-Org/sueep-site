import { EstimatorAuthProvider } from "@/lib/estimatorAuthContext";
import { EstimatorProfileMenu } from "./components/EstimatorProfileMenu";

export default function EstimatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <EstimatorAuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <a href="/estimator" className="font-semibold tracking-tight">Sueep Estimator</a>
          <EstimatorProfileMenu />
        </header>
        {children}
      </div>
    </EstimatorAuthProvider>
  );
}