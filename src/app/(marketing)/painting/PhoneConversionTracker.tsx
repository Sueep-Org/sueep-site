 "use client";

import { useEffect } from "react";
import Script from "next/script";

declare function gtag_report_conversion(url?: string): void;

export default function PhoneConversionTracker() {
  useEffect(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')
    );

    const handleClick = (_event: MouseEvent) => {
      if (typeof gtag_report_conversion === "function") {
        gtag_report_conversion();
      }
    };

    links.forEach((link) => link.addEventListener("click", handleClick));

    return () => {
      links.forEach((link) => link.removeEventListener("click", handleClick));
    };
  }, []);

  return (
    <Script id="painting-click-to-call-conversion" strategy="afterInteractive">
      {`
function gtag_report_conversion() {
  console.log('[Ads] Painting click-to-call conversion firing');
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', {
        'send_to': 'AW-17637968786/jALoCK7Yy4QcEJKXuNpB',
        'value': 1.0,
        'currency': 'USD'
    });
  } else {
    console.warn('[Ads] gtag is not defined; click-to-call conversion not sent.');
  }
  return false;
}
      `}
    </Script>
  );
}

