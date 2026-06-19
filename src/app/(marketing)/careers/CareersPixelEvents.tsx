"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function CareersPixelEvents({ submitted }: { submitted: boolean }) {
  useEffect(() => {
    if (!window.fbq) return;
    // Fired for every visitor to the careers page — used by Meta to build
    // a retargeting audience of people who showed interest in the job ad.
    window.fbq("track", "ViewContent", {
      content_name: "Careers",
      content_category: "Job Application",
    });
  }, []);

  useEffect(() => {
    if (!submitted || !window.fbq) return;
    // Fired only when the application was submitted successfully.
    // This is the conversion event Meta uses to optimise ad delivery.
    window.fbq("track", "Lead", {
      content_name: "Job Application",
      content_category: "Careers",
    });
  }, [submitted]);

  return null;
}
