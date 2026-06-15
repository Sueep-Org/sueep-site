"use client";

import { useEffect, useRef } from "react";

export default function EstimatorPage() {
  const loaded = useRef(false);

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
                <button id="toggleSidebarBtn" className="mini-btn">
                  Measurements
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
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold mb-2">
                          Measurements
                        </h3>
                        <button id="toggleMeasurementsBtn" className="mini-btn">
                          ▼
                        </button>
                      </div>
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

          {/* ALL PAGES TOTAL */}
          <div
            id="allPagesTotalContainer"
            className="bg-white rounded-lg shadow-md p-4 mt-6"
            style={{ display: "none" }}
          >
            <div
              id="measurementTotalAggregateInfo"
              style={{ fontSize: "14px", color: "#374151", fontWeight: 600 }}
            >
              All pages total: 0&quot;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
