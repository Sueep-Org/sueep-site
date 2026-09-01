import Image from "next/image";
import { EstimatorAuthProvider } from "@/lib/estimatorAuthContext";
import { EstimatorProfileMenu } from "./components/EstimatorProfileMenu";
import { HomeLogoLink } from "./components/HomeLogoLink";
import { LibraryButton } from "./components/LibraryButton";

export default function EstimatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EstimatorAuthProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <HomeLogoLink>
            <Image
              src="/estimator/piramid-logo.png"
              alt="Piramid"
              width={172}
              height={29}
              className="h-6 w-auto"
              priority
            />
            <span className="ml-2 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Beta
            </span>
          </HomeLogoLink>
          <div className="flex items-center gap-3">
            <LibraryButton />
            <EstimatorProfileMenu />
          </div>
        </header>
        {children}
      </div>
    </EstimatorAuthProvider>
  );
}
