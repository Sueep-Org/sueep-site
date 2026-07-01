"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// The sitewide pixel inited in layout.tsx. Scoped explicitly with trackSingle so
// these events only ever go here — other pages (e.g. the real estate turnover
// form) init their own pixel, and since fbq state persists across client-side
// navigation, a generic `track` call here would also broadcast to any other
// pixel a visitor happened to pick up earlier in the same session.
const SITEWIDE_PIXEL_ID = "2075712983059747";

export function CareersPixelEvents({ submitted }: { submitted: boolean }) {
  useEffect(() => {
    if (!window.fbq) return;
    // Fired for every visitor to the careers page — used by Meta to build
    // a retargeting audience of people who showed interest in the job ad.
    window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "ViewContent", {
      content_name: "Careers",
      content_category: "Job Application",
    });
  }, []);

  useEffect(() => {
    if (!submitted || !window.fbq) return;
    // Fired only when the application was submitted successfully.
    // This is the conversion event Meta uses to optimise ad delivery.
    window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "Lead", {
      content_name: "Job Application",
      content_category: "Careers",
    });
  }, [submitted]);

  return null;
}
