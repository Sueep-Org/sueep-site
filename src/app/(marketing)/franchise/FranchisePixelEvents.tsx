"use client";

import { useEffect } from "react";

// Dedicated pixel for franchise ads. Inited here (not in layout.tsx) so it
// loads only for /franchise visitors, same pattern as the painter pixel in
// careers/CareersPixelEvents.tsx. Every call uses trackSingle so franchise
// events never reach the sitewide pixel or any other pixel a visitor picked
// up earlier in the same session.
export const FRANCHISE_PIXEL_ID = "175368391220071";

/** Fired once step 1 (name/contact/city) is saved to the ERP, the moment we
 * have a contactable franchise lead on file, mirroring how the careers form
 * fires Lead after its first step. */
export function fireFranchiseLeadPixel() {
  if (!window.fbq) return;
  window.fbq("init", FRANCHISE_PIXEL_ID);
  window.fbq("trackSingle", FRANCHISE_PIXEL_ID, "Lead", {
    content_name: "Franchise Inquiry",
    content_category: "Franchise",
  });
}

/** Fired when the full application (step 2) is submitted. */
export function fireFranchiseApplicationPixel() {
  if (!window.fbq) return;
  window.fbq("init", FRANCHISE_PIXEL_ID);
  window.fbq("trackSingle", FRANCHISE_PIXEL_ID, "SubmitApplication", {
    content_name: "Franchise Application",
    content_category: "Franchise",
  });
}

export function FranchisePixelEvents() {
  useEffect(() => {
    if (!window.fbq) return;
    window.fbq("init", FRANCHISE_PIXEL_ID);
    window.fbq("trackSingle", FRANCHISE_PIXEL_ID, "PageView");
    window.fbq("trackSingle", FRANCHISE_PIXEL_ID, "ViewContent", {
      content_name: "Franchise Opportunities",
      content_category: "Franchise",
    });
  }, []);

  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        height="1"
        width="1"
        style={{ display: "none" }}
        src={`https://www.facebook.com/tr?id=${FRANCHISE_PIXEL_ID}&ev=PageView&noscript=1`}
        alt=""
      />
    </noscript>
  );
}
