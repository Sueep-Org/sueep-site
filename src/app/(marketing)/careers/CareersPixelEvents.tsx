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

type SubmittedRoles = { cleaner: boolean; painter: boolean; supervisor: boolean };

/** Fires the ad-platform "Lead" conversion. Called from CareersApplicationForm
 * as soon as step 1 (the base application: name/contact/role/experience/
 * vehicle) is saved, not after step 2 (the optional subcontractor
 * questionnaire) completes — that's the moment we actually have a callable
 * candidate on file, same reasoning as why step 1 saves to the ERP
 * immediately instead of waiting for a final submit. */
export function fireCareersLeadPixels(roles: SubmittedRoles) {
  if (!window.fbq) return;

  // Both can fire since an applicant may check more than one box — no longer
  // mutually exclusive like the page-view effect below. `init` is called
  // again here (not just relying on the page-view effect) since a visitor
  // who landed on the generic/cleaner URL but then also checked Painter
  // would never otherwise have inited that pixel.
  if (roles.painter) {
    window.fbq("init", PAINTER_PIXEL_ID);
    window.fbq("trackSingle", PAINTER_PIXEL_ID, "Lead", {
      content_name: "Painter Application",
      content_category: "Careers",
    });
  }
  // Supervisor has no dedicated ad pixel yet, so it's folded into the
  // sitewide Lead alongside Cleaner.
  if (roles.cleaner || roles.supervisor) {
    window.fbq("trackSingle", SITEWIDE_PIXEL_ID, "Lead", {
      content_name: "Job Application",
      content_category: "Careers",
    });
  }
}

export function CareersPixelEvents({ role }: { role: "cleaner" | "painter" | "supervisor" }) {
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

  return null;
}
