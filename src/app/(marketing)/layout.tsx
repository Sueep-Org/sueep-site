import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Sueep — Commercial Cleaning for Construction & Properties",
  description:
    "Commercial cleaning that keeps projects turnover‑ready: final cleans, unit turns, and janitorial programs across PA, NJ, and NY.",
  icons: {
    icon: [
      { url: "/sueepicon.jpeg?v=2", sizes: "32x32" },
      { url: "/sueepicon.jpeg?v=2", sizes: "16x16" },
    ],
    shortcut: "/sueepicon.jpeg?v=2",
    apple: "/sueepicon.jpeg?v=2",
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg", color: "#E73C6E" },
    ],
  },
  openGraph: {
    title: "Sueep — Commercial Cleaning for Construction & Properties",
    description:
      "Turnover‑ready final cleans, rapid unit turnovers, and janitorial programs across PA, NJ, and NY.",
  },
  twitter: {
    card: "summary",
    title: "Sueep — Commercial Cleaning for Construction & Properties",
    description: "Final cleans, unit turns, and janitorial programs delivered on schedule across PA, NJ, and NY.",
  },
};

/**
 * Public marketing site only — no GTM/HubSpot on /erp (internal ERP).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-53QSN796');`}
      </Script>
      <Script id="hs-init" strategy="beforeInteractive">
        {`window.hsConversationsSettings = window.hsConversationsSettings || {};
window.hsConversationsSettings.loadImmediately = true;`}
      </Script>
      <Script id="hs-script-loader" strategy="afterInteractive" src="https://js.hs-scripts.com/6686745.js" />
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','2075712983059747');fbq('track','PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} src="https://www.facebook.com/tr?id=2075712983059747&ev=PageView&noscript=1" alt="" />
      </noscript>
      {process.env.NODE_ENV === "development" ? (
        <Script id="suppress-hydration-warning-overlay" strategy="afterInteractive">
          {`
              (function () {
                try {
                  var originalError = console.error;
                  console.error = function () {
                    var args = Array.prototype.slice.call(arguments);
                    var msg = args && args[0];
                    var isHydrationAttrMismatch =
                      typeof msg === 'string' &&
                      (msg.indexOf("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties") !== -1 ||
                       msg.indexOf('Hydration failed because the initial UI does not match what was rendered on the server') !== -1);
                    if (isHydrationAttrMismatch) return;
                    return originalError.apply(console, args);
                  };
                } catch (e) {}
              })();
            `}
        </Script>
      ) : null}
      <noscript>
        <iframe
          src="https://www.googletagmanager.com/ns.html?id=GTM-53QSN796"
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
      {children}
    </>
  );
}
