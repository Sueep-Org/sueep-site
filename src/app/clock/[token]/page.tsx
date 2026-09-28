import type { Metadata, Viewport } from "next";
import { ClockApp } from "./ClockApp";

export const metadata: Metadata = {
  title: "Clock in",
  robots: { index: false, follow: false },
  // Lets janitors "Add to Home Screen" and open it like an app.
  appleWebApp: { capable: true, title: "Sueep Clock", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#E73C6E",
};

type PageProps = { params: Promise<{ token: string }> };

export default async function ClockPage({ params }: PageProps) {
  const { token } = await params;
  return <ClockApp token={token} />;
}
