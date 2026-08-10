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
  submittedRoles,
}: {
  submitted: boolean;
  role: "cleaner" | "painter";
  /** Which role(s) were actually checked on a successful submission — may
   * differ from `role` (the landing/page-view role) now that applicants can
   * select both. Only meaningful when `submitted` is true. */
  submittedRoles?: { cleaner: boolean; painter: boolean };
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
    if (!submitted || !window.fbq || !submittedRoles) return;

    // Both can fire now that an applicant may check both Cleaner and
    // Painter — no longer mutually exclusive like the page-view effect
    // above. `init` is called again here (not just relying on the
    // page-view effect above) since a visitor who landed on the
    // generic/cleaner URL but then also checked Painter would never
    // otherwise have inited that pixel.
    if (submittedRoles.painter) {
      window.fbq("init", PAINTER_PIXEL_ID);
      window.fbq("trackSingle", PAINTER_PIXEL_ID, "Lead", {
        content_name: "Painter Application",
        content_category: "Careers",
      });
    }
    if (submittedRoles.cleaner) {
      window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "Lead", {
        content_name: "Job Application",
        content_category: "Careers",
      });
    }
  }, [submitted, submittedRoles]);

  return null;
}
