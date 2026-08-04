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

// Dedicated pixel for the painter application path only. Inited here (not in
// layout.tsx) so it loads only for people on /careers?role=painter, not every
// marketing page visitor.
const PAINTER_PIXEL_ID = "248346263857750";

export function CareersPixelEvents({
  submitted,
  role,
}: {
  submitted: boolean;
  role: "cleaner" | "painter";
}) {
  const isPainter = role === "painter";

  useEffect(() => {
    if (!window.fbq) return;

    if (isPainter) {
      // Painter applicants are tracked only on their own dedicated pixel,
      // not the sitewide one.
      window.fbq("init", PAINTER_PIXEL_ID);
      window.fbq("trackSingle", PAINTER_PIXEL_ID, "PageView");
      window.fbq("trackSingle", PAINTER_PIXEL_ID, "ViewContent", {
        content_name: "Painter Application",
        content_category: "Careers",
      });
      return;
    }

    // Fired for every non-painter visitor to the careers page — used by
    // Meta to build a retargeting audience of people who showed interest
    // in the job ad.
    window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "ViewContent", {
      content_name: "Careers",
      content_category: "Job Application",
    });
  }, [isPainter]);

  useEffect(() => {
    if (!submitted || !window.fbq) return;

    if (isPainter) {
      window.fbq("trackSingle", PAINTER_PIXEL_ID, "Lead", {
        content_name: "Painter Application",
        content_category: "Careers",
      });
      return;
    }

    // Fired only when a non-painter application was submitted successfully.
    // This is the conversion event Meta uses to optimise ad delivery.
    window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "Lead", {
      content_name: "Job Application",
      content_category: "Careers",
    });
  }, [submitted, isPainter]);

  return null;
}
