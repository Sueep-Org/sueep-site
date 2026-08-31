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
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex flex-1 items-center justify-center gap-3">
            <a href="/estimator" className="font-semibold tracking-tight">
              Sueep Estimator
            </a>
            <div className="ml-12">
              <EstimatorProfileMenu />
            </div>
          </div>
        </header>
        {children}
      </div>
    </EstimatorAuthProvider>
  );
}
