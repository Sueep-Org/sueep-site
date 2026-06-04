document.documentElement.classList.add('__drawer_css_loaded__');
console.log('[drawer] wired v2');

import { API_BASE } from './config.js';
import { listFiles, downloadSas, humanSize, humanDate } from './lib/library.js';
import { toast } from './lib/toast.js';

import {
  saveFromProcessing,
  uploadInit,
  listAllNormalized,
  getDownloadUrl,
  renameSaved,
  deleteSaved
} from './lib/api.js';

import { CanvasOverlay } from './lib/highlights/CanvasOverlay.js';
import { HighlightsStore } from './lib/highlights/HighlightsStore.js';

function showAppError(msg){

  const n = document.getElementById('appError');

  if(n){
    n.textContent = String(msg);
    n.style.display = 'block';
  }

  console.error(msg);
}

window.addEventListener('unhandledrejection', (e)=>{
  console.warn('Unhandled promise (suppressed):', e.reason);
});

// ======================================================
// SIDEBAR
// ======================================================

const sidebarRoot = document.getElementById('sidebarRoot');
const libraryMount = document.getElementById('libraryMount');

let drawerLoaded = false;

function renderDrawerSkeleton(){

  if (!libraryMount) return;

  libraryMount.innerHTML = `
    <div id="listContainer" style="padding:.5rem;">
      <div id="listLoading">Loading…</div>
      <div id="savedSection"></div>
    </div>
  `;
}

async function refreshDrawer(){

  const savedSec = document.getElementById('savedSection');
  const loading = document.getElementById('listLoading');

  try{

    const savedOnly = await listAllNormalized();

    if (loading) loading.remove();

    savedSec.innerHTML = '';

    if (!savedOnly || savedOnly.length === 0){

      savedSec.innerHTML = `<div>No saved files</div>`;
      return;
    }

    savedOnly.forEach(item=>{

      const full = item.name || item.key || '';
      const display = full.split('/').pop();

      const btn = document.createElement('button');

      btn.textContent = display;

      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.textAlign = 'left';
      btn.style.padding = '.5rem';
      btn.style.marginBottom = '.5rem';
      btn.style.border = '1px solid #ddd';
      btn.style.borderRadius = '8px';
      btn.style.background = 'white';
      btn.style.cursor = 'pointer';

      btn.onclick = async ()=>{

        try{

          const url =
            `${API_BASE}/api/files/download-local?name=${encodeURIComponent(full)}`;

          const resp = await fetch(url);

          const blob = await resp.blob();

          const file = new File([blob], display);

          await window.__handleFile?.(file);

          closeSidebar();

        }catch(e){

          console.error(e);

          toast(e.message, 'error');
        }
      };

      savedSec.appendChild(btn);
    });

  }catch(e){

    console.error(e);
  }
}

async function ensureDrawer(){

  if (!drawerLoaded){

    drawerLoaded = true;

    renderDrawerSkeleton();

    await refreshDrawer();
  }
}

function openSidebar(){

  if (!sidebarRoot) return;

  sidebarRoot.dataset.open = 'true';

  ensureDrawer();
}

function closeSidebar(){

  if (!sidebarRoot) return;

  sidebarRoot.dataset.open = 'false';
}

document.addEventListener('click', (e)=>{

  if(e.target.closest('[data-open-sidebar]')){

    openSidebar();
  }

  if(e.target.closest('[data-close-sidebar]')){

    closeSidebar();
  }
});

// ======================================================
// MAIN APP
// ======================================================

async function initApp(){

  const $ = id => document.getElementById(id);

  const pdfCanvas = $('pdfCanvas');

  const pdfWrapper =
    $('pdfWrapper') || pdfCanvas?.parentElement;

  const pdfContainer = $('pdfContainer');

  const mainContent = $('mainContent');

  if (!pdfWrapper){

    console.error('Missing pdfWrapper');
    return;
  }

  // ======================================================
  // TOOLBAR BUTTONS
  // ======================================================

  const measureToggle = $('measureToggle');
  const drawRectBtn = $('drawRectBtn');

  const zoomInBtn = $('zoomInBtn');

  const zoomOutBtn = $('zoomOutBtn');

  // FIXED IDS
  const zoomResetBtn = $('zoomResetBtn');

  const zoomLabel = $('zoomLabel');
  const prevPageBtn = $('prevPageBtn');
  const nextPageBtn = $('nextPageBtn');
  const pageInfo = $('pageInfo');
  const vectorLineInfo = $('vectorLineInfo');
  const measurementScaleInfo = $('measurementScaleInfo');
  const measurementPageAggregateInfo = $('measurementPageAggregateInfo');
  const measurementTotalAggregateInfo = $('measurementTotalAggregateInfo');
  const changeScaleBtn = $('changeScaleBtn');
  const doubleSideToggle = $('doubleSideToggle');
  const measurementListLeft = $('measurementListLeft');
  const measurementListRight = $('measurementListRight');
  const measurementPageInput = $('measurementPageInput');
  const measurementPageLabel = $('measurementPageLabel');
  const measurementPrevPageBtn = $('measurementPrevPageBtn');
  const measurementNextPageBtn = $('measurementNextPageBtn');
  const allPagesTotalContainer = $('allPagesTotalContainer');
  console.log('ZOOM BUTTON CHECK:', {
    zoomInBtn,
    zoomOutBtn,
    zoomResetBtn,
    zoomLabel
  });

  // ======================================================
  // PDF STATE
  // ======================================================

  let pdfDoc = null;

  let currentPage = 1;
  let measurementViewPage = 1;

  let zoom = 1;

  let panOffset = {
    x: 0,
    y: 0
  };

  // ======================================================
  // DRAG / PAN
  // ======================================================

  let isDragging = false;

  let dragStart = {
    x: 0,
    y: 0
  };

  // ======================================================
  // HIGHLIGHTS
  // ======================================================

  const highlightsStore = new HighlightsStore();

  const overlay = new CanvasOverlay({
    wrapperEl: pdfWrapper,
    canvasEl: pdfCanvas,
    store: highlightsStore,
    onMeasurementsChanged: updateMeasurementList
  });

  overlay.attach();

  overlay.setActive(false);

  overlay.setTool('area');

  let __renderSeq = 0;

  // ======================================================
  // OVERLAY ALIGNMENT
  // ======================================================

  function syncOverlayTransform(){

    const overlayCanvas =
      pdfWrapper.querySelector('canvas:not(#pdfCanvas)');

    const transform =
      `translate(${panOffset.x}px, ${panOffset.y}px)`;

    pdfCanvas.style.transform = transform;

    if (overlayCanvas){

      overlayCanvas.style.transform = transform;
    }
  }

  // ======================================================
  // UPDATE ZOOM LABEL
  // ======================================================

  function updateZoomLabel(){

    if (zoomLabel){

      zoomLabel.textContent =
        `${Math.round(zoom * 100)}%`;
    }
  }

  function updateVectorLineInfo(){
    if (!vectorLineInfo) return;
    const lines = highlightsStore.getLines(currentPage) || [];
    if (lines.length === 0) {
      vectorLineInfo.textContent = '';
    } else {
      vectorLineInfo.textContent = `Vector lines: ${lines.length}`;
      vectorLineInfo.style.color = '#047857';
    }
  }

  function updateMeasurementList(){
    // Get measurements for the viewed page (not current PDF page)
    const measurements = highlightsStore.listMeasurements(measurementViewPage) || [];
    const scale = highlightsStore.getScale(measurementViewPage);
    
    // Update scale info based on viewed page
    if (measurementScaleInfo) {
      if (scale && scale.factor) {
        const pxPerInch = 1 / scale.factor;
        measurementScaleInfo.textContent = `Scale set: 1 in = ${pxPerInch.toFixed(1)} px`;
      } else {
        measurementScaleInfo.textContent = 'Scale not set';
      }
    }

    // Update page aggregate for the viewed page
    const pageTotalInches = measurements.reduce((sum, item) => sum + (Number(item.inches) || 0), 0);
    if (measurementPageAggregateInfo) {
      measurementPageAggregateInfo.textContent = `Page ${measurementViewPage} total: ${formatInches(pageTotalInches)}`;
    }

    // Update all pages total aggregate at bottom
    const allPageMeasurements = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const allTotalInches = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.inches) || 0), 0);
    }, 0);
    if (measurementTotalAggregateInfo) {
      measurementTotalAggregateInfo.textContent = `All pages total: ${formatInches(allTotalInches)}`;
    }
    if (allPagesTotalContainer) {
      allPagesTotalContainer.style.display = 'block';
    }

    // Update page label
    if (measurementPageLabel) {
      measurementPageLabel.textContent = `Page ${measurementViewPage}`;
    }

    // Split measurements into line (length) and area measurements
    const lineMeasurements = measurements.filter(m => m.area == null);
    const areaMeasurements = measurements.filter(m => m.area != null);

    // Left column: line measurements
    if (measurementListLeft) {
      if (!lineMeasurements.length) {
        measurementListLeft.innerHTML = 'No measurements';
      } else {
        measurementListLeft.innerHTML = lineMeasurements.map(m => {
          const label = m.label || `${(m.inches || 0).toFixed(1)} in`;
          const badge = m.doubleSided ? ' <span style="color:#0284c7;font-weight:600;">(2x)</span>' : '';
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:11px;">${label}${badge}</span>
              <button class="mini-btn" data-measurement-id="${m.id}" style="padding:2px 4px;min-width:auto;font-size:10px;">X</button>
            </div>
          `;
        }).join('');
        measurementListLeft.querySelectorAll('button[data-measurement-id]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.dataset.measurementId;
            highlightsStore.removeMeasurement(measurementViewPage, id);
            updateMeasurementList();
            overlay.redraw();
            toast('Measurement removed', 'info');
          };
        });
      }
    }

    // Right column: surface area measurements
    if (measurementListRight) {
      if (!areaMeasurements.length) {
        measurementListRight.innerHTML = '<span style="color:#999;font-size:11px;">No surface areas</span>';
      } else {
        measurementListRight.innerHTML = areaMeasurements.map(m => {
          const label = m.areaLabel || `${(m.area || 0).toFixed(2)} sq`;
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;">
              <span style="font-size:11px;">${label}</span>
              <button class="mini-btn" data-measurement-id="${m.id}" style="padding:2px 4px;min-width:auto;font-size:10px;">X</button>
            </div>
          `;
        }).join('');
        measurementListRight.querySelectorAll('button[data-measurement-id]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.dataset.measurementId;
            highlightsStore.removeMeasurement(measurementViewPage, id);
            updateMeasurementList();
            overlay.redraw();
            toast('Measurement removed', 'info');
          };
        });
      }
    }

    // Page totals: include both length and area
    const pageTotalInches = lineMeasurements.reduce((sum, item) => sum + (Number(item.inches) || 0), 0);
    const pageTotalArea = areaMeasurements.reduce((sum, item) => sum + (Number(item.area) || 0), 0);
    if (measurementPageAggregateInfo) {
      measurementPageAggregateInfo.textContent = `Page ${measurementViewPage} total: ${formatInches(pageTotalInches)} | Area: ${pageTotalArea.toFixed(2)} sq`;
    }

    // All pages totals including area
    const allPageMeasurements = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const allTotalInches = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.inches) || 0), 0);
    }, 0);
    const allTotalArea = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.area) || 0), 0);
    }, 0);
    if (measurementTotalAggregateInfo) {
      measurementTotalAggregateInfo.textContent = `All pages total: ${formatInches(allTotalInches)} | Area: ${allTotalArea.toFixed(2)} sq`;
    }
  }

  // ======================================================
  // RENDER PAGE
  // ======================================================

  async function renderPage(){

    if(!pdfDoc) return;

    const seq = ++__renderSeq;

    const page = await pdfDoc.getPage(currentPage);

    const vp = page.getViewport({
      scale: zoom
    });

    const sc = document.createElement('canvas');

    sc.width = vp.width;
    sc.height = vp.height;

    await page.render({
      canvasContext: sc.getContext('2d'),
      viewport: vp
    }).promise;

    if (seq !== __renderSeq) return;

    pdfCanvas.width = vp.width;
    pdfCanvas.height = vp.height;

    pdfWrapper.style.width = `${vp.width}px`;
    pdfWrapper.style.height = `${vp.height}px`;

    const ctx = pdfCanvas.getContext('2d');

    ctx.clearRect(
      0,
      0,
      pdfCanvas.width,
      pdfCanvas.height
    );

    ctx.drawImage(sc, 0, 0);

    overlay.setZoomPan({
      zoom
    });

    overlay.setPdfSpace({
      pxPerPt: vp.scale
    });

    overlay.resizeToMatchCanvas();

    overlay.setCurrentPage(currentPage);

    overlay.buildBarriersFromCanvas();

    overlay.redraw();

    syncOverlayTransform();

    updateZoomLabel();
    // update page UI
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage <= 1;
      prevPageBtn.style.display = pdfDoc.numPages > 1 ? 'inline-block' : 'none';
    }
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= pdfDoc.numPages;
      nextPageBtn.style.display = pdfDoc.numPages > 1 ? 'inline-block' : 'none';
    }
    // Sync measurement page input with current view
    if (measurementPageInput) {
      measurementPageInput.value = measurementViewPage;
    }
    updateVectorLineInfo();
    updateMeasurementList();
  }

  function parseMeasurementToInches(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    str = str.replace(',', '.');
    const m = str.match(/^([0-9]+\/[0-9]+|[0-9]*\.?[0-9]+)\s*(in|inch|inches|ft|feet|cm|mm|m)?$/i);
    if (!m) return null;
    const val = m[1];
    let num = 0;
    if (val.indexOf('/') >= 0) {
      const parts = val.split('/').map(Number);
      if (!parts[1]) return null;
      num = parts[0] / parts[1];
    } else {
      num = parseFloat(val);
    }
    const unit = (m[2] || 'in').toLowerCase();
    switch (unit) {
      case 'ft': case 'feet': return num * 12;
      case 'cm': return num / 2.54;
      case 'mm': return num / 25.4;
      case 'm': return num * 39.3700787;
      default: return num;
    }
  }

  function formatInches(inches) {
    const total = Number(inches) || 0;
    const feet = Math.floor(total / 12);
    const rem = Math.round((total - feet * 12) * 10) / 10;
    if (feet > 0) return `${feet} ft ${rem}"`;
    return `${rem}"`;
  }

  function computeScaleFactorFromExpression(str, pxPerPt) {
    if (!str) return null;
    const parts = str.split('=');
    if (parts.length === 2) {
      const left = parts[0].trim();
      const right = parts[1].trim();
      const leftInches = parseMeasurementToInches(left);
      const rightInches = parseMeasurementToInches(right);
      if (!leftInches || !rightInches) return null;
      if (pxPerPt && pxPerPt > 0) {
        const pixelsPerInch = pxPerPt * 72;
        return (rightInches / leftInches) * (1 / pixelsPerInch);
      }
      return null;
    }
    return null;
  }

  // ======================================================
  // FILE HANDLER
  // ======================================================

  async function handleFile(file){

    try{

      const ab = await file.arrayBuffer();

      const lib = window.pdfjsLib;

      pdfDoc = await lib.getDocument({
        data: ab
      }).promise;

      currentPage = 1;
      measurementViewPage = 1;

      zoom = 1;

      panOffset = {
        x: 0,
        y: 0
      };

      await renderPage();

      if (mainContent){

        mainContent.classList.remove('hidden');
        // resizeToMatchCanvas was called during renderPage while mainContent was hidden
        // (clientWidth=0). Re-call now that the element is visible so the overlay
        // canvas gets the correct CSS dimensions and can receive pointer events.
        overlay.resizeToMatchCanvas();
      }

    }catch(e){

      showAppError(e);
    }
  }

  window.__handleFile = handleFile;

  // ======================================================
  // ZOOM HELPERS
  // ======================================================

  async function zoomIn(){

    if (!pdfDoc) return;

    zoom += 0.1;

    if (zoom > 5){
      zoom = 5;
    }

    await renderPage();
  }

  async function zoomOut(){

    if (!pdfDoc) return;

    zoom -= 0.1;

    if (zoom < 0.25){
      zoom = 0.25;
    }

    await renderPage();
  }

  async function zoomReset(){

    if (!pdfDoc) return;

    zoom = 1;

    panOffset = {
      x: 0,
      y: 0
    };

    await renderPage();
  }

  // PAGE NAV
  if (prevPageBtn) {
    prevPageBtn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!pdfDoc) return;
      if (currentPage > 1) {
        currentPage -= 1;
        measurementViewPage = currentPage;
        await renderPage();
      }
    };
  }

  if (nextPageBtn) {
    nextPageBtn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!pdfDoc) return;
      if (currentPage < pdfDoc.numPages) {
        currentPage += 1;
        measurementViewPage = currentPage;
        await renderPage();
      }
    };
  }

  // ======================================================
  // MOUSE WHEEL ZOOM
  // ======================================================

  if (pdfContainer){

    pdfContainer.addEventListener('wheel', async (e)=>{

      if (!pdfDoc) return;

      // if user is actively drawing a measure, do not zoom
      try {
        if (overlay && overlay._isDraggingMeasure) {
          e.preventDefault();
          return;
        }
      } catch (err) {}

      e.preventDefault();

      if (e.deltaY < 0){
        await zoomIn();
      } else {
        await zoomOut();
      }

    }, { passive: false });
  }

  // ======================================================
  // BUTTON ZOOM
  // ======================================================

  if (zoomInBtn){

    zoomInBtn.onclick = async (e)=>{

      e.preventDefault();
      e.stopPropagation();

      console.log('ZOOM IN CLICKED');

      await zoomIn();
    };
  }

  if (zoomOutBtn){

    zoomOutBtn.onclick = async (e)=>{

      e.preventDefault();
      e.stopPropagation();

      console.log('ZOOM OUT CLICKED');

      await zoomOut();
    };
  }

  if (zoomResetBtn){

    zoomResetBtn.onclick = async (e)=>{

      e.preventDefault();
      e.stopPropagation();

      console.log('ZOOM RESET CLICKED');

      await zoomReset();
    };
  }

  // ======================================================
  // PAN / MOVE PDF
  // ======================================================

  if (pdfContainer){

    pdfContainer.style.cursor = 'grab';

    pdfContainer.addEventListener('mousedown', (e)=>{

      // IMPORTANT FIX:
      // DO NOT START DRAGGING IF CLICKING BUTTONS

      if (
        e.target.closest('#toolbar') ||
        e.target.closest('button')
      ){
        return;
      }

      // do not start panning when measure mode is active
      if (overlay && overlay.active && overlay.tool === 'measure') return;

      if (!pdfDoc) return;

      isDragging = true;

      dragStart = {
        x: e.clientX - panOffset.x,
        y: e.clientY - panOffset.y
      };

      pdfContainer.style.cursor = 'grabbing';
    });
  }

  window.addEventListener('mouseup', ()=>{

    isDragging = false;

    if (pdfContainer){

      pdfContainer.style.cursor = 'grab';
    }
  });

  window.addEventListener('mousemove', (e)=>{

    if (!isDragging) return;

    panOffset.x =
      e.clientX - dragStart.x;

    panOffset.y =
      e.clientY - dragStart.y;

    syncOverlayTransform();
  });

  // ======================================================
  // FILE INPUTS
  // ======================================================

  const fileInput = $('fileInput');

  const selectBtn = $('selectFileBtn');

  const dropZone = $('dropZone');

  if (selectBtn && fileInput){

    selectBtn.addEventListener('click', ()=>{

      fileInput.click();
    });
  }

  // ======================================================
  // DRAG + DROP
  // ======================================================

  if (dropZone){

    dropZone.addEventListener('dragover', e=>{

      e.preventDefault();

      dropZone.classList.add('border-blue-400');
    });

    dropZone.addEventListener('dragleave', ()=>{

      dropZone.classList.remove('border-blue-400');
    });

    dropZone.addEventListener('drop', async (e)=>{

      e.preventDefault();

      dropZone.classList.remove('border-blue-400');

      const file =
        e.dataTransfer.files?.[0];

      if (!file) return;

      await processFile(file);
    });
  }

  // ======================================================
  // PROCESS FILE
  // ======================================================

  async function processFile(file){

    console.log(
      '[upload] file selected:',
      file.name
    );

    await handleFile(file);

    try {

      const formData = new FormData();

      formData.append('file', file);

      console.log(
        '[upload] sending to backend...'
      );

      const res = await fetch(
        `${API_BASE}/api/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      const data = await res.json();

      console.log('==============================');
      console.log('✅ BACKEND RESPONSE');
      console.log('Saved file:', data.file);
      console.log('PDF Type:', data.type);
      console.log(
        'Result keys:',
        Object.keys(data.result || {})
      );
      console.log('FULL RESULT:', data.result);
      console.log('==============================');

      // If backend returned vector lines per page, try to load them into the overlay store.
      try {
        const pages = data.result && (data.result.pages || data.result);
        if (pages) {
          // pages may be an array or an object keyed by page number
          const pageEntries = Array.isArray(pages) ? pages.map((p, i) => ({ page: i + 1, data: p })) : Object.keys(pages).map(k => ({ page: Number(k), data: pages[k] }));

          for (const pe of pageEntries) {
            const p = pe.data || {};
            const pageNum = pe.page || p.page || 1;
            if (!p.lines || !Array.isArray(p.lines)) continue;

            const normLines = p.lines.map((ln, idx) => {
              // expected formats: { x1,y1,x2,y2 } either normalized (0..1) or absolute pixels/points
              const x1 = Number(ln.x1 ?? ln.x ?? ln.x0 ?? 0);
              const y1 = Number(ln.y1 ?? ln.y ?? ln.y0 ?? 0);
              const x2 = Number(ln.x2 ?? ln.x ?? 0);
              const y2 = Number(ln.y2 ?? ln.y ?? 0);

              // if coordinates look normalized (<=1), keep. Otherwise attempt to normalize using current canvas size
              const normalize = (v, dim) => (v > 1 ? (dim && dim > 0 ? v / dim : v) : v);

              const dimW = pdfCanvas?.width || 0;
              const dimH = pdfCanvas?.height || 0;

              const nx1 = normalize(x1, dimW);
              const ny1 = normalize(y1, dimH);
              const nx2 = normalize(x2, dimW);
              const ny2 = normalize(y2, dimH);

              return { id: ln.id || idx + 1, x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
            });

            highlightsStore.setLines(pageNum, normLines);
            console.log(`Loaded ${normLines.length} vector lines for page ${pageNum}`);
          }

          // redraw overlay for current page
          overlay.redraw();
          updateVectorLineInfo();
          }
      } catch (e) {
        console.warn('Failed to parse vector lines from backend result', e);
      }

      toast(
        'Upload + analysis complete',
        'success'
      );

      if (drawerLoaded){

        await refreshDrawer();
      }

    } catch (err) {

      console.warn(
        '[upload] backend failed:',
        err
      );

      toast(
        'Backend upload failed',
        'error'
      );
    }
  }

  // ======================================================
  // FILE PICKER
  // ======================================================

  if (fileInput){

    fileInput.addEventListener(
      'change',
      async (e)=>{

        const file =
          e.target.files?.[0];

        if (!file) return;

        await processFile(file);
      }
    );
  }

  // ======================================================
  // MEASURE TOOL
  // ======================================================

  if (measureToggle){

    measureToggle.onclick = (e)=>{

      e.preventDefault();
      e.stopPropagation();

      console.log('MEASURE TOGGLE CLICKED');

      const isOn =
        !measureToggle.classList.contains(
          'active'
        );

      measureToggle.classList.toggle(
        'active',
        isOn
      );

      overlay.setActive(isOn);

      overlay.setTool(
        isOn ? 'measure' : 'area'
      );

      if (pdfContainer) {
        pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      }
    };
  }

    if (drawRectBtn) {
      drawRectBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOn = !drawRectBtn.classList.contains('active');

        // turn off measure toggle if active
        if (measureToggle) measureToggle.classList.toggle('active', false);

        drawRectBtn.classList.toggle('active', isOn);

        overlay.setActive(isOn);
        overlay.setTool(isOn ? 'rect' : 'area');

        if (pdfContainer) pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      };
    }

  if (changeScaleBtn) {
    changeScaleBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entry = window.prompt('Enter page scale (example: "1/16 in = 1 ft"). This must contain "=".');
      if (!entry || !entry.trim()) return;
      const scaleFactor = computeScaleFactorFromExpression(entry.trim(), overlay._pxPerPt);
      if (!scaleFactor || scaleFactor <= 0) {
        toast('Invalid scale expression', 'error');
        return;
      }
      highlightsStore.setScale(currentPage, { factor: scaleFactor, unit: 'in' });
      updateMeasurementList();
      overlay.redraw();
      toast('Page scale updated', 'success');
    };
  }

  if (doubleSideToggle) {
    doubleSideToggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isDouble = !doubleSideToggle.classList.contains('active');
      doubleSideToggle.classList.toggle('active', isDouble);
      doubleSideToggle.textContent = isDouble ? 'Double sided' : 'Single sided';
      overlay.setDoubleSided(isDouble);
    };
  }

  // ======================================================
  // MEASUREMENT PAGE NAVIGATION
  // ======================================================

  if (measurementPrevPageBtn) {
    measurementPrevPageBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (measurementViewPage > 1) {
        measurementViewPage -= 1;
        if (measurementPageInput) measurementPageInput.value = measurementViewPage;
        updateMeasurementList();
      }
    };
  }

  if (measurementNextPageBtn) {
    measurementNextPageBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (measurementViewPage < (pdfDoc?.numPages || 999)) {
        measurementViewPage += 1;
        if (measurementPageInput) measurementPageInput.value = measurementViewPage;
        updateMeasurementList();
      }
    };
  }

  if (measurementPageInput) {
    measurementPageInput.addEventListener('change', (e) => {
      const pageNum = parseInt(e.target.value, 10);
      if (pageNum && pageNum >= 1 && pageNum <= (pdfDoc?.numPages || 999)) {
        measurementViewPage = pageNum;
        updateMeasurementList();
      } else {
        e.target.value = measurementViewPage;
      }
    });
  }

  updateZoomLabel();
}

// ======================================================
// START
// ======================================================

function startInit(){

  initApp().catch(e=>showAppError(e));
}

if (document.readyState === 'loading'){

  document.addEventListener(
    'DOMContentLoaded',
    startInit
  );

}else{

  startInit();
}