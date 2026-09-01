"use client";

// Clicking the logo should always land on a clean home page, never reopen
// whatever project was last open -- that auto-restore (see the estimator
// canvas page's own effect, __restoreLastProject in simple-app.js) exists
// for coming back to the app after navigating elsewhere or reloading, not
// for an explicit "take me home" click. Setting this flag right before the
// navigation is what tells that effect to skip restoring just this once.
export function HomeLogoLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="/estimator"
      className="flex items-center gap-2"
      onClick={() => {
        sessionStorage.setItem("estimator_skip_restore", "1");
      }}
    >
      {children}
    </a>
  );
}
