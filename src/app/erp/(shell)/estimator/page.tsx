"use client";

import { useEffect, useRef } from "react";

export default function EstimatorPage() {
  const loaded = useRef(false);

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
        if (
          !window.confirm(
            "Are you sure you want to leave? Any unsaved changes will be lost.",
          )
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
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

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/estimator-ui.css";
    link.id = "estimator-ui-css";
    if (!document.getElementById("estimator-ui-css")) {
      document.head.appendChild(link);
    }

    const loadScript = (src: string, opts: { type?: string } = {}) =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        if (opts.type) s.type = opts.type;
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });

    (async () => {
      try {
        await loadScript(
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
        );
        const w = window as unknown as Record<string, unknown>;
        if (w.pdfjsLib) {
          (
            w.pdfjsLib as { GlobalWorkerOptions: { workerSrc: string } }
          ).GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        await loadScript("https://unpkg.com/lucide@latest/dist/umd/lucide.js");
        await loadScript("/estimator/simple-app.js", { type: "module" });
      } catch (e) {
        console.error("[estimator] script load error", e);
      }
    })();
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen">
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

        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* UPLOAD */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {/* PROJECT LOADED CARD — shown when a project is opened from the Library */}
            <div id="projectLoadedCard" style={{ display: "none" }}>
              {/* Top row: name + edit button */}
              <div className="flex items-start justify-between gap-3 mb-1">
                <div
                  id="loadedProjectName"
                  className="text-base font-semibold text-gray-900"
                ></div>
                <button id="editProjectBtn" className="mini-btn flex-shrink-0">
                  Edit
                </button>
              </div>

              {/* hidden address — still used by JS to populate analysis card */}
              <div id="loadedProjectAddress" style={{ display: "none" }}></div>

              {/* PDF row + actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <span
                  id="loadedPdfName"
                  className="text-sm text-gray-600 flex-1 truncate"
                ></span>
                <button id="changePdfBtn" className="mini-btn">
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
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400"
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
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
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
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  id="saveProjectBtn"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
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
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              {/* TOOLBAR */}
              <div
                id="toolbar"
                className="flex items-center gap-2 mb-4 flex-wrap"
              >
                <button id="measureToggle" className="mini-btn">
                  Measure
                </button>
                <button id="drawRectBtn" className="mini-btn">
                  Draw Rect
                </button>
                <button id="drawIrregBtn" className="mini-btn">
                  Draw Irreg
                </button>
                <button
                  id="undoShapeBtn"
                  className="mini-btn"
                  type="button"
                  disabled
                >
                  Undo
                </button>

                <button id="doubleSideToggle" className="mini-btn">
                  Single sided
                </button>

                <div className="zoom-group">
                  <button id="zoomOutBtn" className="mini-btn">
                    −
                  </button>
                  <div id="zoomLabel">100%</div>
                  <button id="zoomInBtn" className="mini-btn">
                    +
                  </button>
                  <button id="zoomResetBtn" className="mini-btn">
                    Reset
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginLeft: "12px",
                  }}
                >
                  <button
                    id="prevPageBtn"
                    className="mini-btn"
                    style={{ display: "none" }}
                  >
                    Prev
                  </button>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      minWidth: "140px",
                    }}
                  >
                    <div
                      id="pageInfo"
                      style={{ minWidth: "120px", textAlign: "center" }}
                    >
                      Page 1
                    </div>
                    <div
                      id="vectorLineInfo"
                      style={{ fontSize: "12px", color: "#4b5563" }}
                    >
                      Vector lines: unknown
                    </div>
                  </div>
                  <button
                    id="nextPageBtn"
                    className="mini-btn"
                    style={{ display: "none" }}
                  >
                    Next
                  </button>
                </div>

                <button
                  id="toggleSidebarBtn"
                  className="mini-btn"
                  style={{ marginLeft: "auto" }}
                >
                  Measurements
                </button>
              </div>

              {/* VIEWER ROW */}
              <div id="viewerRow" className="flex flex-col lg:flex-row gap-6">
                {/* PDF PANEL */}
                <div id="pdfPanel" className="flex-1">
                  <h2 className="text-xl font-semibold mb-2">PDF Preview</h2>
                  <div id="pdfContainer">
                    <div id="pdfWrapper">
                      <canvas id="pdfCanvas"></canvas>
                    </div>
                  </div>
                </div>

                {/* MEASUREMENT SIDEBAR */}
                <aside id="measurementSidebar" className="w-full lg:w-80">
                  <div className="bg-white rounded-lg shadow-md p-4 mb-4">
                    <div className="mb-3">
                      <h3 className="text-lg font-semibold mb-2">
                        Measurements
                      </h3>
                    </div>
                    <div id="measurementsContent">
                      <div className="mb-3">
                        <div
                          id="measurementScaleInfo"
                          style={{ fontSize: "12px", color: "#6b7280" }}
                        >
                          Scale not set
                        </div>
                        <div
                          id="measurementPageAggregateInfo"
                          style={{
                            fontSize: "12px",
                            color: "#6b7280",
                            marginTop: "4px",
                          }}
                        >
                          Page total: 0&quot;
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
                          className="mini-btn"
                          style={{ flex: 1 }}
                        >
                          ←
                        </button>
                        <input
                          id="measurementPageInput"
                          type="number"
                          min={1}
                          placeholder="1"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "4px",
                            border: "1px solid #d1d5db",
                            borderRadius: "6px",
                            textAlign: "center",
                            fontSize: "12px",
                          }}
                        />
                        <button
                          id="measurementNextPageBtn"
                          className="mini-btn"
                          style={{ flex: 1 }}
                        >
                          →
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
                          <h4
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              marginBottom: "8px",
                              borderBottom: "2px solid #3b82f6",
                              paddingBottom: "4px",
                            }}
                          >
                            Line Measurements
                          </h4>
                          <div
                            id="measurementListLeft"
                            style={{
                              fontSize: "12px",
                              color: "#374151",
                              minHeight: "200px",
                            }}
                          >
                            No measurements
                          </div>
                        </div>
                        <div>
                          <h4
                            style={{
                              fontWeight: 600,
                              fontSize: "13px",
                              marginBottom: "8px",
                              borderBottom: "2px solid #10b981",
                              paddingBottom: "4px",
                            }}
                          >
                            Surface Area
                          </h4>
                          <div
                            id="measurementListRight"
                            style={{
                              fontSize: "12px",
                              color: "#374151",
                              minHeight: "200px",
                            }}
                          >
                            No surface area
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* measurementsContent */}
                  </div>
                </aside>
              </div>
            </div>
          </div>

          {/* ANALYSIS CARD — below canvas, shown after project loaded */}
          <div
            id="analysisCard"
            className="bg-white rounded-lg shadow-md p-6 mt-6"
            style={{ display: "none" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-800">
                Analysis
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
              <div className="grid grid-cols-5 gap-x-6 gap-y-3 text-sm mb-4">
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
                    Toll Cost
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
              <div className="grid grid-cols-6 gap-x-6 gap-y-3 text-sm pt-3 border-t border-gray-100">
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
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wide">
                    Margin
                  </span>
                  <div
                    id="analysisViewMargin"
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
                    className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
                    className="px-3 py-1.5 text-xs border border-blue-300 rounded bg-white text-blue-600 hover:bg-blue-50 cursor-pointer"
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
                  id="startAddressSelect"
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400 mb-2"
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
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
              {/* Expected Days to Complete */}
              <div className="mb-4 pb-4 border-b border-gray-100">
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
                    className="px-3 py-1.5 text-xs border border-blue-300 rounded bg-white text-blue-600 hover:bg-blue-50 cursor-pointer"
                  >
                    Reset to auto
                  </button>
                </div>
              </div>
              {/* Hidden inputs keep default values for new crew members */}
              <input type="hidden" id="cleanerRateInput" defaultValue="22" />
              <input type="hidden" id="foremanRateInput" defaultValue="220" />

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

              {/* Calc summary — rendered by JS */}
              <div id="calcSummaryContainer" className="mb-4"></div>

              {/* Global rates */}
              <div className="grid grid-cols-2 gap-3 mb-5 pb-4 border-b border-gray-100">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Overhead (%)
                  </label>
                  <input
                    type="number"
                    id="overheadInput"
                    defaultValue="10"
                    min="0"
                    step="0.1"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="text"
                      id="taxZipInput"
                      placeholder="ZIP"
                      maxLength={5}
                      className="w-16 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
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
                    defaultValue="10"
                    min="0"
                    step="0.1"
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Margin — single row */}
              <div className="mb-3 pt-4 border-t border-gray-100">
                <label className="block text-xs text-gray-500 mb-1">
                  Margin ($)
                </label>
                <input
                  type="number"
                  id="marginInput"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              {/* Gasoline + Toll Cost + Drive info (read-only) */}
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
                    className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
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
                    className="w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              {/* Change Order Billing Rates */}
              <div className="mb-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Change Order Rates
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Cleaner ($/hr)
                    </label>
                    <input
                      type="number"
                      id="coBillingCleanerInput"
                      defaultValue="42"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Supervisor ($/hr)
                    </label>
                    <input
                      type="number"
                      id="coBillingSupervisorInput"
                      defaultValue="47"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      PM ($/hr)
                    </label>
                    <input
                      type="number"
                      id="coBillingPmInput"
                      defaultValue="0"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Hours / Day
                    </label>
                    <input
                      type="number"
                      id="coHoursPerDayInput"
                      defaultValue="8"
                      min="1"
                      max="24"
                      step="1"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Materials ($)
                    </label>
                    <input
                      type="number"
                      id="coMaterialsInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Materials GC ($)
                    </label>
                    <input
                      type="number"
                      id="coMaterialsGCInput"
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  id="saveAnalysisBtn"
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                >
                  Save
                </button>
                <button id="cancelAnalysisBtn" className="mini-btn">
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* CHANGE ORDER CARD */}
          <div
            id="changeOrderCard"
            className="bg-white rounded-lg shadow-md p-6 mt-4"
            style={{ display: "none" }}
          >
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              Change Order
            </h3>
            <div>
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-600">Labor Change Order</span>
                <span
                  id="coLaborChangeOrderDisplay"
                  className="text-sm font-semibold text-gray-900"
                >
                  —
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-600">Labor Costs</span>
                <span
                  id="coLaborCostsDisplay"
                  className="text-sm font-semibold text-gray-900"
                >
                  —
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-600">Materials</span>
                <span
                  id="coMaterialsDisplay"
                  className="text-sm font-semibold text-gray-900"
                >
                  —
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 border-b border-gray-100">
                <span className="text-sm text-gray-600">
                  Materials (General Contractor)
                </span>
                <span
                  id="coMaterialsGCDisplay"
                  className="text-sm font-semibold text-gray-900"
                >
                  —
                </span>
              </div>
              <div className="flex items-center justify-between pt-3 mt-1">
                <span className="text-sm font-bold text-gray-800">Profit</span>
                <span
                  id="coProfitDisplay"
                  className="text-base font-bold text-blue-700"
                >
                  —
                </span>
              </div>
            </div>
          </div>

          <div
            id="sovCard"
            className="bg-white rounded-lg shadow-md p-6 mt-4"
            style={{ display: "none" }}
          >
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
  );
}
