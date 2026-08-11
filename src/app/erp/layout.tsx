import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Operations", template: "%s | Sueep" },
  description: "Internal operations — projects, labor, and costs.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/sueepicon.jpeg?v=2", sizes: "32x32" },
      { url: "/sueepicon.jpeg?v=2", sizes: "16x16" },
    ],
    shortcut: "/sueepicon.jpeg?v=2",
    apple: "/sueepicon.jpeg?v=2",
  },
};

export default function ErpRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-gray-900 antialiased">{children}</div>;
}
