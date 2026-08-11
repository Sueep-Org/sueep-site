"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PROJECTS_LIST_URL_STORAGE_KEY } from "../ProjectsTabs";

/**
 * "← Projects" link on the project detail page. Reads the last projects-list
 * URL (tab/status included) that ProjectsTabs persisted to sessionStorage, so
 * going back lands on the same tab instead of always resetting to "All".
 * Falls back to the plain list URL when nothing was persisted (e.g. the
 * project was opened from somewhere other than the projects list).
 */
export function ProjectsBackLink() {
  const [href, setHref] = useState("/erp/projects");

  useEffect(() => {
    const stored = sessionStorage.getItem(PROJECTS_LIST_URL_STORAGE_KEY);
    if (stored && stored.startsWith("/erp/projects")) setHref(stored);
  }, []);

  return (
    <Link href={href} className="text-xs text-pink-600 hover:underline">
      ← Projects
    </Link>
  );
}
