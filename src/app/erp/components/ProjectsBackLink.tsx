"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PROJECTS_LIST_URL_STORAGE_KEY } from "@/lib/erp/projectsListUrl";

/**
 * A "back to projects" link that reads the last projects-list URL (tab/status
 * included) that ProjectsTabs persisted to sessionStorage, so going back
 * lands on the same tab instead of always resetting to "All". Falls back to
 * the plain list URL when nothing was persisted (e.g. this page was opened
 * from somewhere other than the projects list). Shared by the project detail
 * page's "← Projects" link and the building detail page's "Back to
 * projects" link.
 */
export function ProjectsBackLink({ label = "← Projects" }: { label?: string }) {
  const [href, setHref] = useState("/erp/projects");

  useEffect(() => {
    const stored = sessionStorage.getItem(PROJECTS_LIST_URL_STORAGE_KEY);
    if (stored && stored.startsWith("/erp/projects")) setHref(stored);
  }, []);

  return (
    <Link href={href} className="text-xs text-pink-600 hover:underline">
      {label}
    </Link>
  );
}
