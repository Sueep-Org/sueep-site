import { EstimatorAuthProvider } from "@/lib/estimatorAuthContext";
import { EstimatorProfileMenu } from "./components/EstimatorProfileMenu";

export default function EstimatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EstimatorAuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="flex items-center border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <a href="/estimator" className="font-semibold tracking-tight">
              Sueep Estimator
            </a>
            <EstimatorProfileMenu />
          </div>
        </header>
        {children}
      </div>
    </EstimatorAuthProvider>
  );
}
