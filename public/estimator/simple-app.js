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

      const nameEl = document.createElement('span');
      nameEl.textContent = label;
      nameEl.title = display;
      nameEl.style.cssText = 'flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#374151;';

      const dlBtn = document.createElement('a');
      dlBtn.href = downloadUrl;
      dlBtn.download = display;
      dlBtn.textContent = '⬇ JSON';
      dlBtn.title = 'Download analysis result';
      dlBtn.style.cssText = 'padding:.4rem .6rem;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer;font-size:12px;text-decoration:none;color:#333;flex-shrink:0;';

      row.appendChild(nameEl);
      row.appendChild(dlBtn);
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

  const overlay = new CanvasOverlay({
    wrapperEl: pdfWrapper,
    canvasEl: pdfCanvas,
    store: highlightsStore
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