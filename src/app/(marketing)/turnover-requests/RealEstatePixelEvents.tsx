"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Dedicated Meta dataset for real estate turnover leads — inited here (rather than
// in the shared marketing layout) so it only registers on this form and stays
// separate from the sitewide pixel used everywhere else on the site.
const REAL_ESTATE_DATASET_ID = "175368391220071";

export function RealEstatePixelEvents({ leadSubmitted }: { leadSubmitted: boolean }) {
  useEffect(() => {
    if (!window.fbq) return;
    window.fbq("init", REAL_ESTATE_DATASET_ID);
    window.fbq("trackSingle", REAL_ESTATE_DATASET_ID, "PageView");
  }, []);

  useEffect(() => {
    if (!leadSubmitted || !window.fbq) return;
    // Fired once the turnover request + signed contract are successfully submitted —
    // the conversion event this dataset uses to optimise real estate lead ads.
    window.fbq("trackSingle", REAL_ESTATE_DATASET_ID, "Lead", {
      content_name: "Real Estate Turnover Request",
      content_category: "Turnover Requests",
    });
  }, [leadSubmitted]);

  return null;
}
