document.documentElement.classList.add('__drawer_css_loaded__');
console.log('[drawer] wired v2');

import { API_BASE } from './config.js';
import { listFiles, downloadSas, humanSize, humanDate } from './lib/library.js';
import { toast } from './lib/toast.js';
import { saveFromProcessing, uploadInit, listAllNormalized, getDownloadUrl, renameSaved, deleteSaved } from './lib/api.js';
import { CanvasOverlay } from './lib/highlights/CanvasOverlay.js';
import { HighlightsStore } from './lib/highlights/HighlightsStore.js';

function showAppError(msg){
  const n=document.getElementById('appError');
  if(n){ n.textContent=String(msg); n.style.display='block'; }
  console.error(msg);
}

window.addEventListener('unhandledrejection', (e)=>{
  console.warn('Unhandled promise (suppressed):', e.reason);
});

const sidebarRoot = document.getElementById('sidebarRoot');
const libraryMount = document.getElementById('libraryMount');
let drawerLoaded = false;

function renderDrawerSkeleton(){
  if (!libraryMount) return;
  libraryMount.innerHTML = `
    <div style="padding:.5rem;border-bottom:1px solid #1f2430;">
      <button data-close-sidebar>✕</button>
      <strong>Library</strong>
    </div>
    <div id="listContainer">
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

      btn.onclick = async ()=>{
        try{
          const { url } = await getDownloadUrl('saved', full);
          const resp = await fetch(url);
          const blob = await resp.blob();
          const file = new File([blob], display);
          await window.__handleFile?.(file);
        }catch(e){
          toast(e.message,'error');
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
  sidebarRoot.dataset.open='true';
  ensureDrawer();
}

function closeSidebar(){
  if (!sidebarRoot) return;
  sidebarRoot.dataset.open='false';
}

document.addEventListener('click',(e)=>{
  if(e.target.closest('[data-open-sidebar]')) openSidebar();
  if(e.target.closest('[data-close-sidebar]')) closeSidebar();
});

async function initApp(){

  const $ = id => document.getElementById(id);

  const pdfCanvas = $('pdfCanvas');
  const pdfWrapper = $('pdfWrapper') || pdfCanvas?.parentElement;
  const mainContent = $('mainContent');

  if (!pdfWrapper){
    console.error('Missing pdfWrapper');
    return;
  }

  const measureToggle = $('measureToggle');

  let pdfDoc=null, currentPage=1, zoom=1;
  let panOffset={x:0,y:0};

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

  async function renderPage(){
    if(!pdfDoc) return;

    const seq = ++__renderSeq;

    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: zoom });

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

    const ctx = pdfCanvas.getContext('2d');
    ctx.drawImage(sc,0,0);

    overlay.setZoomPan({ zoom });
    overlay.setPdfSpace({ pxPerPt: vp.scale });

    overlay.resizeToMatchCanvas();
    overlay.setCurrentPage(currentPage);

    overlay.buildBarriersFromCanvas();
    overlay.redraw();

    pdfCanvas.style.transform =
      `translate(${panOffset.x}px, ${panOffset.y}px)`;
  }

  async function handleFile(file){
    try{
      const ab = await file.arrayBuffer();
      const lib = window.pdfjsLib;

      pdfDoc = await lib.getDocument({data:ab}).promise;
      currentPage=1;
      zoom=1;

      await renderPage();

      if (mainContent){
        mainContent.classList.remove('hidden');
      }

    }catch(e){
      showAppError(e);
    }
  }

  window.__handleFile = handleFile;

  // =========================
  // 🔥 RESTORED UI WIRING (THIS WAS MISSING)
  // =========================
  const fileInput = $('fileInput');
  const selectBtn = $('selectFileBtn');
  const dropZone = $('dropZone');

  if (selectBtn && fileInput){
    selectBtn.addEventListener('click', () => fileInput.click());
  }

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

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      await processFile(file);
    });
  }

  async function processFile(file){
    console.log('[upload] file selected:', file.name);

    await handleFile(file);

    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('[upload] sending to backend...');

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      console.log('==============================');
      console.log('✅ BACKEND RESPONSE');
      console.log('Saved file:', data.file);
      console.log('PDF Type:', data.type);
      console.log('Result keys:', Object.keys(data.result || {}));
      console.log('FULL RESULT:', data.result);
      console.log('==============================');

      toast('Upload + analysis complete', 'success');

    } catch (err) {
      console.warn('[upload] backend failed:', err);
      toast('Backend upload failed', 'error');
    }
  }

  if (fileInput){
    fileInput.addEventListener('change', async (e)=>{
      const file = e.target.files?.[0];
      if (!file) return;
      await processFile(file);
    });
  }

  if (measureToggle){
    measureToggle.addEventListener('click', ()=>{
      const isOn = !measureToggle.classList.contains('active');

      measureToggle.classList.toggle('active', isOn);

      overlay.setActive(isOn);
      overlay.setTool(isOn ? 'measure' : 'area');
    });
  }

}

function startInit(){
  initApp().catch(e=>showAppError(e));
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', startInit);
}else{
  startInit();
}