"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Small stroke-style icon wrapper for toolbar buttons — one consistent
// line-icon language (uniform size/weight, currentColor so hover/active
// states recolor the icon along with the button text) instead of emoji or
// bare unicode glyphs, which render inconsistently across platforms/fonts
// and read as mismatched next to each other.
function Icon({
  children,
  size = 16,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// A minimal stand-in for window.confirm(), which throws "not supported" in
// this Next.js-hosted environment (no real OS-level dialog available to
// it) — same reasoning and same visual style as
// public/estimator/lib/confirmDialog.js, just reimplemented here since a
// .tsx file can't import a plain script served out of /public. Resolves
// true/false instead of returning synchronously.
function confirmLeaveDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10001;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "width:min(420px, 100%);background:white;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.25);padding:18px;";
    panel.innerHTML = `
      <div style="font-size:13px;color:#374151;white-space:pre-wrap;">${message}</div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="mini-btn" data-leave-cancel type="button">Stay</button>
        <button class="mini-btn" data-leave-confirm type="button" style="background:#dc2626;color:white;">Leave</button>
      </div>
    `;
    let settled = false;
    function finish(value: boolean) {
      if (settled) return;
      settled = true;
      backdrop.remove();
      resolve(value);
    }
    panel
      .querySelector("[data-leave-cancel]")
      ?.addEventListener("click", () => finish(false));
    panel
      .querySelector("[data-leave-confirm]")
      ?.addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  });
}

export default function EstimatorPage() {
  const router = useRouter();
  const loaded = useRef(false);

  useEffect(() => {
    const checkErpSession = async () => {
      try {
        const res = await fetch("/api/erp/auth/verify", { cache: "no-store" });
        if (res.ok) return;
      } catch {
        // Fall through to the redirect below.
      }

      const host = window.location.hostname;
      const appHost =
        host === "app.sueep.com" ||
        (process.env.NODE_ENV === "development" &&
          host.startsWith("app.localhost"));
      router.replace(appHost ? "/login" : "/erp/login");
    };

    checkErpSession();
  }, [router]);

  // Restore last project on soft navigation back (not on hard refresh)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const isSoftNav = sessionStorage.getItem("estimator_visited");
    sessionStorage.setItem("estimator_visited", "1");
    if (isSoftNav && typeof w.__restoreLastProject === "function") {
      (w.__restoreLastProject as () => void)();
    }
  }, []);

  // Warn on refresh / tab close / Next.js navigation if a project is open
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (w.__estimatorProjectLoaded) {
        e.preventDefault();
      }
    };

    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.includes("/estimator")) return;
      if (w.__estimatorProjectLoaded) {
        // Must intercept synchronously — the confirm dialog below is async,
        // and preventDefault() called after the fact (once its promise
        // resolves) is a no-op, the click has already been processed by
        // then. So this always stops the click first, then re-dispatches it
        // on the same anchor if the user actually confirms leaving —
        // clearing the loaded flag first so this same handler doesn't
        // intercept its own re-dispatched click.
        e.preventDefault();
        e.stopPropagation();
        confirmLeaveDialog(
          "Are you sure you want to leave? Any unsaved changes will be lost.",
        ).then((ok) => {
          if (!ok) return;
          w.__estimatorProjectLoaded = false;
          anchor.click();
        });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, []);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    // Bump this whenever /public/estimator-ui.css or simple-app.js change.
    // Both files are loaded via plain <link>/<script> tags with no build
    // pipeline, so without a version query a browser (or even just this
    // one that never got a hard refresh) can keep serving a stale cached
    // copy indefinitely.
    const ESTIMATOR_ASSET_VERSION = "toolbar-icons-40";

    // Update the existing <link>'s href in place if one's already there
    // from an earlier mount (soft-navigating back to this page within the
    // same tab) rather than just skipping — checking only "does a tag
    // with this id exist" (regardless of *which* version it's pointing
    // at) meant a version bump here never actually reloaded the CSS for
    // any tab that had already visited this page once, only a hard
    // refresh did.
    const cssHref = `/estimator-ui.css?v=${ESTIMATOR_ASSET_VERSION}`;
    const existingLink = document.getElementById(
      "estimator-ui-css",
    ) as HTMLLinkElement | null;
    if (existingLink) {
      if (existingLink.getAttribute("href") !== cssHref) {
        existingLink.setAttribute("href", cssHref);
      }
    } else {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssHref;
      link.id = "estimator-ui-css";
      document.head.appendChild(link);
    }

    const loadScript = (
      src: string,
      opts: { type?: string; optional?: boolean } = {},
    ) =>
      new Promise<void>((resolve) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        if (opts.type) s.type = opts.type;
        s.onload = () => resolve();
        s.onerror = () => {
          if (opts.optional) {
            console.warn("[estimator] optional asset failed to load:", src);
            resolve();
            return;
          }
          resolve();
        };
        document.head.appendChild(s);
      });

    (async () => {
      try {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
          { optional: true },
        );
        const w = window as unknown as Record<string, unknown>;
        if (w.pdfjsLib) {
          (
            w.pdfjsLib as { GlobalWorkerOptions: { workerSrc: string } }
          ).GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        await loadScript("https://unpkg.com/lucide@latest/dist/umd/lucide.js", {
          optional: true,
        });
        await loadScript(
          `/estimator/simple-app.js?v=${ESTIMATOR_ASSET_VERSION}`,
          { type: "module" },
        );
      } catch (e) {
        console.error("[estimator] script load error", e);
      }
    })();
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen">
      <div
        id="globalLoadingBar"
        className="hidden"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483647,
          display: "none",
          alignItems: "center",
          gap: "0.75rem",
          height: "40px",
          padding: "0 1rem",
          background: "rgba(15, 23, 42, 0.98)",
          color: "white",
          fontSize: "13px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
        }}
      >
        <div
          id="globalLoadingBarIndicator"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "3px",
            background: "linear-gradient(90deg, #4ade80, #a78bfa, #4ade80)",
            animation: "globalLoadingBar 1.5s linear infinite",
          }}
        ></div>
        <span id="globalLoadingBarText">Loading…</span>
      </div>
      <style>{`@keyframes globalLoadingBar {0% { transform: translateX(-100%);}50% { transform: translateX(0);}100% { transform: translateX(100%);}}`}</style>
      {/* SIDEBAR TOGGLE */}
      <button className="sidebar-toggle" data-open-sidebar>
        ☰
      </button>

      {/* SIDEBAR */}
      <div id="sidebarRoot">
        <div className="sidebar-header">
          <strong>Library</strong>
          <button className="sidebar-close-btn" data-close-sidebar>
            ✕
          </button>
        </div>
        <div id="libraryMount"></div>
      </div>

      {/* APP */}
      <div id="appCanvas">
        <div
          id="appError"
          style={{ display: "none", color: "#b00", fontSize: "12px" }}
        ></div>

        {/* max-w bumped from 7xl (1280px) to 120rem (1920px, ~50% wider)
            to try out a roomier layout — easy to dial back to max-w-7xl
            if it reads as too wide/edge-to-edge on common screens. Side
            padding grows with viewport width too (px-4 → lg:px-8) so a
            1920px-wide window doesn't end up with content flush against
            the browser edges. */}
        <div className="container mx-auto px-4 lg:px-8 py-8 max-w-[120rem]">
          {/* UPLOAD — same .window-card treatment (layered shadow, thin
              border, 16px radius) as the PDF window below it, so this is
              the first thing you see and it already reads as part of one
              consistent, modern system rather than an older card style. */}
          <div className="window-card mb-6">
            {/* PROJECT LOADED CARD — shown when a project is opened from the Library */}
            <div id="projectLoadedCard" style={{ display: "none" }}>
              {/* Top row: name + edit button. A small uppercase "Project"
                  eyebrow above the name, same label convention the
                  Analysis card below uses for its fields, so the project
                  name reads as this page's title rather than just another
                  line of text. */}
              <div className="flex items-start justify-between gap-3 mb-1">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400 mb-0.5">
                    Project
                  </div>
                  <div
                    id="loadedProjectLastEdited"
                    className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500"
                  >
                    Last edited: —
                  </div>
                  <div
                    id="loadedProjectName"
                    className="text-lg font-semibold text-gray-900"
                  ></div>
                </div>
                <button
                  id="editProjectBtn"
                  className="mini-btn icon-btn flex-shrink-0"
                  title="Edit project"
                  aria-label="Edit project"
                >
                  <Icon>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </Icon>
                </button>
              </div>

              {/* hidden address — still used by JS to populate analysis card */}
              <div id="loadedProjectAddress" style={{ display: "none" }}></div>

              {/* PDF row + actions */}
              <div className="flex items-center gap-3 pt-3 mt-2 border-t border-gray-100">
                <span
                  id="loadedPdfName"
                  className="text-sm text-gray-600 flex-1 truncate"
                ></span>
                <button id="changePdfBtn" className="mini-btn">
                  <Icon>
                    <path d="M12 3v12" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 21h14" />
                  </Icon>
                  Change PDF
                </button>
              </div>
            </div>

            {/* NEW PROJECT FORM — shown when creating a new project */}
            <div id="newProjectForm">
              {/* PDF FILE UPLOAD */}
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF File
              </label>
              <div
                id="dropZone"
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center transition-colors hover:border-green-300 hover:bg-green-50/40"
              >
                <input
                  type="file"
                  id="fileInput"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="sr-only"
                />
                <p>Drag and drop OR click below</p>
                <button
                  id="selectFileBtn"
                  className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg transition-colors hover:bg-green-700"
                >
                  Select file
                </button>
              </div>
              <div
                id="uploadCollapsed"
                style={{ display: "none" }}
                className="flex items-center gap-3"
              >
                <span
                  id="uploadedFileName"
                  className="text-sm text-gray-700 font-medium flex-1 truncate"
                ></span>
                <button id="changeFileBtn" className="mini-btn">
                  <Icon>
                    <path d="M12 3v12" />
                    <path d="m7 8 5-5 5 5" />
                    <path d="M5 21h14" />
                  </Icon>
                  Change file
                </button>
              </div>
            </div>

            {/* EDIT PROJECT FORM — shown when editing an existing project */}
            <div id="editProjectForm" style={{ display: "none" }}>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  id="editProjectNameInput"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:border-green-300 focus:ring-2 focus:ring-green-100"
                />
              </div>
              <div className="flex gap-2">
                <button
                  id="saveProjectBtn"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-green-700"
                >
                  Save
                </button>
                <button id="cancelEditBtn" className="mini-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* PDF VIEWER */}
          <div id="mainContent" className="hidden">
            <div className="window-card mb-6">
              {/* TOOLBAR — kept to a single row (flex-nowrap) rather than
                  wrapping to a second line; on narrow windows it scrolls
                  horizontally (overflow-x-auto) instead of stacking. */}
              <div
                id="toolbar"
                className="flex items-center gap-2 mb-4 flex-nowrap overflow-x-auto"
              >
                {/* Drawing / measurement tools — icon-only so the row reads
                    at a glance instead of as a wall of button labels; each
                    keeps a title/aria-label for the tooltip and screen
                    readers. Order: undo, then Single/Double sided (a
                    measure-specific setting) right before Measure itself,
                    then the three draw tools, then wall detection (beta —
                    injected by simple-app.js, see createDetectWallsMenu),
                    grouped here with the rest of the measurement tools
                    rather than off on its own. */}
                <div className="toolbar-group">
                  <button
                    id="undoShapeBtn"
                    className="mini-btn icon-btn"
                    type="button"
                    title="Undo last shape"
                    aria-label="Undo last shape"
                    disabled
                  >
                    <Icon>
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </Icon>
                  </button>
                  <button
                    id="doubleSideToggle"
                    className="mini-btn"
                    title="Toggle single/double-sided measurement"
                  >
                    Single sided
                  </button>
                  <button
                    id="measureToggle"
                    className="mini-btn icon-btn"
                    title="Measure a distance"
                    aria-label="Measure a distance"
                  >
                    <Icon>
                      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z" />
                      <path d="m14.5 12.5 2-2" />
                      <path d="m11.5 9.5 2-2" />
                      <path d="m8.5 6.5 2-2" />
                    </Icon>
                  </button>
                  <button
                    id="drawRectBtn"
                    className="mini-btn icon-btn"
                    title="Draw a rectangular area"
                    aria-label="Draw a rectangular area"
                  >
                    <Icon>
                      <rect x="4" y="4" width="16" height="16" rx="2" />
                    </Icon>
                  </button>
                  <button
                    id="drawIrregBtn"
                    className="mini-btn icon-btn"
                    title="Draw a freeform area"
                    aria-label="Draw a freeform area"
                  >
                    <Icon>
                      <path d="M2 12c1.5-4 3.5-4 5 0s3.5 4 5 0 3.5-4 5 0 3.5 4 5 0" />
                    </Icon>
                  </button>
                  <button
                    id="drawSelectBtn"
                    className="mini-btn icon-btn"
                    title="Box-select measurements — drag a box to select several, then delete/move them or toggle single/double-sided together"
                    aria-label="Box-select measurements"
                  >
                    <Icon>
                      <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="2"
                        strokeDasharray="3 3"
                      />
                    </Icon>
                  </button>
                  <div id="betaToolsGroup" />
                </div>

                <div className="toolbar-divider" aria-hidden="true" />

                {/* Zoom controls */}
                <div className="zoom-group">
                  <button
                    id="zoomOutBtn"
                    className="mini-btn icon-btn"
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <Icon>
                      <path d="M5 12h14" />
                    </Icon>
                  </button>
                  <div id="zoomLabel">100%</div>
                  <button
                    id="zoomInBtn"
                    className="mini-btn icon-btn"
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <Icon>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </Icon>
                  </button>
                  <button
                    id="zoomResetBtn"
                    className="mini-btn"
                    title="Reset zoom"
                  >
                    Reset
                  </button>
                </div>

                <div className="toolbar-divider" aria-hidden="true" />

                {/* Page navigation — pageInfo/vectorLineInfo left to size to
                    their own (short) content instead of reserving a fixed
                    width, so this cluster stays as small as possible. */}
                <div className="toolbar-group">
                  <button
                    id="prevPageBtn"
                    className="mini-btn icon-btn"
                    title="Previous page"
                    aria-label="Previous page"
                    style={{ display: "none" }}
                  >
                    <Icon>
                      <path d="m15 18-6-6 6-6" />
                    </Icon>
                  </button>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      id="pageInfo"
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      1 of 1
                    </div>
                    <div
                      id="vectorLineInfo"
                      style={{
                        fontSize: "10px",
                        color: "#9ca3af",
                        whiteSpace: "nowrap",
                      }}
                    />
                  </div>
                  <button
                    id="nextPageBtn"
                    className="mini-btn icon-btn"
                    title="Next page"
                    aria-label="Next page"
                    style={{ display: "none" }}
                  >
                    <Icon>
                      <path d="m9 18 6-6-6-6" />
                    </Icon>
                  </button>
                </div>

                <div className="toolbar-divider" aria-hidden="true" />

                {/* View options (Labels toggle lives here, injected by
                    simple-app.js — see createShowLabelsToggleBtn) */}
                <div id="viewToolsGroup" className="toolbar-group" />

                {/* Save (injected by simple-app.js, see createSavePdfBtn)
                    plus the Export dropdown (see createExportMenu). Save
                    keeps its own solid color (see #savePdfBtn in
                    estimator-ui.css) so it still stands out inside the
                    pill. */}
                <div id="saveToolsGroup" className="toolbar-group" />

                {/* Wrapped in its own pill (rather than a bare button) so
                    it flattens/hovers the same way as every other toolbar
                    button — see ".toolbar-group .mini-btn" in
                    estimator-ui.css — instead of standing out as the one
                    bordered button. marginLeft:auto pushes this pill (and
                    only this one) to the far right; it must stay last. */}
                <div className="toolbar-group" style={{ marginLeft: "auto" }}>
                  <button
                    id="toggleSidebarBtn"
                    className="mini-btn"
                    title="Toggle measurements list"
                  >
                    Measurements
                  </button>
                </div>
              </div>

              {/* VIEWER ROW */}
              <div id="viewerRow" className="flex flex-col lg:flex-row gap-6">
                {/* PDF PANEL — no "PDF Preview" label; the toolbar sitting
                    directly above it already makes it obvious what this
                    is, so the heading was just repeating what's visible.
                    Measurements keeps its own heading since that panel
                    isn't self-explanatory the same way. */}
                <div id="pdfPanel" className="flex-1">
                  <div id="pdfContainer">
                    <div id="pdfWrapper">
                      <canvas id="pdfCanvas"></canvas>
                    </div>
                  </div>
                </div>

                {/* MEASUREMENT SIDEBAR — a plain column rather than a
                    second nested white/shadow card, since it already sits
                    inside the one card wrapping this whole window; a
                    hairline divider on large screens (lg:border-l) is
                    enough to separate it from the PDF panel. */}
                <aside
                  id="measurementSidebar"
                  className="w-full lg:w-80 lg:border-l lg:border-gray-100 lg:pl-6"
                >
                  <h3 className="text-base font-semibold text-gray-800 mb-3">
                    Measurements
                  </h3>
                  <div id="measurementsContent">
                    <div className="mb-3">
                      <div
                        id="measurementScaleInfo"
                        style={{ fontSize: "12px", color: "#6b7280" }}
                      >
                        Scale not set
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap mb-3">
                      <button
                        id="changeScaleBtn"
                        className="mini-btn"
                        style={{ flex: 1, minWidth: "110px" }}
                      >
                        Change scale
                      </button>
                    </div>

                    {/* MEASUREMENT PAGE NAV */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "12px",
                      }}
                    >
                      <button
                        id="measurementPrevPageBtn"
                        className="mini-btn icon-btn"
                        title="Previous page"
                        aria-label="Previous page"
                      >
                        <Icon>
                          <path d="m15 18-6-6 6-6" />
                        </Icon>
                      </button>
                      <input
                        id="measurementPageInput"
                        type="number"
                        min={1}
                        placeholder="1"
                        className="mini-input"
                        style={{ flex: 1, minWidth: 0, textAlign: "center" }}
                      />
                      <button
                        id="measurementNextPageBtn"
                        className="mini-btn icon-btn"
                        title="Next page"
                        aria-label="Next page"
                      >
                        <Icon>
                          <path d="m9 18 6-6-6-6" />
                        </Icon>
                      </button>
                      <span
                        id="measurementPageLabel"
                        style={{ display: "none" }}
                      >
                        Page 1
                      </span>
                    </div>

                    <div
                      id="extractedMeasurementsContainer"
                      style={{ display: "none", marginBottom: "12px" }}
                    />

                    {/* TWO-COLUMN MEASUREMENT LIST */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div className="measurement-column-label">
                          <span
                            className="measurement-column-swatch"
                            style={{ background: "#00b478" }}
                          />
                          <h4
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              color: "#374151",
                            }}
                          >
                            Line Measurements
                          </h4>
                        </div>
                        <div
                          id="measurementListLeft"
                          className="measurement-column-list"
                          style={{
                            fontSize: "12px",
                            color: "#374151",
                            minHeight: "200px",
                            maxHeight: "220px",
                            overflowY: "auto",
                          }}
                        >
                          No measurements
                        </div>
                      </div>
                      <div>
                        <div className="measurement-column-label">
                          <span
                            className="measurement-column-swatch"
                            style={{ background: "#ffc300" }}
                          />
                          <h4
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              color: "#374151",
                            }}
                          >
                            Surface Area
                          </h4>
                        </div>
                        <div
                          id="measurementListRight"
                          className="measurement-column-list"
                          style={{
                            fontSize: "12px",
                            color: "#374151",
                            minHeight: "200px",
                            maxHeight: "220px",
                            overflowY: "auto",
                          }}
                        >
                          No surface area
                        </div>
                      </div>
                    </div>
                    <div
                      id="measurementPageAggregateInfo"
                      style={{
                        fontSize: "12px",
                        color: "#6b7280",
                        marginTop: "12px",
                      }}
                    >
                      Page total: 0&quot;
                    </div>
                  </div>
                  {/* measurementsContent */}
                </aside>
              </div>
            </div>
          </div>

          {/* TABBED ESTIMATOR CARD — Analysis / Painting */}
          <div
            id="estimatorTabCard"
            className="bg-white rounded-lg shadow-md mt-6"
            style={{ display: "none" }}
          >
            {/* Tab bar */}
            <div
              id="estimatorTabBar"
              className="flex items-center border-b border-gray-200 px-6 pt-4"
            >
              <button
                id="tabAnalysisBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2"
              >
                Cleaning
              </button>
              <button
                id="tabPaintingBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2"
              >
                Painting
              </button>
            </div>

            {/* ANALYSIS PANEL */}
            <div id="analysisCard" className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800">
                  Cleaning
                </h3>
                <div className="flex gap-2">
                  <button id="refreshDistanceBtn" className="mini-btn">
                    ↻ Distance
                  </button>
                  <button id="editAnalysisBtn" className="mini-btn">
                    Edit
                  </button>
                </div>
              </div>

              {/* READ-ONLY VIEW */}
              <div id="analysisView">
                {/* Expected days — single row above address block */}
                <div className="text-sm mb-4 pb-3 border-b border-gray-100">
                  <span className="text-gray-400 text-xs uppercase tracking-wide">
                    Expected Days to Complete
                  </span>
                  <div
                    id="analysisViewExpectedDays"
                    className="text-gray-800 font-semibold mt-0.5"
                  >
                    —
                  </div>
                </div>
                {/* Address + Drive info */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3 text-sm mb-4">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Start Address
                    </span>
                    <div
                      id="analysisViewStartAddress"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Project Address
                    </span>
                    <div
                      id="analysisViewAddress"
                      className="text-gray-800 font-semibold mt-0.5"
                    ></div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Drive Distance
                    </span>
                    <div
                      id="detailDistance"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Drive Time
                    </span>
                    <div
                      id="detailDuration"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Transportation
                    </span>
                    <div
                      id="detailTollCost"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
                {/* Labor breakdown table — rendered by JS */}
                <div id="analysisViewBreakdown" className="mb-4"></div>
                {/* Summary row */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3 text-sm pt-3 border-t border-gray-100">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Labor
                    </span>
                    <div
                      id="analysisViewLabor"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Area
                    </span>
                    <div
                      id="analysisViewTotalArea"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Quote
                    </span>
                    <div
                      id="analysisViewQuote"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Labor / SF
                    </span>
                    <div
                      id="analysisViewLaborPerSF"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Gasoline
                    </span>
                    <div
                      id="analysisViewGasoline"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
              </div>

              {/* EDIT FORM */}
              <div id="analysisEditForm" style={{ display: "none" }}>
                {/* Total Area */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Total Area (SF)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          id="analysisTotalAreaInput"
                          placeholder="0"
                          min="0"
                          step="1"
                          className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                        />
                        <button
                          type="button"
                          id="totalAreaModifyBtn"
                          style={{ display: "none" }}
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          id="totalAreaResetBtn"
                          style={{ display: "none" }}
                          className="px-3 py-1.5 text-xs border border-green-300 rounded bg-white text-green-600 hover:bg-green-50 cursor-pointer"
                        >
                          Reset to auto
                        </button>
                      </div>
                    </div>
                    <div className="min-w-[220px] flex-1">
                      <label className="block text-xs text-gray-500 mb-1">
                        Building Type
                      </label>
                      <select
                        id="buildingTypeSelect"
                        defaultValue="Commercial"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      >
                        <option value="Commercial">Commercial</option>
                        <option value="Retail">Retail</option>
                        <option value="Multifamily">Multifamily</option>
                        <option value="School / Institutional">
                          School / Institutional
                        </option>
                        <option value="Medical / Healthcare">
                          Medical / Healthcare
                        </option>
                        <option value="Warehouse">Warehouse</option>
                        <option value="Industrial / Manufacturing">
                          Industrial / Manufacturing
                        </option>
                        <option value="High-Rise / Large Commercial">
                          High-Rise / Large Commercial
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
                {/* Start Address */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">
                    Start Address
                  </label>
                  <select
                    id="startAddressSelect"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 mb-2"
                  >
                    <option value="default">
                      Company HQ — 2 Bala Plaza, Bala Cynwyd, PA 19004
                    </option>
                    <option value="custom">Custom address…</option>
                  </select>
                  <input
                    type="text"
                    id="startAddressInput"
                    placeholder="e.g. 456 Other St, Philadelphia, PA 19103"
                    style={{ display: "none" }}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
                {/* Project Address */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">
                    Project Address
                  </label>
                  <input
                    type="text"
                    id="analysisAddressInput"
                    placeholder="e.g. 123 Main St, Philadelphia, PA 19103"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
                {/* Drive info (read-only, below address) */}
                <div className="flex gap-6 mb-4 pb-4 border-b border-gray-100">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Drive Distance
                    </label>
                    <div
                      id="editDriveDistance"
                      className="text-sm text-gray-600 font-medium mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Drive Time
                    </label>
                    <div
                      id="editDriveTime"
                      className="text-sm text-gray-600 font-medium mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
                {/* Transportation */}
                <div className="flex flex-wrap gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Gasoline ($)
                    </label>
                    <input
                      type="number"
                      id="gasolineInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Toll Cost ($)
                    </label>
                    <input
                      type="number"
                      id="tollCostInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Driver Cost ($)
                    </label>
                    <input
                      type="number"
                      id="driverCostDisplay"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Total Transportation ($)
                    </label>
                    <div
                      id="totalTransportDisplay"
                      className="w-48 border border-green-200 rounded px-3 py-1.5 text-sm bg-green-50 text-green-700 font-semibold"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Cost/Mile
                    </label>
                    <input
                      type="number"
                      id="costPerMileInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                </div>
                {/* Expected Days to Complete */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Expected Days to Complete
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          id="expectedDaysInput"
                          placeholder="—"
                          min="0"
                          step="1"
                          readOnly
                          className="w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          id="expectedDaysModifyBtn"
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          id="expectedDaysResetBtn"
                          style={{ display: "none" }}
                          className="px-3 py-1.5 text-xs border border-green-300 rounded bg-white text-green-600 hover:bg-green-50 cursor-pointer"
                        >
                          Reset to auto
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Mobilizations
                      </label>
                      <input
                        type="number"
                        id="mobilizationsInput"
                        placeholder="0"
                        min="0"
                        step="1"
                        className="w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                {/* Hidden inputs keep default values for new crew members */}
                <input type="hidden" id="cleanerRateInput" defaultValue="22" />
                <input type="hidden" id="foremanRateInput" defaultValue="28" />

                {/* Area per person per day */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                    Area per person per day
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Rough Cleaning (SF/day)
                      </label>
                      <input
                        type="number"
                        id="roughAreaPerPersonInput"
                        defaultValue={4000}
                        min="0"
                        step="1"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Final Cleaning (SF/day)
                      </label>
                      <input
                        type="number"
                        id="finalAreaPerPersonInput"
                        defaultValue={4000}
                        min="0"
                        step="1"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Touch Up Cleaning (SF/day)
                      </label>
                      <input
                        type="number"
                        id="touchupAreaPerPersonInput"
                        defaultValue={4000}
                        min="0"
                        step="1"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Phase table — rendered by JS */}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Phases
                  </span>
                  <button
                    type="button"
                    id="regenPhasesBtn"
                    className="px-3 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    ↺ Regenerate from Area
                  </button>
                </div>
                <div
                  id="phaseTableContainer"
                  className="mb-4 overflow-x-auto"
                ></div>

                {/* Global rates */}
                <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5 pb-4 border-b border-gray-100">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Overhead (%)
                    </label>
                    <input
                      type="number"
                      id="overheadInput"
                      defaultValue="0"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Profit (%)
                    </label>
                    <input
                      type="number"
                      id="profitInput"
                      defaultValue="30"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Tax (%)
                    </label>
                    <input
                      type="number"
                      id="taxInput"
                      defaultValue="6"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="text"
                        id="taxZipInput"
                        placeholder="ZIP"
                        maxLength={5}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-green-400"
                      />
                      <button
                        type="button"
                        id="taxZipLookupBtn"
                        className="px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                      >
                        Lookup
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Commission (%)
                    </label>
                    <input
                      type="number"
                      id="commissionInput"
                      defaultValue="5"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Materials ($)
                    </label>
                    <input
                      type="number"
                      id="materialsInput"
                      placeholder="0.00"
                      defaultValue="0"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                </div>

                <div id="calcSummaryContainer" className="mb-4"></div>

                {/* Scope & Comments now live in their own tabbed section
                    (see #scopeCommentsTabCard below), not here — but this
                    trade's own Save/Cancel below is still what actually
                    persists them (see scopeCleaningSaveBtn there, which
                    forwards its click to #saveAnalysisBtn), so this is
                    still the button that does the work. */}

                <div className="flex gap-2">
                  <button
                    id="saveAnalysisBtn"
                    className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button id="cancelAnalysisBtn" className="mini-btn">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            {/* end analysisCard panel */}

            {/* PAINTING PANEL */}
            <div id="paintingCard" className="p-6" style={{ display: "none" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800">
                  Painting
                </h3>
                <div className="flex gap-2">
                  <button id="refreshPaintingDistanceBtn" className="mini-btn">
                    ↻ Distance
                  </button>
                  <button id="editPaintingBtn" className="mini-btn">
                    Edit
                  </button>
                </div>
              </div>

              {/* READ-ONLY VIEW */}
              <div id="paintingView">
                <div className="text-sm mb-4 pb-3 border-b border-gray-100">
                  <span className="text-gray-400 text-xs uppercase tracking-wide">
                    Expected Days to Complete
                  </span>
                  <div
                    id="paintingViewExpectedDays"
                    className="text-gray-800 font-semibold mt-0.5"
                  >
                    —
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3 text-sm mb-4">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Start Address
                    </span>
                    <div
                      id="paintingViewStartAddress"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Project Address
                    </span>
                    <div
                      id="paintingViewAddress"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Drive Distance
                    </span>
                    <div
                      id="paintingDetailDistance"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Drive Time
                    </span>
                    <div
                      id="paintingDetailDuration"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Transportation
                    </span>
                    <div
                      id="paintingDetailTollCost"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
                <div id="paintingViewBreakdown" className="mb-4"></div>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-3 text-sm pt-3 border-t border-gray-100">
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Labor
                    </span>
                    <div
                      id="paintingViewLabor"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Total Area
                    </span>
                    <div
                      id="paintingViewTotalArea"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Quote
                    </span>
                    <div
                      id="paintingViewQuote"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Labor / SF
                    </span>
                    <div
                      id="paintingViewLaborPerSF"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 text-xs uppercase tracking-wide">
                      Gasoline
                    </span>
                    <div
                      id="paintingViewGasoline"
                      className="text-gray-800 font-semibold mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
              </div>

              {/* EDIT FORM */}
              <div id="paintingEditForm" style={{ display: "none" }}>
                {/* Total Area */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <label className="block text-xs text-gray-500 mb-1">
                    Total Area (SF)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      id="paintingTotalAreaInput"
                      placeholder="0"
                      min="0"
                      step="1"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                    <button
                      type="button"
                      id="paintingTotalAreaModifyBtn"
                      style={{ display: "none" }}
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                    >
                      Modify
                    </button>
                    <button
                      type="button"
                      id="paintingTotalAreaResetBtn"
                      style={{ display: "none" }}
                      className="px-3 py-1.5 text-xs border border-green-300 rounded bg-white text-green-600 hover:bg-green-50 cursor-pointer"
                    >
                      Reset to auto
                    </button>
                  </div>
                </div>
                {/* Start Address */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">
                    Start Address
                  </label>
                  <select
                    id="paintingStartAddressSelect"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400 mb-2"
                  >
                    <option value="default">
                      Company HQ — 2 Bala Plaza, Bala Cynwyd, PA 19004
                    </option>
                    <option value="custom">Custom address…</option>
                  </select>
                  <input
                    type="text"
                    id="paintingStartAddressInput"
                    placeholder="e.g. 456 Other St, Philadelphia, PA 19103"
                    style={{ display: "none" }}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
                {/* Project Address */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 mb-1">
                    Project Address
                  </label>
                  <input
                    type="text"
                    id="paintingAddressInput"
                    placeholder="e.g. 123 Main St, Philadelphia, PA 19103"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                  />
                </div>
                {/* Drive info */}
                <div className="flex gap-6 mb-4 pb-4 border-b border-gray-100">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Drive Distance
                    </label>
                    <div
                      id="paintingEditDriveDistance"
                      className="text-sm text-gray-600 font-medium mt-0.5"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Drive Time
                    </label>
                    <div
                      id="paintingEditDriveTime"
                      className="text-sm text-gray-600 font-medium mt-0.5"
                    >
                      —
                    </div>
                  </div>
                </div>
                {/* Transportation */}
                <div className="flex flex-wrap gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Gasoline ($)
                    </label>
                    <input
                      type="number"
                      id="paintingGasolineInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Toll Cost ($)
                    </label>
                    <input
                      type="number"
                      id="paintingTollCostInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Driver Cost ($)
                    </label>
                    <input
                      type="number"
                      id="paintingDriverCostDisplay"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Total Transportation ($)
                    </label>
                    <div
                      id="paintingTotalTransportDisplay"
                      className="w-48 border border-green-200 rounded px-3 py-1.5 text-sm bg-green-50 text-green-700 font-semibold"
                    >
                      —
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Cost/Mile
                    </label>
                    <input
                      type="number"
                      id="paintingCostPerMileInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                </div>
                {/* Expected Days */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Expected Days to Complete
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          id="paintingExpectedDaysInput"
                          placeholder="—"
                          min="0"
                          step="1"
                          readOnly
                          className="w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          id="paintingExpectedDaysModifyBtn"
                          className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                        >
                          Modify
                        </button>
                        <button
                          type="button"
                          id="paintingExpectedDaysResetBtn"
                          style={{ display: "none" }}
                          className="px-3 py-1.5 text-xs border border-green-300 rounded bg-white text-green-600 hover:bg-green-50 cursor-pointer"
                        >
                          Reset to auto
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Mobilizations
                      </label>
                      <input
                        type="number"
                        id="paintingMobilizationsInput"
                        placeholder="0"
                        min="0"
                        step="1"
                        className="w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <input
                  type="hidden"
                  id="paintingCleanerRateInput"
                  defaultValue="22"
                />
                <input
                  type="hidden"
                  id="paintingForemanRateInput"
                  defaultValue="28"
                />

                {/* Area per person per day */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
                    Area per person per day
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Interior Painting Primer (SF/day)
                      </label>
                      <input
                        type="number"
                        id="paintingPrimerAreaPerPersonInput"
                        defaultValue={2000}
                        min="0"
                        step="1"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Interior Painting (SF/day)
                      </label>
                      <input
                        type="number"
                        id="paintingInteriorAreaPerPersonInput"
                        defaultValue={1200}
                        min="0"
                        step="1"
                        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Phases
                  </span>
                  <button
                    type="button"
                    id="paintingRegenPhasesBtn"
                    className="px-3 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    ↺ Regenerate from Area
                  </button>
                </div>
                <div
                  id="paintingPhaseTableContainer"
                  className="mb-4 overflow-x-auto"
                ></div>

                {/* Global rates */}
                <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5 pb-4 border-b border-gray-100">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Overhead (%)
                    </label>
                    <input
                      type="number"
                      id="paintingOverheadInput"
                      defaultValue="0"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Profit (%)
                    </label>
                    <input
                      type="number"
                      id="paintingProfitInput"
                      defaultValue="30"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Tax (%)
                    </label>
                    <input
                      type="number"
                      id="paintingTaxInput"
                      defaultValue="6"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <input
                        type="text"
                        id="paintingTaxZipInput"
                        placeholder="ZIP"
                        maxLength={5}
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-green-400"
                      />
                      <button
                        type="button"
                        id="paintingTaxZipLookupBtn"
                        className="px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-600 hover:bg-gray-50 cursor-pointer"
                      >
                        Lookup
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Commission (%)
                    </label>
                    <input
                      type="number"
                      id="paintingCommissionInput"
                      defaultValue="5"
                      min="0"
                      step="0.1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Materials ($)
                    </label>
                    <input
                      type="number"
                      id="paintingMaterialsInput"
                      placeholder="0.00"
                      defaultValue="0"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Building Type
                    </label>
                    <select
                      id="paintingBuildingTypeSelect"
                      defaultValue="Office / Commercial"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400"
                    >
                      <option value="Office / Commercial">
                        Office / Commercial
                      </option>
                      <option value="Retail / Store">Retail / Store</option>
                      <option value="Multifamily / Apartment">
                        Multifamily / Apartment
                      </option>
                      <option value="School / Institutional">
                        School / Institutional
                      </option>
                      <option value="Medical / Healthcare">
                        Medical / Healthcare
                      </option>
                      <option value="Warehouse">Warehouse</option>
                      <option value="Manufacturing">Manufacturing</option>
                      <option value="High-Rise / Large Commercial">
                        High-Rise / Large Commercial
                      </option>
                    </select>
                  </div>
                </div>

                <div id="paintingCalcSummaryContainer" className="mb-4"></div>

                {/* Scope & Comments now live in their own tabbed section
                    (see #scopeCommentsTabCard below), not here — but this
                    trade's own Save/Cancel below is still what actually
                    persists them (see scopePaintingSaveBtn there, which
                    forwards its click to #savePaintingBtn), so this is
                    still the button that does the work. */}

                <div className="flex gap-2">
                  <button
                    id="savePaintingBtn"
                    className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                  >
                    Save
                  </button>
                  <button id="cancelPaintingBtn" className="mini-btn">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
            {/* end paintingCard panel */}
          </div>
          {/* end estimatorTabCard */}

          {/* SCOPE / COMMENTS TABBED CARD — its own section (same
              tab-bar pattern as Cleaning/Painting and Change Orders/SOV),
              pulled out of each trade's edit form rather than buried
              inside it. The fields keep their original ids
              (cleaningScopeInput/cleaningCommentsInput,
              paintingScopeInput/paintingCommentsInput) — only their
              location moved, so loading/saving them is unaffected by
              where they render. There's no separate save path for this
              card: each tab's Save button just forwards its click to
              that trade's real Save button (#saveAnalysisBtn /
              #savePaintingBtn), which already gathers every other field
              for that trade's full breakdown too — a save split off from
              that would risk silently dropping the rest of the payload,
              or fighting it if the two saved independently. Visibility
              mirrors #estimatorTabCard/#changeOrderSovTabCard: hidden
              until a project is loaded, shown via the same trigger point
              in showAnalysisCard. */}
          <div
            id="scopeCommentsTabCard"
            className="bg-white rounded-lg shadow-md mt-4"
            style={{ display: "none" }}
          >
            {/* Tab bar */}
            <div
              id="scopeCommentsTabBar"
              className="flex items-center border-b border-gray-200 px-6 pt-4"
            >
              <button
                id="tabScopeCleaningBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2"
              >
                Cleaning
              </button>
              <button
                id="tabScopePaintingBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2"
              >
                Painting
              </button>
            </div>

            {/* CLEANING SCOPE/COMMENTS PANEL */}
            <div id="scopeCommentsCleaningPanel" className="p-6">
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Scope &amp; Comments
              </h3>
              <div className="mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <Icon size={13}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6" />
                    <path d="M9 17h6" />
                  </Icon>
                  Scope
                </label>
                <textarea
                  id="cleaningScopeInput"
                  rows={4}
                  placeholder="Describe the scope of work"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 resize-y transition-all placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-100/60"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <Icon size={13}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </Icon>
                  Comments
                </label>
                <textarea
                  id="cleaningCommentsInput"
                  rows={4}
                  placeholder="Add any cleaning notes or comments"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 resize-y transition-all placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-100/60"
                />
              </div>
              <div className="flex gap-2">
                <button
                  id="scopeCleaningSaveBtn"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-green-700"
                >
                  Save
                </button>
                <button id="scopeCleaningCancelBtn" className="mini-btn">
                  Cancel
                </button>
              </div>
            </div>

            {/* PAINTING SCOPE/COMMENTS PANEL */}
            <div
              id="scopeCommentsPaintingPanel"
              className="p-6"
              style={{ display: "none" }}
            >
              <h3 className="text-base font-semibold text-gray-800 mb-4">
                Scope &amp; Comments
              </h3>
              <div className="mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <Icon size={13}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <path d="M14 2v6h6" />
                    <path d="M9 13h6" />
                    <path d="M9 17h6" />
                  </Icon>
                  Scope
                </label>
                <textarea
                  id="paintingScopeInput"
                  rows={4}
                  placeholder="Describe the scope of work"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 resize-y transition-all placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-100/60"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  <Icon size={13}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </Icon>
                  Comments
                </label>
                <textarea
                  id="paintingCommentsInput"
                  rows={4}
                  placeholder="Add any painting notes or comments"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-800 bg-gray-50 resize-y transition-all placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-green-300 focus:ring-4 focus:ring-green-100/60"
                />
              </div>
              <div className="flex gap-2">
                <button
                  id="scopePaintingSaveBtn"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium transition-colors hover:bg-green-700"
                >
                  Save
                </button>
                <button id="scopePaintingCancelBtn" className="mini-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* CHANGE ORDER / SOV TABBED CARD — same tab-bar pattern as the
              Cleaning/Painting card above (see _setEstimatorTab in
              simple-app.js), rather than two cards stacked or sitting
              side by side. Visibility of the whole card and which tab is
              active are both handled by the mirroring
              _setChangeOrderSovTab; #changeOrderCard/#sovCard keep their
              original ids (now tab panels instead of standalone cards) so
              nothing that already targets them by id needed to change. */}
          <div
            id="changeOrderSovTabCard"
            className="bg-white rounded-lg shadow-md mt-4"
            style={{ display: "none" }}
          >
            {/* Tab bar */}
            <div
              id="changeOrderSovTabBar"
              className="flex items-center border-b border-gray-200 px-6 pt-4"
            >
              <button
                id="tabChangeOrdersBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2"
              >
                Change Orders
              </button>
              <button
                id="tabSovBtn"
                className="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2"
              >
                Schedule of Values
              </button>
            </div>

            {/* CHANGE ORDER PANEL */}
            <div id="changeOrderCard" className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-800">
                  Change Orders
                </h3>
                <div className="flex gap-2">
                  <button id="addChangeOrderBtn" className="mini-btn">
                    + Add
                  </button>
                  <button
                    id="saveChangeOrderBtn"
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium transition-colors hover:bg-green-700"
                  >
                    Save All
                  </button>
                </div>
              </div>
              {/* All change order sections rendered by JS */}
              <div id="changeOrdersContainer"></div>
            </div>

            {/* SOV PANEL */}
            <div id="sovCard" className="p-6" style={{ display: "none" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-800">
                    Schedule of Values
                  </h3>
                  <button id="undoSovRowBtn" className="mini-btn" type="button">
                    Undo
                  </button>
                  <button id="addSovRowBtn" className="mini-btn" type="button">
                    +
                  </button>
                </div>
              </div>
              <div id="sovTableContainer"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
