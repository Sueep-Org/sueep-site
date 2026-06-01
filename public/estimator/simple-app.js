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

      // Only show analysis JSON files — PDFs are already on user's local machine
      if (!display.toLowerCase().endsWith('.json')) return;

      const downloadUrl = `${API_BASE}/api/files/download-local?name=${encodeURIComponent(full)}`;

      // Show a clean label: strip ".analysis.json" suffix if present
      const label = display.replace(/\.analysis\.json$/i, '') || display;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:.5rem;';
      row.dataset.filename = display;

      const nameEl = document.createElement('span');
      nameEl.textContent = label;
      nameEl.title = display;
      nameEl.style.cssText = 'flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;';

      const dlBtn = document.createElement('button');
      dlBtn.textContent = '⬇ JSON';
      dlBtn.title = 'Download analysis result';
      dlBtn.style.cssText = 'padding:.4rem .6rem;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer;font-size:12px;color:#333;flex-shrink:0;';
      dlBtn.onclick = ()=>{
        window.open(downloadUrl, '_blank');
      };

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑';
      delBtn.title = 'Delete';
      delBtn.style.cssText = 'padding:.4rem .5rem;border:1px solid #fca5a5;border-radius:8px;background:white;cursor:pointer;font-size:12px;flex-shrink:0;';
      delBtn.onclick = async ()=>{
        if (!confirm(`Delete "${label}"?`)) return;
        try{
          await deleteSaved(full);
          row.remove();
          toast('Deleted', 'success');
        }catch(e){
          toast('Delete failed: ' + e.message, 'error');
        }
      };

      row.appendChild(nameEl);
      row.appendChild(dlBtn);
      row.appendChild(delBtn);
      savedSec.appendChild(row);
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

  if(e.target.closest('#refreshDrawerBtn')){
    refreshDrawer();
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

  const zoomInBtn = $('zoomInBtn');

  const zoomOutBtn = $('zoomOutBtn');

  // FIXED IDS
  const zoomResetBtn = $('zoomResetBtn');

  const zoomLabel = $('zoomLabel');
  const prevPageBtn = $('prevPageBtn');
  const nextPageBtn = $('nextPageBtn');
  const pageInfo = $('pageInfo');
  const measurementList = $('measurementList');
  const measurementScaleInfo = $('measurementScaleInfo');
  const changeScaleBtn = $('changeScaleBtn');
  const doubleSideToggle = $('doubleSideToggle');

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

  function updateMeasurementList(){
    if (!measurementList) return;
    const measurements = highlightsStore.listMeasurements(currentPage) || [];
    const scale = highlightsStore.getScale(currentPage);
    if (measurementScaleInfo) {
      measurementScaleInfo.textContent = (scale && scale.factor)
        ? `Scale set: 1 in = ${(1 / scale.factor).toFixed(1)} px`
        : 'Scale not set';
    }
    if (!measurements.length) {
      measurementList.innerHTML = 'No saved measurements';
      return;
    }
    measurementList.innerHTML = measurements.map(m => {
      const label = m.label || `${(m.inches || 0).toFixed(1)} in`;
      const badge = m.doubleSided ? ' <span style="color:#0284c7;font-weight:600;">(double-sided)</span>' : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:4px;">
        <span>${label}${badge}</span>
        <button class="mini-btn" data-measurement-id="${m.id}" style="padding:2px 6px;min-width:auto;">X</button>
      </div>`;
    }).join('');
    measurementList.querySelectorAll('button[data-measurement-id]').forEach((btn) => {
      btn.onclick = () => {
        highlightsStore.removeMeasurement(currentPage, btn.dataset.measurementId);
        updateMeasurementList();
        overlay.redraw();
        toast('Measurement removed', 'info');
      };
    });
  }

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
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${pdfDoc.numPages}`;
    if (prevPageBtn) {
      prevPageBtn.disabled = currentPage <= 1;
      prevPageBtn.style.display = pdfDoc.numPages > 1 ? 'inline-block' : 'none';
    }
    if (nextPageBtn) {
      nextPageBtn.disabled = currentPage >= pdfDoc.numPages;
      nextPageBtn.style.display = pdfDoc.numPages > 1 ? 'inline-block' : 'none';
    }
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

      zoom = 1;

      panOffset = {
        x: 0,
        y: 0
      };

      await renderPage();

      if (mainContent){

        mainContent.classList.remove('hidden');
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

  // SCALE HELPER
  function computeScaleFactorFromExpression(str, pxPerPt) {
    if (!str) return null;
    const parts = str.split('=');
    if (parts.length !== 2) return null;
    const leftInches = parseMeasurementToInches(parts[0].trim());
    const rightInches = parseMeasurementToInches(parts[1].trim());
    if (!leftInches || !rightInches) return null;
    if (pxPerPt && pxPerPt > 0) {
      return (rightInches / leftInches) * (1 / (pxPerPt * 72));
    }
    return null;
  }

  // CHANGE SCALE BUTTON
  if (changeScaleBtn) {
    changeScaleBtn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const entry = window.prompt('Enter page scale (example: "1/16 in = 1 ft"). Must contain "=".');
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

  // DOUBLE SIDED TOGGLE
  if (doubleSideToggle) {
    doubleSideToggle.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const isDouble = !doubleSideToggle.classList.contains('active');
      doubleSideToggle.classList.toggle('active', isDouble);
      doubleSideToggle.textContent = isDouble ? 'Double sided' : 'Single sided';
      overlay.setDoubleSided(isDouble);
    };
  }

  // PAGE NAVIGATION
  if (prevPageBtn) {
    prevPageBtn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!pdfDoc || currentPage <= 1) return;
      currentPage -= 1;
      await renderPage();
    };
  }
  if (nextPageBtn) {
    nextPageBtn.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
      currentPage += 1;
      await renderPage();
    };
  }

  // ======================================================
  // MOUSE WHEEL ZOOM
  // ======================================================

  if (pdfContainer){

    pdfContainer.addEventListener('wheel', async (e)=>{

      if (!pdfDoc) return;

      e.preventDefault();

      if (e.deltaY < 0){

        await zoomIn();

      }else{

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

      // do not start panning when overlay is active in measure mode
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

      toast(
        'Uploaded! Analysis running — sidebar will auto-refresh',
        'success'
      );

      // Auto-poll: refresh sidebar every 30s for up to 10 min
      // so user sees the JSON file appear without manually clicking 🔄
      const uploadedBase = (data.file || '').replace(/\.pdf$/i, '');
      let pollCount = 0;
      const maxPolls = 20; // 20 × 30s = 10 min
      const pollTimer = setInterval(async () => {
        pollCount++;
        // Only refresh if sidebar has been initialized
        if (drawerLoaded) {
          await refreshDrawer();
          // Stop once we find the matching analysis JSON
          const items = document.querySelectorAll('#savedSection [data-filename]');
          const found = Array.from(items).some(el =>
            el.dataset.filename.includes(uploadedBase)
          );
          if (found) {
            clearInterval(pollTimer);
            toast('✅ Analysis ready — check sidebar', 'success');
            return;
          }
        }
        if (pollCount >= maxPolls) {
          clearInterval(pollTimer);
        }
      }, 30000);

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
    };
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