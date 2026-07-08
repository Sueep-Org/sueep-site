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
let activeProjectId = null;

function renderDrawerSkeleton(){

  const libraryMount = document.getElementById('libraryMount');
  if (!libraryMount) return;

  libraryMount.innerHTML = `
    <div id="listContainer" style="padding:.5rem;">
      <input id="librarySearch" type="text" placeholder="Search projects…"
        style="width:100%;box-sizing:border-box;padding:6px 10px;margin-bottom:.5rem;border:1px solid #ddd;border-radius:6px;font-size:12px;outline:none;" />
      <div id="listLoading">Loading…</div>
      <div id="savedSection"></div>
    </div>
  `;
}

async function refreshDrawer(){
  if (!document.getElementById('savedSection')) {
    renderDrawerSkeleton();
    drawerLoaded = true;
  }
  const savedSec = document.getElementById('savedSection');
  const loading = document.getElementById('listLoading');

  try {
    const res = await fetch(`${API_BASE}/api/projects`, { cache: 'no-store' });
    const data = await res.json();
    const projects = data.projects || [];

    if (loading) loading.remove();
    savedSec.innerHTML = '';

    if (projects.length === 0) {
      savedSec.innerHTML = `<div style="padding:.5rem;color:#888;">No projects yet</div>`;
      return;
    }

    for (const project of projects) {
      const projRes = await fetch(`${API_BASE}/api/projects/${project.id}`, { cache: 'no-store' });
      if (!projRes.ok) continue;
      const projData = await projRes.json();
      const files = projData.files || [];
      const blueprint = files.find(f => f.file_type === 'blueprint') || files[0] || null;

      const row = document.createElement('div');
      row.dataset.name = (project.name || '').toLowerCase();
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:.4rem;flex-wrap:nowrap;min-width:0;';

      const nameBtn = document.createElement('button');
      nameBtn.textContent = `📄 ${project.name}`;
      nameBtn.title = project.name;
      nameBtn.style.cssText = 'flex:1;text-align:left;padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;background:white;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;cursor:' + (blueprint ? 'pointer' : 'default') + ';';

      if (blueprint) {
        nameBtn.onclick = async () => {
          try {
            const resp = await fetch(`${API_BASE}/api/projects/${project.id}/files/${blueprint.id}/download`, { redirect: 'follow' });
            if (!resp.ok) throw new Error('Download failed');
            const blob = await resp.blob();
            const fileObj = new File([blob], blueprint.filename);
            await window.__handleFile?.(fileObj);
            activeProjectId = project.id;
            window.__restoreAnnotations?.(project.id);
            const freshRes = await fetch(`${API_BASE}/api/projects/${project.id}`, { cache: 'no-store' });
            const freshData = freshRes.ok ? await freshRes.json() : projData;
            window.__showProjectLoadedCard?.(freshData, blueprint.filename);
            closeSidebar();
          } catch(e) {
            toast(e.message, 'error');
          }
        };
      }

      row.appendChild(nameBtn);

      if (blueprint) {
        const dlBtn = document.createElement('a');
        dlBtn.textContent = '⬇';
        dlBtn.href = `${API_BASE}/api/projects/${project.id}/files/${blueprint.id}/download`;
        dlBtn.target = '_blank';
        dlBtn.style.cssText = 'flex-shrink:0;padding:4px 8px;border:1px solid #93c5fd;border-radius:6px;background:white;cursor:pointer;font-size:13px;color:#3b82f6;text-decoration:none;';
        row.appendChild(dlBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑';
      delBtn.title = 'Delete project';
      delBtn.style.cssText = 'flex-shrink:0;padding:4px 8px;border:1px solid #fca5a5;border-radius:6px;background:white;cursor:pointer;font-size:13px;color:#ef4444;';
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Delete project "${project.name}" and all its files?`)) return;
        try {
          const r = await fetch(`${API_BASE}/api/projects/${project.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error('Delete failed');
          toast(`Deleted "${project.name}"`, 'info');
        } catch(e) {
          toast(e.message, 'error');
          return;
        }
        try { await refreshDrawer(); } catch(_) {}
      };
      row.appendChild(delBtn);

      savedSec.appendChild(row);
    }

    const searchInput = document.getElementById('librarySearch');
    if (searchInput) {
      searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase().trim();
        savedSec.querySelectorAll('[data-name]').forEach(r => {
          r.style.display = !q || r.dataset.name.includes(q) ? '' : 'none';
        });
      };
    }
  } catch(e) {
    console.error(e);
    if (savedSec) savedSec.innerHTML = `<div style="color:red;padding:.5rem;">Failed to load projects</div>`;
  }
}

async function ensureDrawer(){

  // Reset if libraryMount was re-created by soft navigation
  if (drawerLoaded && !document.getElementById('savedSection')) {
    drawerLoaded = false;
  }

  if (!drawerLoaded){

    drawerLoaded = true;

    renderDrawerSkeleton();

    await refreshDrawer();
  }
}

function openSidebar(){

  const root = document.getElementById('sidebarRoot') || sidebarRoot;
  if (!root) return;

  root.dataset.open = 'true';

  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) toggle.style.display = 'none';

  ensureDrawer();
}

function closeSidebar(){

  const root = document.getElementById('sidebarRoot') || sidebarRoot;
  if (!root) return;

  root.dataset.open = 'false';

  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) toggle.style.display = '';
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
  const drawIrregBtn = $('drawIrregBtn');

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
  const downloadPdfBtn = $('downloadPdfBtn');
  let savePdfBtn = $('savePdfBtn') || createSavePdfBtn();
  let sovModal = null;
  let _sovRows = [];
  let _sovUndoStack = [];
  let _sovStateProjectId = null;
  console.log('ZOOM BUTTON CHECK:', {
    zoomInBtn,
    zoomOutBtn,
    zoomResetBtn,
    zoomLabel,
    savePdfBtn
  });

  function createSavePdfBtn() {
    const existing = $('savePdfBtn');
    if (existing) return existing;
    const toolbar = $('toolbar');
    if (!toolbar) return null;
    const btn = document.createElement('button');
    btn.id = 'savePdfBtn';
    btn.className = 'mini-btn';
    btn.textContent = 'Save';
    if (zoomResetBtn && zoomResetBtn.parentElement === toolbar) {
      toolbar.insertBefore(btn, zoomResetBtn.nextSibling);
    } else {
      toolbar.appendChild(btn);
    }
    return btn;
  }

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

  let zoomAnchor = null;

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

  // Per-project annotation persistence via localStorage
  window.__saveAnnotations = function() {
    if (!activeProjectId) return;
    try { localStorage.setItem(`annotations_${activeProjectId}`, highlightsStore.serialize()); } catch(_) {}
  };
  window.__restoreAnnotations = function(projectId) {
    const json = localStorage.getItem(`annotations_${projectId}`);
    if (json) highlightsStore.deserialize(json);
    overlay.redraw();
  };

  if (downloadPdfBtn) {
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.addEventListener('click', exportCurrentPageWithAnnotations);
  }

  if (savePdfBtn) {
    savePdfBtn.addEventListener('click', exportAllPagesWithAnnotations);
  }

  function formatSovCurrency(value) {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numberValue);
  }

  function getSovFinalPrice() {
    const fromLoadedProject = Number(_loadedProjectData?.quote ?? 0);
    if (Number.isFinite(fromLoadedProject) && fromLoadedProject > 0) return fromLoadedProject;

    const quoteEl = document.getElementById('analysisViewQuote');
    const quoteText = quoteEl?.textContent || '';
    const parsedQuote = Number(String(quoteText).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsedQuote) && parsedQuote > 0) return parsedQuote;

    return null;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function isZeroSovCost(cost) {
    const rawValue = String(cost ?? '').trim();
    if (!rawValue) return true;

    const normalized = rawValue.replace(/[$,%\s]/g, '');
    if (!normalized) return true;

    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) && numericValue <= 0;
  }

  function getSovStorageKey() {
    const projectKey = activeProjectId ? String(activeProjectId) : 'unsaved';
    return `sov_rows_${projectKey}`;
  }

  function ensureSovStateLoaded() {
    if (activeProjectId && _sovStateProjectId === activeProjectId) return;

    if (!activeProjectId) {
      _sovRows = [];
      _sovUndoStack = [];
      _sovStateProjectId = null;
      return;
    }

    try {
      const raw = localStorage.getItem(getSovStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        _sovRows = Array.isArray(parsed) ? parsed : [];
      } else {
        _sovRows = [];
      }
    } catch (_) {
      _sovRows = [];
    }

    _sovUndoStack = [];
    _sovStateProjectId = activeProjectId;
  }

  function persistSovState() {
    if (!activeProjectId) return;
    try {
      localStorage.setItem(getSovStorageKey(), JSON.stringify(_sovRows));
    } catch (_) {}
  }

  function getSovPageRows() {
    ensureSovStateLoaded();

    const totalPages = Number(pdfDoc?.numPages || 0);
    const allPageMeasurements = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const totalArea = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.area) || 0), 0);
    }, 0);
    const finalPrice = getSovFinalPrice();

    const rows = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageMeasurements = highlightsStore.listMeasurements(pageNum) || [];
      const pageArea = pageMeasurements.reduce((sum, item) => sum + (Number(item.area) || 0), 0);
      const percentShare = totalArea > 0 ? (pageArea / totalArea) : 0;
      const percent = totalArea > 0 ? percentShare * 100 : 0;
      const value = finalPrice != null && totalArea > 0 ? percentShare * finalPrice : null;
      rows.push({
        page: pageNum,
        description: `Page ${pageNum}`,
        cost: value != null ? formatSovCurrency(value) : `${percent.toFixed(2)}%`
      });
    }

    if (!_sovRows.length) {
      _sovRows = rows.map((row) => ({ ...row, deleted: false, forceVisible: false }));
      persistSovState();
      return _sovRows.filter((row) => !row.deleted);
    }

    const existingByPage = new Map(_sovRows.map((row) => [row.page, row]));
    const syncedRows = rows.map((row) => {
      const existing = existingByPage.get(row.page);
      return {
        page: row.page,
        description: existing?.description ?? row.description,
        cost: row.cost,
        deleted: existing?.deleted ?? false,
        forceVisible: existing?.forceVisible ?? false,
      };
    });

    const preservedCustomRows = _sovRows.filter((row) => !row.deleted && !rows.some((baseRow) => baseRow.page === row.page));
    _sovRows = [...syncedRows, ...preservedCustomRows];
    persistSovState();
    return _sovRows.filter((row) => !row.deleted);
  }

  function addSovRow() {
    const nextPage = (_sovRows.length ? Math.max(..._sovRows.map((row) => Number(row.page) || 0)) : 0) + 1;
    const newRow = {
      page: nextPage,
      description: `New Row ${nextPage}`,
      cost: '$0.00',
      deleted: false,
      forceVisible: true,
    };
    _sovRows.push(newRow);
    _sovUndoStack.push({ type: 'add', page: newRow.page });
    persistSovState();
    renderSovCard();
  }

  function undoSovRowDelete() {
    const lastAction = _sovUndoStack.pop();
    if (!lastAction) return;

    if (lastAction.type === 'add') {
      const index = _sovRows.findIndex((row) => row.page === lastAction.page);
      if (index >= 0) {
        _sovRows.splice(index, 1);
      }
    } else if (lastAction.type === 'delete') {
      const target = _sovRows.find((row) => row.page === lastAction.row.page);
      if (target) {
        target.deleted = false;
        target.description = lastAction.row.description;
        target.cost = lastAction.row.cost;
        target.forceVisible = true;
      } else {
        _sovRows.push({ ...lastAction.row, deleted: false, forceVisible: true });
      }
    }

    persistSovState();
    renderSovCard();
  }

  function renderSovTable(containerEl) {
    if (!containerEl) return;

    const rows = getSovPageRows();
    const visibleRows = rows.filter((row) => !isZeroSovCost(row.cost) || row.forceVisible);
    containerEl.innerHTML = '';

    if (!visibleRows.length) {
      containerEl.innerHTML = '<div style="font-size:13px;color:#6b7280;">No schedule data available yet.</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'overflow:auto;border:1px solid #e5e7eb;border-radius:8px;';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.style.cssText = 'background:#f9fafb;';
    ['Page', 'Description', 'Cost'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      th.style.cssText = 'padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;color:#111827;';
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    visibleRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="mini-btn" data-delete-sov-row="${row.page}" style="padding:2px 6px;min-width:auto;font-size:11px;line-height:1;">×</button>
            <span>${escapeHtml(row.page)}</span>
          </div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">
          <input type="text" value="${escapeHtml(row.description)}" data-sov-description="${row.page}" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;color:#111827;background:white;" />
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">${escapeHtml(row.cost)}</td>
      `;

      const deleteBtn = tr.querySelector('[data-delete-sov-row]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          const storedRow = _sovRows.find((entry) => entry.page === row.page);
          if (storedRow) {
            _sovUndoStack.push({ type: 'delete', row: { ...storedRow } });
            storedRow.deleted = true;
            persistSovState();
          }
          renderSovCard();
        });
      }

      const descriptionInput = tr.querySelector('[data-sov-description]');
      if (descriptionInput) {
        const saveDescription = (value) => {
          const storedRow = _sovRows.find((entry) => entry.page === row.page);
          if (storedRow) {
            storedRow.description = value;
            persistSovState();
          }
        };
        descriptionInput.addEventListener('input', (event) => saveDescription(event.target.value));
        descriptionInput.addEventListener('change', (event) => saveDescription(event.target.value));
      }

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    containerEl.appendChild(wrapper);
  }

  function renderSovCard() {
    const card = document.getElementById('sovCard');
    const container = document.getElementById('sovTableContainer');
    const undoBtn = document.getElementById('undoSovRowBtn');
    const addBtn = document.getElementById('addSovRowBtn');
    if (!card || !container) return;

    if (!pdfDoc || !_loadedProjectData) {
      card.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    const rows = getSovPageRows();
    const visibleRows = rows.filter((row) => !isZeroSovCost(row.cost) || row.forceVisible);
    card.style.display = 'block';
    container.innerHTML = '';

    if (undoBtn) {
      undoBtn.disabled = !_sovUndoStack.length;
      undoBtn.onclick = undoSovRowDelete;
    }
    if (addBtn) {
      addBtn.onclick = addSovRow;
    }

    if (!visibleRows.length) {
      return;
    }

    renderSovTable(container);
  }

  function openSovModal() {
    if (!pdfDoc) {
      toast('Load a PDF before viewing SOV.', 'info');
      return;
    }

    if (sovModal) {
      sovModal.remove();
      sovModal = null;
    }

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:20px;z-index:10000;';

    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(860px, 100%);max-height:85vh;overflow:auto;background:white;border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,.25);padding:18px;';

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;">
        <div>
          <div style="font-size:16px;font-weight:700;color:#111827;">Schedule of Values</div>
          <div style="font-size:12px;color:#111827;">One row per PDF page. Surface-area percentages are prefilled from current measurements.</div>
        </div>
        <button class="mini-btn" data-close-sov>Close</button>
      </div>
      <div data-sov-modal-body></div>
    `;

    const body = panel.querySelector('[data-sov-modal-body]');
    renderSovTable(body);

    panel.querySelector('[data-close-sov]').addEventListener('click', () => {
      modal.remove();
      sovModal = null;
    });

    modal.appendChild(panel);
    document.body.appendChild(modal);
    sovModal = modal;
  }

  window.__openSovModal = openSovModal;

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

  async function renderPageWithAnnotationsToCanvas(pageNum){
    if (!pdfDoc || !pdfCanvas || !overlay) return null;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.ceil(viewport.width);
    exportCanvas.height = Math.ceil(viewport.height);
    const exportCtx = exportCanvas.getContext('2d');

    const prevPage = overlay.currentPage;
    const prevPxPerPt = overlay._pxPerPt;
    const prevActive = overlay.active;
    const prevTool = overlay.tool;
    const prevMeasurePreview = overlay._measurePreview;
    const prevIrregularPreview = overlay._irregularPreview;
    const prevHoverPoly = overlay.hoverPoly;

    overlay.currentPage = pageNum;
    overlay.setPdfSpace({ pxPerPt: viewport.scale });
    overlay.active = false;
    overlay._measurePreview = null;
    overlay._irregularPreview = null;
    overlay.hoverPoly = null;

    exportCtx.save();
    await page.render({ canvasContext: exportCtx, viewport }).promise;
    overlay.renderToContext(exportCtx, { width: viewport.width, height: viewport.height });
    exportCtx.restore();

    overlay.currentPage = prevPage;
    overlay._pxPerPt = prevPxPerPt;
    overlay.active = prevActive;
    overlay.tool = prevTool;
    overlay._measurePreview = prevMeasurePreview;
    overlay._irregularPreview = prevIrregularPreview;
    overlay.hoverPoly = prevHoverPoly;

    return { exportCanvas, viewport };
  }

  async function exportCurrentPageWithAnnotations(){
    if (!pdfDoc || !pdfCanvas || !overlay) return;

    try {
      const rendered = await renderPageWithAnnotationsToCanvas(currentPage);
      if (!rendered) throw new Error('Failed to render current page for export.');
      const { exportCanvas } = rendered;
      const printWindow = window.open('', '_blank', 'width=1200,height=900');
      if (!printWindow) {
        toast('Please allow popups to download the PDF view.', 'error');
        return;
      }

      const imageUrl = exportCanvas.toDataURL('image/png');
      printWindow.document.write(`
        <html>
          <head>
            <title>Exported PDF</title>
            <style>
              body { margin: 0; padding: 0; background: #fff; }
              img { display: block; width: 100%; height: auto; }
              @media print { body { margin: 0; } img { page-break-inside: avoid; } }
            </style>
          </head>
          <body>
            <img src="${imageUrl}" alt="Exported PDF page" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        try { printWindow.print(); } catch (err) {}
      }, 250);
    } catch (error) {
      console.error(error);
      toast('Unable to export the current page.', 'error');
    }
  }

  async function loadJsPdf(){
    const getJsPdf = () => {
      if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
      if (typeof window.jsPDF === 'function') return window.jsPDF;
      if (typeof window.jspdf?.default === 'function') return window.jspdf.default;
      if (typeof window.jspdf?.default?.jsPDF === 'function') return window.jspdf.default.jsPDF;
      if (typeof window.jspdf === 'function') return window.jspdf;
      return null;
    };

    let jsPDF = getJsPdf();
    if (jsPDF) return jsPDF;

    const urls = [
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
    ];

    const loadScript = (url, timeoutMs = 10000) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      let timeout = setTimeout(() => {
        script.onerror = null;
        script.onload = null;
        reject(new Error(`jsPDF load timed out: ${url}`));
      }, timeoutMs);

      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load jsPDF: ${url}`));
      };
      document.head.appendChild(script);
    });

    for (const url of urls) {
      try {
        await loadScript(url);
        jsPDF = getJsPdf();
        if (jsPDF) return jsPDF;
      } catch (err) {
        console.warn(err);
      }
    }

    return null;
  }

  async function loadPdfLib(){
    if (window.PDFLib) return window.PDFLib;

    if (window._pdfLibLoadingPromise) {
      await window._pdfLibLoadingPromise;
      return window.PDFLib || null;
    }

    const url = 'https://unpkg.com/pdf-lib@1.28.0/dist/pdf-lib.min.js';
    window._pdfLibLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      let timeout = setTimeout(() => {
        script.onerror = null;
        script.onload = null;
        reject(new Error(`PDFLib load timed out: ${url}`));
      }, 10000);
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`Failed to load PDFLib: ${url}`));
      };
      document.head.appendChild(script);
    });

    await window._pdfLibLoadingPromise;
    return window.PDFLib || null;
  }

  async function canvasToArrayBuffer(canvas){
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob returned null'));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      }, 'image/png');
    });
  }

  async function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function exportWithPdfLib(){
    const PDFLib = await loadPdfLib();
    if (!PDFLib) throw new Error('PDFLib unavailable');

    const { PDFDocument, StandardFonts, rgb } = PDFLib;
    const outPdfDoc = await PDFDocument.create();

    const pageCanvases = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const rendered = await renderPageWithAnnotationsToCanvas(pageNum);
      if (!rendered) {
        throw new Error('Failed to render page for export.');
      }
      pageCanvases.push(rendered.exportCanvas);
    }

    for (const canvas of pageCanvases) {
      const pngBytes = await canvasToArrayBuffer(canvas);
      const img = await outPdfDoc.embedPng(pngBytes);
      const page = outPdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height
      });
    }

    if (pageCanvases.length) {
      const rows = getSovPageRows();
      const lastCanvas = pageCanvases[pageCanvases.length - 1];
      const sovPage = outPdfDoc.addPage([lastCanvas.width, lastCanvas.height]);
      const regularFont = await outPdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await outPdfDoc.embedFont(StandardFonts.HelveticaBold);
      const marginX = 48;
      const startY = lastCanvas.height - 60;

      sovPage.drawText('Schedule of Values', {
        x: marginX,
        y: startY,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0)
      });

      sovPage.drawText('Page', {
        x: marginX,
        y: startY - 32,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      sovPage.drawText('Description', {
        x: marginX + 72,
        y: startY - 32,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0)
      });
      sovPage.drawText('Cost', {
        x: marginX + 350,
        y: startY - 32,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0)
      });

      let currentY = startY - 56;
      rows.forEach((row) => {
        sovPage.drawText(String(row.page), {
          x: marginX,
          y: currentY,
          size: 11,
          font: regularFont,
          color: rgb(0, 0, 0)
        });
        sovPage.drawText(String(row.description), {
          x: marginX + 72,
          y: currentY,
          size: 11,
          font: regularFont,
          color: rgb(0, 0, 0)
        });
        sovPage.drawText(String(row.cost), {
          x: marginX + 350,
          y: currentY,
          size: 11,
          font: regularFont,
          color: rgb(0, 0, 0)
        });
        currentY -= 18;
      });
    }

    const pdfBytes = await outPdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    await downloadBlob(blob, `annotated-${Date.now()}.pdf`);
  }

  async function exportAllPagesWithAnnotations(){
    if (!pdfDoc || !savePdfBtn) return;

    const originalSaveText = savePdfBtn.textContent;
    savePdfBtn.disabled = true;
    savePdfBtn.textContent = 'Saving…';

    try {
      await exportWithPdfLib();
      return;
    } catch (error) {
      console.warn('PDFLib export failed, falling back to jsPDF', error);
    }

    try {
      const jsPDF = await loadJsPdf();
      if (!jsPDF) throw new Error('jsPDF unavailable');

      let doc;
      let lastPageWidth = 0;
      let lastPageHeight = 0;
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const rendered = await renderPageWithAnnotationsToCanvas(pageNum);
        if (!rendered) {
          throw new Error('Failed to render page for export.');
        }

        const { exportCanvas, viewport } = rendered;
        const imageUrl = exportCanvas.toDataURL('image/jpeg', 0.85);
        const pageWidth = Math.ceil(viewport.width);
        const pageHeight = Math.ceil(viewport.height);
        lastPageWidth = pageWidth;
        lastPageHeight = pageHeight;

        if (!doc) {
          doc = new jsPDF({ unit: 'px', format: [pageWidth, pageHeight], compress: true });
        } else {
          doc.addPage([pageWidth, pageHeight]);
        }

        doc.addImage(imageUrl, 'JPEG', 0, 0, pageWidth, pageHeight);
      }

      if (!doc) {
        throw new Error('No pages to export.');
      }

      const sovPageWidth = lastPageWidth || 612;
      const sovPageHeight = lastPageHeight || 792;
      const sovRows = getSovPageRows();
      doc.addPage([sovPageWidth, sovPageHeight]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Schedule of Values', 40, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text('Page', 40, 78);
      doc.text('Description', 100, 78);
      doc.text('Cost', 360, 78);
      doc.setLineWidth(0.5);
      doc.line(40, 84, sovPageWidth - 40, 84);

      let nextY = 104;
      sovRows.forEach((row) => {
        doc.text(String(row.page), 40, nextY);
        doc.text(String(row.description), 100, nextY);
        doc.text(String(row.cost), 360, nextY);
        nextY += 16;
      });

      const filename = `annotated-${Date.now()}.pdf`;
      if (typeof doc.save === 'function') {
        doc.save(filename);
      } else if (typeof doc.output === 'function') {
        let blob;
        try {
          const arrayBuffer = doc.output('arraybuffer');
          blob = new Blob([arrayBuffer], { type: 'application/pdf' });
        } catch (err) {
          const blobResult = doc.output('blob');
          blob = blobResult instanceof Blob ? blobResult : new Blob([blobResult], { type: 'application/pdf' });
        }
        await downloadBlob(blob, filename);
      } else {
        throw new Error('PDF save function is unavailable.');
      }
    } catch (error) {
      console.error('PDF export failed', error);
      toast('Unable to save annotated PDF.', 'error');
    } finally {
      savePdfBtn.disabled = false;
      savePdfBtn.textContent = originalSaveText;
    }
  }

  function updateMeasurementList(){
    // Get measurements for the viewed page (not current PDF page)
    const measurements = highlightsStore.listMeasurements(measurementViewPage) || [];
    const scale = highlightsStore.getScale(measurementViewPage);
    
    // Update scale info based on viewed page
    if (measurementScaleInfo) {
      if (scale && scale.factor) {
        const pointsPerInch = 1 / scale.factor;
        measurementScaleInfo.textContent = `Scale set: 1 in = ${pointsPerInch.toFixed(1)} pt`;
      } else {
        measurementScaleInfo.textContent = 'Scale not set';
      }
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

    // All pages totals including area
    const allPageMeasurements = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const allTotalInches = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.inches) || 0), 0);
    }, 0);
    const allTotalArea = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.area) || 0), 0);
    }, 0);

    if (measurementPageAggregateInfo) {
      measurementPageAggregateInfo.textContent = `Page ${measurementViewPage} total: ${formatInches(pageTotalInches)} | Area: ${pageTotalArea.toFixed(2)} sq`;
    }
    if (measurementTotalAggregateInfo) {
      measurementTotalAggregateInfo.textContent = `All pages total: ${formatInches(allTotalInches)} | Area: ${allTotalArea.toFixed(2)} sq`;
    }

    renderSovCard();
  }

  // ======================================================
  // RENDER PAGE
  // ======================================================

  async function renderPage(){

    if(!pdfDoc) return;

    localStorage.setItem('estimator_last_page', currentPage);
    localStorage.setItem('estimator_last_zoom', zoom);

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

  function getMeasurementPixelLength(measurement) {
    if (!measurement || measurement.area != null || !Array.isArray(measurement.pts) || !measurement.pts.length) return 0;

    const seg = measurement.pts[0];
    const width = overlay?.overlay?.width || overlay?.canvasEl?.width || 0;
    const height = overlay?.overlay?.height || overlay?.canvasEl?.height || 0;
    if (!width || !height) return 0;

    return Math.hypot(((Number(seg.x2) || 0) - (Number(seg.x1) || 0)) * width, ((Number(seg.y2) || 0) - (Number(seg.y1) || 0)) * height) || 0;
  }

  function updateLastMeasurementForScale(page, scaleFactor) {
    const measurements = highlightsStore.listMeasurements(page) || [];
    const targetMeasurement = [...measurements].reverse().find((m) => m && m.area == null && Array.isArray(m.pts) && m.pts.length);
    if (!targetMeasurement) return;

    const pixelLength = getMeasurementPixelLength(targetMeasurement);
    if (pixelLength <= 0) return;

    const pageLengthPoints = pixelLength / (overlay._pxPerPt || 1);
    let realInches = pageLengthPoints * Number(scaleFactor || 0);
    if (targetMeasurement.doubleSided) {
      realInches *= 2;
    }

    targetMeasurement.inches = realInches;
    targetMeasurement.label = targetMeasurement.doubleSided ? `${formatInches(realInches)} (double-sided)` : formatInches(realInches);
  }

  function parseMeasurementToInches(str) {
    if (!str) return null;
    str = String(str).trim().toLowerCase();
    str = str.replace(/,/g, '.').replace(/\s+/g, ' ').replace(/\s+and\s+/g, ' ');
    const parseNumericValue = (value) => {
      if (value == null || value === '') return null;
      if (value.indexOf('/') >= 0) {
        const parts = value.split('/').map(Number);
        if (!parts[1] || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
        return parts[0] / parts[1];
      }
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : null;
    };
    const feetAndInchesMatch = str.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(ft|feet|foot|')\s*([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)?\s*(in|inch|inches|")?$/i);
    if (feetAndInchesMatch) {
      const feet = parseNumericValue(feetAndInchesMatch[1]);
      const inches = feetAndInchesMatch[3] ? parseNumericValue(feetAndInchesMatch[3]) : 0;
      if (feet == null || inches == null) return null;
      return feet * 12 + inches;
    }
    const m = str.match(/^([0-9]+\/[0-9]+|[0-9]*\.?[0-9]+)\s*(in|inch|inches|ft|feet|cm|mm|m)?$/i);
    if (!m) return null;
    const val = m[1];
    const num = parseNumericValue(val);
    if (num == null) return null;
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

  function computeScaleFactorFromExpression(str, pixelLength, pxPerPt) {
    if (!str) return null;
    const parts = str.split('=');
    if (parts.length === 2) {
      const left = parts[0].trim();
      const right = parts[1].trim();
      const leftInches = parseMeasurementToInches(left);
      const rightInches = parseMeasurementToInches(right);
      if (!leftInches || !rightInches) return null;
      const pagePoints = leftInches * 72;
      return rightInches / pagePoints;
    }

    const realInches = parseMeasurementToInches(str);
    if (!realInches) return null;
    const pagePoints = (pixelLength || 0) / (Number(pxPerPt) || 1);
    return realInches / pagePoints;
  }

  // ======================================================
  // FILE HANDLER
  // ======================================================

  async function handleFile(file){

    // Save current project's annotations before switching, then clear
    window.__saveAnnotations?.();
    highlightsStore.clearAll();

    try{

      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);

      if (isImage) {
        // Render image directly onto the PDF canvas — no PDF.js needed
        const url = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        pdfDoc = null;
        pdfCanvas.width = img.naturalWidth;
        pdfCanvas.height = img.naturalHeight;
        pdfCanvas.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        // hide page nav since there's only one "page"
        document.getElementById('prevPageBtn').style.display = 'none';
        document.getElementById('nextPageBtn').style.display = 'none';
        document.getElementById('pageInfo').textContent = 'Page 1 of 1';
      } else {
        const ab = await file.arrayBuffer();
        const lib = window.pdfjsLib;
        pdfDoc = await lib.getDocument({ data: ab }).promise;
        currentPage = 1;
        measurementViewPage = 1;
        zoom = 1;
        panOffset = { x: 0, y: 0 };
        await renderPage();
      }

      if (downloadPdfBtn) {
        downloadPdfBtn.disabled = false;
      }
      if (savePdfBtn) {
        savePdfBtn.disabled = false;
      }

      if (mainContent){

        mainContent.classList.remove('hidden');
        overlay.resizeToMatchCanvas();
      }

      // collapse upload zone, show file name
      const dropZone = document.getElementById('dropZone');
      const uploadCollapsed = document.getElementById('uploadCollapsed');
      const uploadedFileName = document.getElementById('uploadedFileName');
      if (dropZone) dropZone.style.display = 'none';
      if (uploadedFileName) uploadedFileName.textContent = file.name;
      if (uploadCollapsed) uploadCollapsed.style.display = 'flex';

    }catch(e){

      showAppError(e);
    }
  }

  window.__handleFile = handleFile;

  // ======================================================
  // PROJECT DETAILS CARD
  // ======================================================

  function updateProjectDetails(project) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    const di = project.driving_info || {};
    setText('detailDistance', di.distance);
    setText('detailDuration', di.duration);
  }

  // ======================================================
  // PROJECT LOADED CARD (sidebar → open project)
  // ======================================================

  let _loadedProjectData = null; // cache for edit form

  function showProjectLoadedCard(projData, blueprintFilename) {
    _loadedProjectData = projData;
    if (projData?.id) localStorage.setItem('estimator_last_project_id', projData.id);

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setText('loadedProjectName', projData.name);
    setText('loadedProjectAddress', projData.address);
    setText('loadedPdfName', blueprintFilename);

    document.getElementById('projectLoadedCard').style.display = 'block';
    document.getElementById('newProjectForm').style.display = 'none';
    document.getElementById('editProjectForm').style.display = 'none';

    updateProjectDetails(projData);
    showAnalysisCard(projData);
  }

  function showNewProjectForm() {
    localStorage.removeItem('estimator_last_project_id');
    localStorage.removeItem('estimator_last_page');
    localStorage.removeItem('estimator_last_zoom');
    document.getElementById('projectLoadedCard').style.display = 'none';
    document.getElementById('newProjectForm').style.display = 'block';
    document.getElementById('editProjectForm').style.display = 'none';
    const aCard = document.getElementById('analysisCard');
    if (aCard) aCard.style.display = 'none';
  }

  function showEditProjectForm() {
    if (!_loadedProjectData) return;
    const nameEl = document.getElementById('editProjectNameInput');
    if (nameEl) nameEl.value = _loadedProjectData.name || '';
    document.getElementById('projectLoadedCard').style.display = 'none';
    document.getElementById('newProjectForm').style.display = 'none';
    document.getElementById('editProjectForm').style.display = 'block';
    window.__projectNameDirty = true;
  }

  window.__showProjectLoadedCard = showProjectLoadedCard;
  window.__showNewProjectForm = showNewProjectForm;

  // ======================================================
  // QUOTATION DATA DISPLAY
  // ======================================================

  async function loadQuotationData(projectId) {
    const card = document.getElementById('quotationDataCard');
    const content = document.getElementById('quotationDataContent');
    if (!card || !content) return;

    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/quotation-data`, { cache: 'no-store' });
      if (!res.ok) { card.style.display = 'none'; return; }
      const { filename, analysis } = await res.json();

      const fileLabel = document.getElementById('quotationFileName');
      if (fileLabel) fileLabel.textContent = filename;

      content.innerHTML = '';

      // ── Cost Rates ──
      const rates = analysis.cost_rates || {};
      if (Object.keys(rates).length > 0) {
        content.appendChild(_section('Cost Rates (per SF)', _rateTable(rates)));
      }

      // ── Labor Breakdown ──
      const lb = analysis.labor_breakdown || {};
      if (Object.keys(lb).length > 0) {
        content.appendChild(_section('Labor Breakdown', _laborTable(lb)));
      }

      // ── Quote Line Items ──
      const quoteSheets = analysis.quote_items || [];
      for (const sheet of quoteSheets) {
        content.appendChild(_section(`Quote — ${sheet.sheet}`, _quoteTable(sheet.items)));
      }

      card.style.display = 'block';
    } catch (e) {
      console.warn('Failed to load quotation data:', e);
    }
  }

  function _section(title, tableEl) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:20px;';
    const h = document.createElement('h4');
    h.textContent = title;
    h.style.cssText = 'font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;';
    wrap.appendChild(h);
    wrap.appendChild(tableEl);
    return wrap;
  }

  function _rateTable(rates) {
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    const thead = table.createTHead();
    const hrow = thead.insertRow();
    ['Service', '$/SF'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = `text-align:${i===0?'left':'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;`;
      hrow.appendChild(th);
    });
    const tbody = table.createTBody();
    for (const [label, val] of Object.entries(rates)) {
      const row = tbody.insertRow();
      row.style.cssText = 'border-top:1px solid #f3f4f6;';
      const td1 = row.insertCell(); td1.textContent = label; td1.style.cssText = 'padding:5px 8px;color:#374151;';
      const td2 = row.insertCell(); td2.textContent = `$${Number(val).toFixed(4)}`; td2.style.cssText = 'padding:5px 8px;text-align:right;color:#374151;font-family:monospace;';
    }
    return table;
  }

  function _laborTable(lb) {
    const serviceTypes = lb['Service Types'] || [];
    const keys = Object.keys(lb).filter(k => k !== 'Service Types');

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    const thead = table.createTHead();
    const hrow = thead.insertRow();
    const headers = ['', ...serviceTypes.slice(0, 4)];
    headers.forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = `text-align:${i===0?'left':'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;`;
      hrow.appendChild(th);
    });
    const tbody = table.createTBody();
    for (const key of keys) {
      const val = lb[key];
      const row = tbody.insertRow();
      row.style.cssText = 'border-top:1px solid #f3f4f6;';
      const td0 = row.insertCell(); td0.textContent = key; td0.style.cssText = 'padding:5px 8px;color:#374151;font-weight:500;';
      const vals = Array.isArray(val) ? val : [val];
      vals.slice(0, 4).forEach(v => {
        const td = row.insertCell();
        td.textContent = typeof v === 'number' ? (v % 1 === 0 ? v : v.toFixed(2)) : (v ?? '—');
        td.style.cssText = 'padding:5px 8px;text-align:right;color:#374151;font-family:monospace;';
      });
    }
    return table;
  }

  function _quoteTable(items) {
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    const thead = table.createTHead();
    const hrow = thead.insertRow();
    ['Description', 'Unit Price', 'Total'].forEach((h, i) => {
      const th = document.createElement('th');
      th.textContent = h;
      th.style.cssText = `text-align:${i===0?'left':'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;`;
      hrow.appendChild(th);
    });
    const tbody = table.createTBody();
    for (const item of items) {
      const isTotal = (item.service || '').toLowerCase() === 'total';
      const row = tbody.insertRow();
      row.style.cssText = `border-top:1px solid ${isTotal ? '#d1d5db' : '#f3f4f6'};${isTotal ? 'font-weight:600;' : ''}`;
      const desc = item.description || item.service || '—';
      const td1 = row.insertCell(); td1.textContent = desc; td1.style.cssText = 'padding:5px 8px;color:#374151;';
      const td2 = row.insertCell(); td2.textContent = item.unit_price ? `$${item.unit_price.toLocaleString()}` : ''; td2.style.cssText = 'padding:5px 8px;text-align:right;color:#374151;';
      const td3 = row.insertCell(); td3.textContent = item.total ? `$${item.total.toLocaleString()}` : ''; td3.style.cssText = `padding:5px 8px;text-align:right;${isTotal ? 'color:#111827;' : 'color:#374151;'}`;
    }
    return table;
  }

  window.__loadQuotationData = loadQuotationData;

  const editProjectBtn = document.getElementById('editProjectBtn');
  if (editProjectBtn) {
    editProjectBtn.addEventListener('click', () => showEditProjectForm());
  }

  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      window.__projectNameDirty = false;
      if (_loadedProjectData) {
        const files = _loadedProjectData.files || [];
        const bp = files.find(f => f.file_type === 'blueprint');
        showProjectLoadedCard(_loadedProjectData, bp?.filename || '');
      } else {
        showNewProjectForm();
      }
    });
  }

  const saveProjectBtn = document.getElementById('saveProjectBtn');
  if (saveProjectBtn) {
    saveProjectBtn.addEventListener('click', async () => {
      if (!activeProjectId) return;
      const nameVal = document.getElementById('editProjectNameInput')?.value?.trim();
      if (!nameVal) { toast('Project name cannot be empty', 'error'); return; }

      saveProjectBtn.textContent = 'Saving…';
      saveProjectBtn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameVal }),
        });
        if (r.status === 409) { toast('A project with that name already exists', 'error'); return; }
        if (!r.ok) throw new Error('Save failed');
        const updated = await r.json();

        // re-fetch full project to get latest files
        const projRes = await fetch(`${API_BASE}/api/projects/${activeProjectId}`, { cache: 'no-store' });
        const projData = projRes.ok ? await projRes.json() : updated;
        const bp = (projData.files || []).find(f => f.file_type === 'blueprint');
        window.__projectNameDirty = false;
        _loadedProjectData = projData;
        showProjectLoadedCard(projData, bp?.filename || '');
        updateProjectDetails(projData);
        toast('Project updated', 'info');
        try { await refreshDrawer(); } catch(_) {}
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        saveProjectBtn.textContent = 'Save';
        saveProjectBtn.disabled = false;
      }
    });
  }

  const changePdfBtn = document.getElementById('changePdfBtn');
  if (changePdfBtn) {
    changePdfBtn.addEventListener('click', () => {
      // full reset — same as "Change file"
      _loadedProjectData = null;
      activeProjectId = null;
      showNewProjectForm();
      const dropZone = document.getElementById('dropZone');
      const uploadCollapsed = document.getElementById('uploadCollapsed');
      if (dropZone) dropZone.style.display = '';
      if (uploadCollapsed) uploadCollapsed.style.display = 'none';
      const nameIn = document.getElementById('projectNameInput');
      const addrIn = document.getElementById('projectAddressInput');
      if (nameIn) nameIn.value = '';
      if (addrIn) addrIn.value = '';
      const mainContent = document.getElementById('mainContent');
      if (mainContent) mainContent.classList.add('hidden');
    });
  }

  const refreshDistanceBtn = document.getElementById('refreshDistanceBtn');
  if (refreshDistanceBtn) {
    refreshDistanceBtn.addEventListener('click', async () => {
      if (!activeProjectId) return;
      refreshDistanceBtn.textContent = '↻ Refreshing...';
      refreshDistanceBtn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}/refresh-distance`, { method: 'POST' });
        if (!r.ok) throw new Error('Failed to refresh');
        const data = await r.json();
        const di = data.driving_info || {};
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        setText('detailDistance', di.distance);
        setText('detailDuration', di.duration);
        toast('Distance updated', 'info');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        refreshDistanceBtn.textContent = '↻ Refresh Distance';
        refreshDistanceBtn.disabled = false;
      }
    });
  }

  // ======================================================
  // ANALYSIS CARD
  // ======================================================

  const fmt$ = v => (v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
  const fmtSF = v => (v != null ? Number(v).toLocaleString() + ' SF' : '—');

  // ---- Estimate phases ----
  const PHASES = ['Rough Cleaning', 'Final Cleaning', 'Touch Up Cleaning'];
  const PHASE_IDS = ['rough', 'final', 'touchup'];

  // Per-phase crew state: each entry is { role: 'cleaner'|'foreman', rate: number, days: number }
  let _phaseCrews = { rough: [], final: [], touchup: [] };

  function _calcPhase(p, rates) {
    const crew = p.crew || [];
    let cleanersPay = 0, foremanPay = 0, pmPay = 0;
    if (crew.length > 0) {
      for (const m of crew) {
        if (m.role === 'cleaner') cleanersPay += (m.rate || 0) * (m.days || 0);
        else if (m.role === 'project_manager') pmPay += (m.rate || 0) * (m.days || 0);
        else foremanPay += (m.rate || 0) * (m.days || 0);
      }
    } else {
      // backward compat: old format with persons/days + global rates
      cleanersPay = (p.persons || 0) * (p.days || 0) * (rates.cleanerRate || 0);
      foremanPay = (p.days || 0) * (rates.foremanRate || 0);
    }
    const laborCost = cleanersPay + foremanPay + pmPay;
    const materials = laborCost * 0.05;
    const subtotal = laborCost + materials;
    const oh = subtotal * rates.overhead;
    const pft = (subtotal + oh) * rates.profit;
    const price = pft + oh + subtotal;
    const taxes = price * rates.tax;
    const comm = price * rates.commission;
    const finalPrice = price + taxes;
    return { cleanersPay, foremanPay, pmPay, laborCost, materials, subtotal, oh, pft, price, taxes, comm, finalPrice };
  }

  function _getRates() {
    const n = id => parseFloat(document.getElementById(id)?.value) || 0;
    return {
      cleanerRate: n('cleanerRateInput'),
      foremanRate: n('foremanRateInput'),
      overhead: n('overheadInput') / 100,
      profit: n('profitInput') / 100,
      tax: n('taxInput') / 100,
      commission: n('commissionInput') / 100,
    };
  }

  function _getPhaseInputs() {
    return PHASE_IDS.map((pid, i) => ({
      name: PHASES[i],
      crew: (_phaseCrews[pid] || []).map(m => ({ ...m })),
      persons: (_phaseCrews[pid] || []).filter(m => m.role === 'cleaner').length,
      days: Math.max(0, ...(_phaseCrews[pid] || []).map(m => m.days || 0), 0),
    }));
  }

  function _updateCrewCalcs() {
    const rates = _getRates();
    const overheadPct = parseFloat(document.getElementById('overheadInput')?.value) || 0;
    const profitPct = parseFloat(document.getElementById('profitInput')?.value) || 0;
    const taxPct = parseFloat(document.getElementById('taxInput')?.value) || 0;
    const commPct = parseFloat(document.getElementById('commissionInput')?.value) || 0;

    let totLabor = 0, totSubtotal = 0, totOh = 0, totPft = 0, totPrice = 0, totTaxes = 0, totComm = 0, totFinal = 0;

    PHASE_IDS.forEach((pid) => {
      const crew = _phaseCrews[pid] || [];
      const c = _calcPhase({ crew }, rates);
      totLabor += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
      totPft += c.pft; totPrice += c.price; totTaxes += c.taxes; totComm += c.comm; totFinal += c.finalPrice;

      crew.forEach((m, idx) => {
        const pay = (m.rate||0)*(m.days||0);
        const el = document.getElementById(`crew_pay_${pid}_${idx}`);
        if (el) el.textContent = fmt$(pay);
      });

      const setFoot = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt$(val); };
      setFoot(`phase_cleaners_${pid}`, c.cleanersPay);
      setFoot(`phase_foreman_${pid}`, c.foremanPay);
      setFoot(`phase_pm_${pid}`, c.pmPay);
      setFoot(`phase_labor_${pid}`, c.laborCost);
      setFoot(`phase_materials_${pid}`, c.materials);
      setFoot(`phase_subtotal_${pid}`, c.subtotal);
    });

    const summaryContainer = document.getElementById('calcSummaryContainer');
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;margin-top:8px;';
      [
        [`Subtotal`, totSubtotal], [`Overhead (${overheadPct}%)`, totOh],
        [`Profit (${profitPct}%)`, totPft], [`Price`, totPrice],
        [`Tax (${taxPct}%)`, totTaxes], [`Commission (${commPct}%)`, totComm],
        [`Final Price`, totFinal],
      ].forEach(([label, val], i) => {
        const isLast = i === 6;
        const item = document.createElement('div');
        item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#2563eb' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
        grid.appendChild(item);
      });
      summaryContainer.appendChild(grid);
    }
  }

  const _updateCalcCells = _updateCrewCalcs;

  function _renderPhaseTable() {
    const container = document.getElementById('phaseTableContainer');
    if (!container) return;
    container.innerHTML = '';

    const iStyle = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;';

    PHASE_IDS.forEach((pid, i) => {
      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
      const nameEl = document.createElement('span');
      nameEl.textContent = PHASES[i];
      nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#374151;';

      const addBtns = document.createElement('div');
      addBtns.style.cssText = 'display:flex;gap:6px;';

      const mkAddBtn = (label, role, color, bg, border, defaultRate) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.style.cssText = `padding:3px 8px;border:1px solid ${border};border-radius:4px;background:${bg};color:${color};font-size:11px;cursor:pointer;`;
        btn.onclick = () => {
          _phaseCrews[pid].push({ role, rate: defaultRate, days: 1 });
          _renderPhaseTable();
        };
        return btn;
      };
      addBtns.appendChild(mkAddBtn('+ Cleaner', 'cleaner', '#2563eb', '#eff6ff', '#93c5fd', parseFloat(document.getElementById('cleanerRateInput')?.value) || 22));
      addBtns.appendChild(mkAddBtn('+ Foreman', 'foreman', '#16a34a', '#f0fdf4', '#86efac', parseFloat(document.getElementById('foremanRateInput')?.value) || 220));
      addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', 300));
      header.appendChild(nameEl); header.appendChild(addBtns);
      section.appendChild(header);

      const crew = _phaseCrews[pid] || [];
      if (crew.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No crew — add a cleaner or foreman above';
        empty.style.cssText = 'padding:12px;text-align:center;color:#9ca3af;font-size:12px;';
        section.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        const thead = table.createTHead();
        const hrow = thead.insertRow();
        ['Role', 'Rate', 'Days', 'Pay', ''].forEach((h, hi) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${hi >= 2 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
          hrow.appendChild(th);
        });
        const tbody = table.createTBody();
        crew.forEach((member, idx) => {
          const tr = tbody.insertRow();
          tr.style.cssText = 'border-top:1px solid #f3f4f6;';

          const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:5px 10px;';
          const badge = document.createElement('span');
          badge.textContent = member.role === 'cleaner' ? 'Cleaner' : member.role === 'project_manager' ? 'Project Manager' : 'Foreman';
          badge.style.cssText = member.role === 'cleaner'
            ? 'padding:2px 7px;border-radius:10px;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:500;'
            : member.role === 'project_manager'
            ? 'padding:2px 7px;border-radius:10px;background:#f5f3ff;color:#7c3aed;font-size:11px;font-weight:500;'
            : 'padding:2px 7px;border-radius:10px;background:#f0fdf4;color:#16a34a;font-size:11px;font-weight:500;';
          roleTd.appendChild(badge);

          const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:4px 10px;';
          const rateWrap = document.createElement('div'); rateWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const rateInput = document.createElement('input');
          rateInput.type = 'number'; rateInput.min = '0'; rateInput.step = '0.01'; rateInput.value = member.rate;
          rateInput.style.cssText = iStyle + 'width:64px;';
          rateInput.addEventListener('input', () => { _phaseCrews[pid][idx].rate = parseFloat(rateInput.value) || 0; _updateCrewCalcs(); });
          const rateLabel = document.createElement('span');
          rateLabel.textContent = '$/day';
          rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
          rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel);
          rateTd.appendChild(rateWrap);

          const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
          const daysInput = document.createElement('input');
          daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
          daysInput.style.cssText = iStyle + 'width:56px;';
          daysInput.addEventListener('input', () => { _phaseCrews[pid][idx].days = parseFloat(daysInput.value) || 0; _updateCrewCalcs(); });
          daysTd.appendChild(daysInput);

          const payTd = tr.insertCell();
          payTd.id = `crew_pay_${pid}_${idx}`;
          payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
          const pay = member.role === 'cleaner' ? (member.rate||0)*(member.days||0)*8 : (member.rate||0)*(member.days||0);
          payTd.textContent = fmt$(pay);

          const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
          const delBtn = document.createElement('button');
          delBtn.type = 'button'; delBtn.textContent = '\u00d7';
          delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
          delBtn.onclick = () => { _phaseCrews[pid].splice(idx, 1); _renderPhaseTable(); };
          delTd.appendChild(delBtn);
        });
        table.appendChild(tbody);
        section.appendChild(table);
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;gap:16px;padding:6px 12px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;flex-wrap:wrap;';
      [
        ['Cleaners Pay', `phase_cleaners_${pid}`],
        ['Foreman Pay', `phase_foreman_${pid}`],
        ['PM Pay', `phase_pm_${pid}`],
        ['Labor', `phase_labor_${pid}`],
        ['Materials', `phase_materials_${pid}`],
        ['Subtotal', `phase_subtotal_${pid}`],
      ].forEach(([label, id]) => {
        const span = document.createElement('span');
        span.innerHTML = `${label}: <strong id="${id}" style="color:#374151;">$0.00</strong>`;
        footer.appendChild(span);
      });
      section.appendChild(footer);
      container.appendChild(section);
    });

    ['overheadInput', 'profitInput', 'taxInput', 'commissionInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updateCrewCalcs);
    });

    _updateCrewCalcs();
  }

  function showAnalysisCard(projData) {
    const card = document.getElementById('analysisCard');
    if (!card) return;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const breakdownDiv = document.getElementById('analysisViewBreakdown');
    if (breakdownDiv) {
      breakdownDiv.innerHTML = '';
      const bd = projData.labor_breakdown;
      if (bd && bd.phases && bd.phases.length > 0) {
        const rates = {
          cleanerRate: bd.cleaner_rate || 0,
          foremanRate: bd.foreman_rate || 0,
          overhead: (bd.overhead_pct || 0) / 100,
          profit: (bd.profit_pct || 0) / 100,
          tax: (bd.tax_pct || 0) / 100,
          commission: (bd.commission_pct || 0) / 100,
        };

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        const thead = table.createTHead();
        const hrow = thead.insertRow();
        ['Phase', 'Persons', 'Days', 'Cleaners Pay', 'Foreman Pay', 'Labor Cost', 'Materials', 'Subtotal'].forEach((h, i) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${i <= 2 ? 'left' : 'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;font-size:11px;white-space:nowrap;`;
          hrow.appendChild(th);
        });
        const tbody = table.createTBody();
        let totLaborCost = 0, totSubtotal = 0, totOh = 0, totPft = 0, totPrice = 0, totTaxes = 0, totComm = 0, totFinal = 0;
        for (const p of bd.phases) {
          const c = _calcPhase(p, rates);
          totLaborCost += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
          totPft += c.pft; totPrice += c.price; totTaxes += c.taxes; totComm += c.comm; totFinal += c.finalPrice;
          const tr = tbody.insertRow();
          tr.style.cssText = 'border-top:1px solid #f3f4f6;';
          [
            { v: p.name, a: 'left' }, { v: p.persons || 0, a: 'left' }, { v: p.days || 0, a: 'left' },
            { v: fmt$(c.cleanersPay), a: 'right' }, { v: fmt$(c.foremanPay), a: 'right' },
            { v: fmt$(c.laborCost), a: 'right' }, { v: fmt$(c.materials), a: 'right' }, { v: fmt$(c.subtotal), a: 'right' },
          ].forEach(({ v, a }) => {
            const td = tr.insertCell();
            td.textContent = v;
            td.style.cssText = `padding:5px 8px;text-align:${a};color:#374151;white-space:nowrap;`;
          });
        }
        breakdownDiv.appendChild(table);

        const pricingDiv = document.createElement('div');
        pricingDiv.style.cssText = 'margin-top:8px;display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;';
        [
          [`Subtotal`, totSubtotal], [`Overhead (${bd.overhead_pct}%)`, totOh],
          [`Profit (${bd.profit_pct}%)`, totPft], [`Price`, totPrice],
          [`Tax (${bd.tax_pct}%)`, totTaxes], [`Commission (${bd.commission_pct}%)`, totComm],
          [`Final Price`, totFinal],
        ].forEach(([label, val], i) => {
          const isLast = i === 6;
          const item = document.createElement('div');
          item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#2563eb' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
          pricingDiv.appendChild(item);
        });
        breakdownDiv.appendChild(pricingDiv);
      }
    }

    setText('analysisViewAddress', projData.address || '');
    const DEFAULT_OFFICE = '2 Bala Plaza, Bala Cynwyd, PA 19004';
    setText('analysisViewStartAddress', projData.start_address || DEFAULT_OFFICE);
    const lps = (projData.labor != null && projData.total_area) ? (projData.labor / projData.total_area) : null;
    setText('analysisViewLabor', fmt$(projData.labor));
    setText('analysisViewTotalArea', fmtSF(projData.total_area));
    setText('analysisViewQuote', fmt$(projData.quote));
    setText('analysisViewLaborPerSF', lps != null ? `$${lps.toFixed(4)}/SF` : '—');
    setText('analysisViewGasoline', projData.gasoline != null ? fmt$(projData.gasoline) : '—');
    setText('analysisViewMargin', projData.margin != null ? fmt$(projData.margin) : '—');

    document.getElementById('analysisView').style.display = 'block';
    document.getElementById('analysisEditForm').style.display = 'none';
    document.getElementById('editAnalysisBtn').style.display = '';
    card.style.display = 'block';
    renderSovCard();
  }


  function showAnalysisEditForm() {
    if (!_loadedProjectData) return;
    const bd = _loadedProjectData.labor_breakdown;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const phaseMap = { 'Rough Cleaning': 'rough', 'Final Cleaning': 'final', 'Touch Up Cleaning': 'touchup' };

    // Reset then restore crew from saved data
    _phaseCrews = { rough: [], final: [], touchup: [] };

    if (bd && bd.phases) {
      setVal('cleanerRateInput', bd.cleaner_rate ?? 22);
      setVal('foremanRateInput', bd.foreman_rate ?? 220);
      setVal('overheadInput', bd.overhead_pct ?? 10);
      setVal('profitInput', bd.profit_pct ?? 25);
      setVal('taxInput', bd.tax_pct ?? 6);
      setVal('commissionInput', bd.commission_pct ?? 10);

      for (const p of bd.phases) {
        const pid = phaseMap[p.name];
        if (!pid) continue;
        if (p.crew && p.crew.length > 0) {
          _phaseCrews[pid] = p.crew.map(m => ({ ...m }));
        } else {
          // Convert old format (persons/days + global rates) to crew
          const cr = bd.cleaner_rate || 22;
          const fr = bd.foreman_rate || 220;
          const days = p.days || 1;
          for (let k = 0; k < (p.persons || 1); k++) _phaseCrews[pid].push({ role: 'cleaner', rate: cr, days });
          _phaseCrews[pid].push({ role: 'foreman', rate: fr, days });
        }
      }
    } else {
      ['rough', 'final', 'touchup'].forEach(pid => {
        _phaseCrews[pid] = [{ role: 'cleaner', rate: 22, days: 2 }, { role: 'foreman', rate: 220, days: 2 }];
      });
    }

    _renderPhaseTable();

    setVal('analysisTotalAreaInput', _loadedProjectData.total_area);
    setVal('analysisAddressInput', _loadedProjectData.address);
    setVal('gasolineInput', _loadedProjectData.gasoline);
    setVal('marginInput', _loadedProjectData.margin);

    // Start address dropdown
    const sel = document.getElementById('startAddressSelect');
    const customInput = document.getElementById('startAddressInput');
    const savedStart = _loadedProjectData.start_address;
    if (sel && customInput) {
      if (savedStart) {
        sel.value = 'custom';
        customInput.style.display = '';
        customInput.value = savedStart;
      } else {
        sel.value = 'default';
        customInput.style.display = 'none';
        customInput.value = '';
      }
      sel.onchange = () => {
        customInput.style.display = sel.value === 'custom' ? '' : 'none';
        if (sel.value === 'default') customInput.value = '';
      };
    }

    document.getElementById('analysisView').style.display = 'none';
    document.getElementById('analysisEditForm').style.display = 'block';
    document.getElementById('editAnalysisBtn').style.display = 'none';
  }

  const editAnalysisBtn = document.getElementById('editAnalysisBtn');
  if (editAnalysisBtn) editAnalysisBtn.addEventListener('click', () => {
    window.__analysisDirty = true;
    showAnalysisEditForm();
  });

  const cancelAnalysisBtn = document.getElementById('cancelAnalysisBtn');
  if (cancelAnalysisBtn) cancelAnalysisBtn.addEventListener('click', () => {
    window.__analysisDirty = false;
    if (_loadedProjectData) showAnalysisCard(_loadedProjectData);
  });

  const saveAnalysisBtn = document.getElementById('saveAnalysisBtn');
  if (saveAnalysisBtn) {
    saveAnalysisBtn.addEventListener('click', async () => {
      if (!activeProjectId) return;
      if (!window.confirm('Are you sure you want to save this analysis?')) return;
      const rates = _getRates();
      const phases = _getPhaseInputs();

      let totLabor = 0, totFinalPrice = 0;
      for (const p of phases) {
        const c = _calcPhase(p, rates);
        totLabor += c.laborCost;
        totFinalPrice += c.finalPrice;
      }

      const overheadPct = parseFloat(document.getElementById('overheadInput')?.value) || 0;
      const profitPct = parseFloat(document.getElementById('profitInput')?.value) || 0;
      const taxPct = parseFloat(document.getElementById('taxInput')?.value) || 0;
      const commPct = parseFloat(document.getElementById('commissionInput')?.value) || 0;

      const laborBreakdown = {
        cleaner_rate: rates.cleanerRate,
        foreman_rate: rates.foremanRate,
        overhead_pct: overheadPct,
        profit_pct: profitPct,
        tax_pct: taxPct,
        commission_pct: commPct,
        phases,
      };

      const areaVal = document.getElementById('analysisTotalAreaInput')?.value;
      const addrVal = document.getElementById('analysisAddressInput')?.value?.trim() || '';
      const prevAddr = _loadedProjectData.address || '';
      const gasolineVal = document.getElementById('gasolineInput')?.value;
      const marginVal = document.getElementById('marginInput')?.value;
      const startSel = document.getElementById('startAddressSelect');
      const startCustom = document.getElementById('startAddressInput');
      const startAddrVal = (startSel?.value === 'custom' ? startCustom?.value?.trim() : '') || '';
      const body = {
        labor: totLabor > 0 ? totLabor : null,
        labor_breakdown: laborBreakdown,
        quote: totFinalPrice > 0 ? totFinalPrice : null,
        address: addrVal,
        start_address: startAddrVal || null,
      };
      if (areaVal !== '') body.total_area = parseFloat(areaVal) || null;
      if (gasolineVal !== '') body.gasoline = parseFloat(gasolineVal) || null;
      if (marginVal !== '') body.margin = parseFloat(marginVal) || null;

      saveAnalysisBtn.textContent = 'Saving…';
      saveAnalysisBtn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('Save failed');
        const updated = await r.json();
        _loadedProjectData = { ..._loadedProjectData, ...updated };
        // refresh drive distance if address changed
        if (addrVal && addrVal !== prevAddr) {
          document.getElementById('refreshDistanceBtn')?.click();
        }
        window.__analysisDirty = false;
        showAnalysisCard(_loadedProjectData);
        toast('Analysis saved', 'info');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        saveAnalysisBtn.textContent = 'Save';
        saveAnalysisBtn.disabled = false;
      }
    });
  }

  // ======================================================
  // ZOOM HELPERS
  // ======================================================

  function getZoomAnchorPoint(anchor = null){
    if (anchor && typeof anchor.x === 'number' && typeof anchor.y === 'number') {
      return anchor;
    }

    if (zoomAnchor && typeof zoomAnchor.x === 'number' && typeof zoomAnchor.y === 'number') {
      return zoomAnchor;
    }

    const rect = (pdfWrapper || pdfContainer)?.getBoundingClientRect();
    if (rect) {
      return {
        x: rect.width / 2,
        y: rect.height / 2
      };
    }

    return { x: 0, y: 0 };
  }

  async function applyZoom(nextZoom, anchor = null){
    if (!pdfDoc) return;

    const targetAnchor = getZoomAnchorPoint(anchor);
    const worldX = (targetAnchor.x - panOffset.x) / zoom;
    const worldY = (targetAnchor.y - panOffset.y) / zoom;

    zoom = Math.max(0.25, Math.min(5, nextZoom));

    panOffset = {
      x: targetAnchor.x - worldX * zoom,
      y: targetAnchor.y - worldY * zoom
    };

    zoomAnchor = targetAnchor;

    await renderPage();
  }

  async function zoomIn(anchor = null){
    await applyZoom(zoom + 0.1, anchor);
  }

  async function zoomOut(anchor = null){
    await applyZoom(zoom - 0.1, anchor);
  }

  async function zoomReset(){
    if (!pdfDoc) return;
    await applyZoom(1, zoomAnchor);
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

      // prevent zoom while drawing or while a measurement tool is active
      try {
        if (overlay && overlay.active && (overlay.tool === 'measure' || overlay.tool === 'rect')) {
          e.preventDefault();
          return;
        }
        if (overlay && overlay._isDraggingMeasure) {
          e.preventDefault();
          return;
        }
      } catch (err) {}

      e.preventDefault();

      const rect = (pdfWrapper || pdfContainer)?.getBoundingClientRect();
      const anchor = rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;

      if (e.deltaY < 0){
        await zoomIn(anchor);
      } else {
        await zoomOut(anchor);
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

      // do not start panning while measurement tools are active
      if (overlay && overlay.active && (overlay.tool === 'measure' || overlay.tool === 'rect')) return;

      if (overlay && overlay._dragState) return;

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

    if (overlay && overlay._dragState) return;
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

  const changeFileBtn = $('changeFileBtn');
  if (changeFileBtn) {
    changeFileBtn.addEventListener('click', () => {
      const uploadCollapsed = document.getElementById('uploadCollapsed');
      if (dropZone) dropZone.style.display = '';
      if (uploadCollapsed) uploadCollapsed.style.display = 'none';

      const addrInput = document.getElementById('projectAddressInput');
      if (addrInput) addrInput.value = '';
      activeProjectId = null;
      _loadedProjectData = null;
      showNewProjectForm();

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

    if (!window.confirm(`Are you sure you want to upload "${file.name}"?`)) return;

    await handleFile(file);

    try {

      // 1. Create project using filename as project name
      const projectName = file.name.replace(/\.pdf$/i, '').trim() || file.name;
      console.log('[upload] creating project:', projectName);
      const projectRes = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName })
      });
      if (projectRes.status === 409) {
        const openExisting = window.confirm(`A project named "${projectName}" already exists.\n\nWould you like to open the existing project?`);
        if (!openExisting) return;
        const listRes = await fetch(`${API_BASE}/api/projects`, { cache: 'no-store' });
        const listData = await listRes.json();
        const existing = (listData.projects || []).find(p => p.name === projectName);
        if (!existing) { toast('Could not find the existing project.', 'error'); return; }
        const freshRes = await fetch(`${API_BASE}/api/projects/${existing.id}`, { cache: 'no-store' });
        if (!freshRes.ok) { toast('Failed to load existing project.', 'error'); return; }
        const freshData = await freshRes.json();
        const blueprint = (freshData.files || []).find(f => f.file_type === 'blueprint') || freshData.files?.[0];
        if (blueprint) {
          const resp = await fetch(`${API_BASE}/api/projects/${existing.id}/files/${blueprint.id}/download`, { redirect: 'follow' });
          if (resp.ok) {
            const blob = await resp.blob();
            await handleFile(new File([blob], blueprint.filename));
          }
        }
        activeProjectId = existing.id;
        showProjectLoadedCard(freshData, blueprint?.filename || projectName);
        return;
      }
      if (!projectRes.ok) {
        toast('Failed to create project', 'error');
        return;
      }
      const project = await projectRes.json();
      const projectId = project.id;
      activeProjectId = projectId;
      updateProjectDetails(project);
      console.log('[upload] project created:', projectId);

      // 2. Upload blueprint
      const formData = new FormData();
      formData.append('file', file);
      console.log('[upload] sending blueprint to backend...');
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/blueprint`,
        { method: 'POST', body: formData }
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

      renderDrawerSkeleton();
      drawerLoaded = true;
      await refreshDrawer();

      // Switch upload card to the loaded-project view
      try {
        const freshRes = await fetch(`${API_BASE}/api/projects/${projectId}`, { cache: 'no-store' });
        if (freshRes.ok) {
          const freshData = await freshRes.json();
          showProjectLoadedCard(freshData, file.name);
        }
      } catch(_) {}

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

      if (drawRectBtn) drawRectBtn.classList.toggle('active', false);
      if (drawIrregBtn) drawIrregBtn.classList.toggle('active', false);

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

        if (measureToggle) measureToggle.classList.toggle('active', false);
        if (drawIrregBtn) drawIrregBtn.classList.toggle('active', false);

        drawRectBtn.classList.toggle('active', isOn);

        overlay.setActive(isOn);
        overlay.setTool(isOn ? 'rect' : 'area');

        if (pdfContainer) pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      };
    }

    if (drawIrregBtn) {
      drawIrregBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOn = !drawIrregBtn.classList.contains('active');

        if (measureToggle) measureToggle.classList.toggle('active', false);
        if (drawRectBtn) drawRectBtn.classList.toggle('active', false);

        drawIrregBtn.classList.toggle('active', isOn);

        overlay.setActive(isOn);
        overlay.setTool(isOn ? 'irregular' : 'area');

        if (pdfContainer) pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      };
    }

    const toggleSidebarBtn = $('toggleSidebarBtn');
    if (toggleSidebarBtn) {
      toggleSidebarBtn.onclick = () => {
        const sidebar = document.getElementById('measurementSidebar');
        const isHidden = sidebar.style.display === 'none';
        sidebar.style.display = isHidden ? '' : 'none';
        toggleSidebarBtn.classList.toggle('active', isHidden);
      };
    }

  if (changeScaleBtn) {
    changeScaleBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entry = window.prompt('Enter a real-world length (for example: "22 ft 10 in") or a scale expression (for example: "1/16 in = 1 ft").');
      if (!entry || !entry.trim()) return;

      const measurements = highlightsStore.listMeasurements(currentPage) || [];
      const targetMeasurement = [...measurements].reverse().find((m) => m && m.area == null && Array.isArray(m.pts) && m.pts.length);
      const referencePixelLength = targetMeasurement ? getMeasurementPixelLength(targetMeasurement) : 0;
      const referenceLength = referencePixelLength > 0 ? referencePixelLength : 72;
      const scaleFactor = computeScaleFactorFromExpression(entry.trim(), referenceLength, overlay._pxPerPt);
      if (!scaleFactor || scaleFactor <= 0) {
        toast('Invalid scale expression', 'error');
        return;
      }
      highlightsStore.setScale(currentPage, { factor: scaleFactor, unit: 'in' });
      updateLastMeasurementForScale(currentPage, scaleFactor);
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

  // Auto-restore last open project — also callable from outside (soft navigation)
  let _restoring = false;
  async function restoreLastProject() {
    if (_restoring) return;
    _restoring = true;
    const lastId = localStorage.getItem('estimator_last_project_id');
    if (!lastId) { _restoring = false; return; }

    // After Next.js soft navigation, DOM elements are recreated but the JS closure
    // still holds stale references. Reload the page — sessionStorage flag ensures
    // the restore runs correctly after the fresh initApp.
    if (pdfCanvas && !document.contains(pdfCanvas)) {
      window.location.reload();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects/${lastId}`, { cache: 'no-store' });
      if (!res.ok) { localStorage.removeItem('estimator_last_project_id'); return; }
      const projData = await res.json();
      const bp = (projData.files || []).find(f => f.file_type === 'blueprint');
      if (!bp) return;
      const resp = await fetch(`${API_BASE}/api/projects/${projData.id}/files/${bp.id}/download`, { redirect: 'follow' });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const fileObj = new File([blob], bp.filename);
      await handleFile(fileObj);
      activeProjectId = projData.id;
      window.__restoreAnnotations?.(projData.id);
      // Restore page and zoom
      const savedPage = parseInt(localStorage.getItem('estimator_last_page') || '1', 10);
      const savedZoom = parseFloat(localStorage.getItem('estimator_last_zoom') || '1');
      if (pdfDoc && savedPage > 1 && savedPage <= pdfDoc.numPages) {
        currentPage = savedPage;
        zoom = savedZoom || 1;
        await renderPage();
      } else if (savedZoom && savedZoom !== 1) {
        zoom = savedZoom;
        await renderPage();
      }
      window.__showProjectLoadedCard?.(projData, bp.filename);
    } catch (e) {
      console.warn('Failed to restore last project', e);
    } finally {
      _restoring = false;
    }
  }

  window.__restoreLastProject = restoreLastProject;

  // After soft-nav reload, sessionStorage flag persists — run restore from initApp
  // since useEffect fires before this script finishes loading
  if (sessionStorage.getItem('estimator_visited') && localStorage.getItem('estimator_last_project_id')) {
    restoreLastProject();
  }
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