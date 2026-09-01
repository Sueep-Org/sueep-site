"use client";

import { useRouter } from "next/navigation";

// The Library sidebar (#sidebarRoot, simple-app.js) only exists on the
// estimator canvas page itself, but this button lives in the shared header
// on every /estimator/* route (settings, company setup, etc). On those
// other pages a plain [data-open-sidebar] click used to just do nothing
// (see openSidebar()'s early-return in simple-app.js) -- this checks for
// that case and navigates to the canvas page first, then asks it to open
// the sidebar once there, instead of leaving the button looking dead.
export function LibraryButton() {
  const router = useRouter();

  function handleClick() {
    const w = window as unknown as { __estimatorOpenLibrary?: () => void };
    if (document.getElementById("sidebarRoot")) {
      // Already on the canvas page — the document-level [data-open-sidebar]
      // click listener in simple-app.js handles this click itself.
      return;
    }
    router.push("/estimator?openLibrary=1");
  }

  return (
    <button
      type="button"
      data-open-sidebar
      onClick={handleClick}
      aria-label="Open library"
      title="Library"
      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    </button>
  );
}
