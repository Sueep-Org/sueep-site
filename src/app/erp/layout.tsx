import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Operations", template: "%s | Sueep" },
  description: "Internal operations — projects, labor, and costs.",
  robots: { index: false, follow: false },
};

export default function ErpRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-zinc-900 antialiased">{children}</div>;
}
