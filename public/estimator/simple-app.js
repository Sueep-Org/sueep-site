document.documentElement.classList.add('__drawer_css_loaded__');
console.log('[drawer] wired v2');

import { API_BASE } from './config.js';
import { listFiles, downloadSas, humanSize, humanDate } from './lib/library.js';
import { toast } from './lib/toast.js';
import { textPrompt } from './lib/textPrompt.js';
import { confirmDialog } from './lib/confirmDialog.js';
import { handlePaywallResponse, showPaywallModal } from './lib/paywallModal.js';
import { isProCompany } from './lib/billingStatus.js';

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

// Per-user overrides for crew wage defaults and default dispatch address
// (see /api/estimator/settings and EstimatorUserSettings in schema.prisma).
// Starts at the same numbers that used to be hardcoded throughout this
// file, so anything read before the fetch below resolves just sees
// today's existing defaults, same as before this endpoint existed.
// cleaner=22, foreman=28, assistant=22, painter=25, project_manager=55
// also replace a handful of one-off literals that used to quietly
// disagree with these (rate:42/47 in the change-order role defs, 220 in a
// few saved-project-load fallbacks, 28.84 for the painting PM rate) --
// those were inconsistencies/bugs, not intentional different defaults.
let _estimatorSettings = {
  cleanerRateCents: 2200,
  foremanRateCents: 2800,
  assistantRateCents: 2200,
  painterRateCents: 2500,
  projectManagerRateCents: 5500,
  officeAddress: '2 Bala Plaza, Bala Cynwyd, PA 19004',
};

function _rate(centsKey) {
  return (_estimatorSettings[centsKey] ?? 0) / 100;
}

fetch('/api/estimator/settings', { credentials: 'include' })
  .then((r) => (r.ok ? r.json() : null))
  .then((data) => {
    if (data) _estimatorSettings = { ..._estimatorSettings, ...data };
  })
  .catch((err) => {
    console.warn('[estimator] could not load user settings, using built-in defaults', err);
  });

function showAppError(msg){

  const n = document.getElementById('appError');

  if(n){
    n.textContent = String(msg);
    n.style.display = 'block';
  }

  console.error(msg);
}

let globalLoadingCount = 0;

function showGlobalLoading(text = 'Loading…'){
  const bar = document.getElementById('globalLoadingBar');
  const textNode = document.getElementById('globalLoadingBarText');
  if (!bar) return;
  globalLoadingCount += 1;
  bar.classList.remove('hidden');
  bar.style.display = 'flex';
  if (textNode) textNode.textContent = String(text);
}

function hideGlobalLoading(){
  globalLoadingCount = Math.max(0, globalLoadingCount - 1);
  if (globalLoadingCount > 0) return;
  const bar = document.getElementById('globalLoadingBar');
  if (!bar) return;
  bar.classList.add('hidden');
  bar.style.display = 'none';
}

function forceHideGlobalLoading(){
  globalLoadingCount = 0;
  const bar = document.getElementById('globalLoadingBar');
  if (!bar) return;
  bar.classList.add('hidden');
  bar.style.display = 'none';
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
      <input id="librarySearch" type="text" placeholder="Search projects…" class="mini-input" />
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
      row.className = 'library-row';
      row.dataset.name = (project.name || '').toLowerCase();

      const nameBtn = document.createElement('button');
      nameBtn.className = 'library-name-btn';
      nameBtn.textContent = project.name;
      nameBtn.title = project.name;
      if (!blueprint) nameBtn.dataset.noFile = '';

      if (blueprint) {
        nameBtn.onclick = async () => {
          showGlobalLoading('Opening project…');
          try {
            const resp = await fetch(`${API_BASE}/api/projects/${project.id}/files/${blueprint.id}/download`, { redirect: 'follow' });
            if (!resp.ok) throw new Error('Download failed');
            const blob = await resp.blob();
            const fileObj = new File([blob], blueprint.filename);
            await window.__handleFile?.(fileObj);
            activeProjectId = project.id;
            try { window.__activeProjectId = activeProjectId; } catch (_) {}
            await window.__restoreAnnotations?.(project.id);
            const freshRes = await fetch(`${API_BASE}/api/projects/${project.id}`, { cache: 'no-store' });
            const freshData = freshRes.ok ? await freshRes.json() : projData;
            window.__showProjectLoadedCard?.(freshData, blueprint.filename);
            closeSidebar();
          } catch(e) {
            toast(e.message, 'error');
          } finally {
            hideGlobalLoading();
          }
        };
      }

      row.appendChild(nameBtn);

      // "More actions" (⋮) — Download + Delete used to be two separate
      // bordered buttons sitting in every row; folded into one dropdown
      // (same .toolbar-dropdown-* pattern as the main toolbar's Export
      // and Detect Walls menus) so each row reads as just a name plus one
      // small control, not a name plus a row of icon buttons.
      const menuWrap = document.createElement('div');
      menuWrap.className = 'toolbar-dropdown';

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'mini-btn icon-btn toolbar-dropdown-btn';
      menuBtn.title = 'More actions';
      menuBtn.setAttribute('aria-label', 'More actions');
      menuBtn.setAttribute('aria-haspopup', 'menu');
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

      const menuPanel = document.createElement('div');
      menuPanel.className = 'toolbar-dropdown-panel toolbar-dropdown-panel--right';
      menuPanel.setAttribute('role', 'menu');
      menuPanel.hidden = true;

      if (blueprint) {
        const downloadItem = document.createElement('a');
        downloadItem.className = 'toolbar-dropdown-item';
        downloadItem.textContent = 'Download';
        downloadItem.href = `${API_BASE}/api/projects/${project.id}/files/${blueprint.id}/download`;
        downloadItem.target = '_blank';
        downloadItem.setAttribute('role', 'menuitem');
        downloadItem.onclick = (e) => {
          e.stopPropagation();
          closeAllLibraryRowMenus();
        };
        menuPanel.appendChild(downloadItem);
      }

      const deleteItem = document.createElement('button');
      deleteItem.type = 'button';
      deleteItem.className = 'toolbar-dropdown-item danger';
      deleteItem.textContent = 'Delete';
      deleteItem.setAttribute('role', 'menuitem');
      deleteItem.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllLibraryRowMenus();
        if (!(await confirmDialog({ title: 'Delete project', message: `Delete project "${project.name}" and all its files?`, confirmLabel: 'Delete', danger: true }))) return;
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
      menuPanel.appendChild(deleteItem);

      menuBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = menuPanel.hidden;
        closeAllLibraryRowMenus();
        menuPanel.hidden = !willOpen;
        menuBtn.setAttribute('aria-expanded', String(willOpen));
      };

      menuWrap.appendChild(menuBtn);
      menuWrap.appendChild(menuPanel);
      row.appendChild(menuWrap);

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

  // Always re-query live, rather than falling back to the module-level
  // `sidebarRoot` captured at script-load time: on a page that doesn't
  // have #sidebarRoot at all (e.g. /estimator/settings, reached via
  // client-side nav after this script already loaded once on /estimator),
  // that stale fallback used to point at a detached DOM node from the
  // earlier page instead of correctly finding nothing, so this silently
  // "succeeded" against an invisible node instead of no-oping.
  const root = document.getElementById('sidebarRoot');
  if (!root) return;

  root.dataset.open = 'true';

  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) toggle.style.display = 'none';

  ensureDrawer();
}

function closeSidebar(){

  const root = document.getElementById('sidebarRoot');
  if (!root) return;

  root.dataset.open = 'false';

  const toggle = document.querySelector('.sidebar-toggle');
  if (toggle) toggle.style.display = '';
}

// Exposed so pages that don't have #sidebarRoot at all (the estimator
// header lives on every /estimator/* route, but the sidebar markup only
// exists on the canvas page itself) can navigate there and then open it,
// instead of a [data-open-sidebar] click just doing nothing. See
// LibraryButton.tsx.
window.__estimatorOpenLibrary = openSidebar;

// Closes any open library row "more actions" menu (see refreshDrawer)
// other than the one currently being opened/interacted with. A single
// shared helper + shared listeners below, rather than each row wiring its
// own document-level click/Escape listener (the way the toolbar's
// Export/Detect Walls dropdowns do via wireDropdownMenu) — library rows
// get torn down and rebuilt on every refreshDrawer() call (search,
// delete, reopening the sidebar), so a listener added per row would never
// get cleaned up and pile up on `document` across refreshes.
function closeAllLibraryRowMenus(){
  document.querySelectorAll('#libraryMount .toolbar-dropdown-panel').forEach((panel) => {
    if (panel.hidden) return;
    panel.hidden = true;
    panel.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (e)=>{

  if(e.target.closest('[data-open-sidebar]')){

    openSidebar();
  }

  if(e.target.closest('[data-close-sidebar]')){

    closeSidebar();
  }

  if (!e.target.closest('#libraryMount .toolbar-dropdown')) {
    closeAllLibraryRowMenus();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllLibraryRowMenus();
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
  const drawSelectBtn = $('drawSelectBtn');
  const undoShapeBtn = $('undoShapeBtn');

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
  // Steps createDimBackgroundToggleBtn/dimBackgroundToggle's click handler
  // cycle through -- declared up here (ahead of createDimBackgroundToggleBtn
  // itself further down) because that button gets created eagerly below,
  // and a const declared after its own first use would throw a
  // temporal-dead-zone ReferenceError at load.
  const DIM_BACKGROUND_STEPS = [
    { key: 'full', label: 'BG: Full', opacity: '1' },
    { key: 'dim', label: 'BG: Dim', opacity: '0.25' },
    { key: 'off', label: 'BG: Off', opacity: '0.03' },
  ];
  let savePdfBtn = $('savePdfBtn') || createSavePdfBtn();
  // The live /erp/estimator page (src/app/erp/(shell)/estimator/page.tsx)
  // hand-codes its own toolbar JSX and has never had this button in its
  // markup, same situation savePdfBtn was already in above. Built here
  // with plain JS for the same reason, so it doesn't depend on editing
  // that React page.
  let detectWallsMenuBtn = $('detectWallsMenuBtn') || createDetectWallsMenu();
  // Visual lock for free companies — a hint before they click, not the
  // gate itself (that's the click handler below, and the proxy's 402
  // underneath that). Async because the plan check is a fetch; the button
  // starts in its normal unlocked-looking state and flips to locked once
  // this resolves, rather than blocking render on it.
  if (detectWallsMenuBtn) {
    isProCompany().then((isPro) => {
      if (isPro || !detectWallsMenuBtn.isConnected) return;
      detectWallsMenuBtn.classList.add('beta-locked');
      detectWallsMenuBtn.title = 'Beta features (wall detection, extracted measurements) are a Pro feature — upgrade to unlock.';
      const badge = detectWallsMenuBtn.querySelector('.beta-badge');
      if (badge) badge.textContent = 'Pro';
    });
  }
  // Small "Vector: N walls" / "Pixel guess: N walls" caption inside the
  // dropdown panel so it's visible at a glance which method actually
  // produced what's on screen for the current page.
  let detectWallsMethodCaption = $('detectWallsMethodCaption');
  let exportMenuBtn = $('exportMenuBtn') || createExportMenu();
  let showLabelsToggle = $('showLabelsToggle') || createShowLabelsToggleBtn();
  let dimBackgroundToggle = $('dimBackgroundToggle') || createDimBackgroundToggleBtn();
  let sovModal = null;
  let _sovRows = [];
  let _pdfMetadataSummary = null;
  // Wall-detect worker's own debug stats (thresholds, filter counts, etc.),
  // keyed by page number — kept only for whichever pages "Detect Walls" has
  // actually been run on this session, purely for the annotations-export
  // debugging aid (see exportPageAnnotations). Not persisted.
  let _wallDetectDebugByPage = {};
  let _pageAggregateOverrides = {};
  let _projectAggregateOverrides = {};
  let _sovUndoStack = [];

  function getPageAggregateStorageKey(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default') {
    return `estimator_page_aggregate_overrides_${projectId}`;
  }

  function persistPageAggregateOverrides() {
    try {
      localStorage.setItem(getPageAggregateStorageKey(), JSON.stringify(_pageAggregateOverrides));
    } catch (_) {}
  }

  function getProjectAggregateStorageKey(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default') {
    return `estimator_project_aggregate_overrides_${projectId}`;
  }

  function getCostPerMileStorageKey(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default', card = 'analysis') {
    return `estimator_${card}_cost_per_mile_${projectId}`;
  }

  function persistCostPerMileValue(value, projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default', card = 'analysis') {
    try {
      const key = getCostPerMileStorageKey(projectId, card);
      if (value === '' || value == null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(value));
      }
    } catch (_) {}
  }

  function restoreCostPerMileValue(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default', card = 'analysis') {
    try {
      const stored = localStorage.getItem(getCostPerMileStorageKey(projectId, card));
      return stored == null ? null : stored;
    } catch (_) {
      return null;
    }
  }

  function persistProjectAggregateOverrides() {
    try {
      localStorage.setItem(getProjectAggregateStorageKey(), JSON.stringify(_projectAggregateOverrides));
    } catch (_) {}
  }

  function restoreProjectAggregateOverrides(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default') {
    try {
      const stored = localStorage.getItem(getProjectAggregateStorageKey(projectId));
      if (!stored) {
        _projectAggregateOverrides = {};
        return;
      }

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') {
        _projectAggregateOverrides = {};
        return;
      }

      const restored = {};
      if (typeof parsed.length === 'number') restored.length = Number(parsed.length);
      if (typeof parsed.area === 'number') restored.area = Number(parsed.area);
      _projectAggregateOverrides = restored;
    } catch (_) {
      _projectAggregateOverrides = {};
    }
  }

  function restorePageAggregateOverrides(projectId = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default') {
    try {
      const stored = localStorage.getItem(getPageAggregateStorageKey(projectId));
      if (!stored) {
        _pageAggregateOverrides = {};
        return;
      }

      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object') {
        _pageAggregateOverrides = {};
        return;
      }

      const restored = {};
      Object.entries(parsed).forEach(([pageKey, value]) => {
        const pageNum = Number(pageKey);
        if (!Number.isFinite(pageNum) || !value || typeof value !== 'object') return;
        const nextValue = {};
        if (typeof value.length === 'number') nextValue.length = Number(value.length);
        if (typeof value.area === 'number') nextValue.area = Number(value.area);
        if (Object.keys(nextValue).length) restored[pageNum] = nextValue;
      });

      _pageAggregateOverrides = restored;
    } catch (_) {
      _pageAggregateOverrides = {};
    }
  }
  let _sovStateProjectId = null;
  let _activeExtractedMeasurementQuery = '';
  let _showExtractedMeasurements = false;
  let _showWallMeasurements = false;
  let _extractedMeasurementHighlightCanvas = null;
  console.log('ZOOM BUTTON CHECK:', {
    zoomInBtn,
    zoomOutBtn,
    zoomResetBtn,
    zoomLabel,
    savePdfBtn
  });

  // Finds the dedicated container page.tsx sets aside for a group of
  // JS-injected toolbar buttons (see #saveToolsGroup/#betaToolsGroup/
  // #viewToolsGroup there) so they render in a predictable spot, grouped
  // into a pill alongside the other toolbar clusters instead of each
  // landing as a bare button loose in the toolbar. Falls back to #toolbar
  // itself when that container doesn't exist — true for the older
  // standalone public/estimator/index.html, which predates this grouping
  // and doesn't have it, so buttons still show up there, just ungrouped.
  function getInjectedToolGroup(groupId) {
    const toolbar = $('toolbar');
    if (!toolbar) return null;
    return document.getElementById(groupId) || toolbar;
  }

  // Not a debug tool like the ones below — a real save action, so it gets
  // its own spot (#saveToolsGroup in page.tsx) styled to stand out (see
  // #savePdfBtn in estimator-ui.css) rather than blending into the muted
  // debug cluster.
  function createSavePdfBtn() {
    const existing = $('savePdfBtn');
    if (existing) return existing;
    const group = getInjectedToolGroup('saveToolsGroup');
    if (!group) return null;
    const btn = document.createElement('button');
    btn.id = 'savePdfBtn';
    btn.className = 'mini-btn';
    btn.textContent = 'Save';
    btn.title = 'Save the current page as a PDF with annotations';
    group.appendChild(btn);
    return btn;
  }

  // Shared open/close wiring for a "button toggles a floating menu panel"
  // control — used by both the Export dropdown and the Detect Walls (beta)
  // dropdown below, so the click/outside-click/Escape behavior only lives
  // in one place. onItemClick receives the clicked .toolbar-dropdown-item
  // element; the caller decides what each item actually does.
  function wireDropdownMenu(btn, panel, onItemClick) {
    if (!btn || !panel) return;

    // #toolbar (this button's container) has overflow-x:auto so the
    // whole toolbar can scroll as one line instead of wrapping to a
    // second one — but setting overflow-x on an element makes the
    // browser compute overflow-y as non-visible too, so this panel
    // (position:absolute in .toolbar-dropdown-panel's default CSS,
    // opening below the button) was getting clipped at #toolbar's own
    // bottom edge instead of floating over the PDF preview underneath it.
    // Switching it to position:fixed with coordinates computed here, at
    // open time, escapes that: fixed positioning isn't confined by an
    // ancestor's overflow unless that ancestor also has a
    // transform/filter/perspective, which #toolbar doesn't. Only these
    // two toolbar dropdowns (Export, Detect Walls) need this — the
    // library row "more actions" menu uses this same panel class but
    // isn't inside an overflow-clipping ancestor, so it's left on the
    // CSS default (position:absolute).
    function positionPanel() {
      const rect = btn.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.top = `${rect.bottom + 6}px`;
      panel.style.left = 'auto';
      panel.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
    }

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const isOpen = !panel.hidden;
      if (isOpen) {
        close();
      } else {
        positionPanel();
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      }
    };

    panel.querySelectorAll('.toolbar-dropdown-item').forEach((item) => {
      item.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        close();
        await onItemClick(item);
      };
    });

    document.addEventListener('click', (e) => {
      if (!panel.hidden && !btn.contains(e.target) && !panel.contains(e.target)) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });

    // Now that it's fixed-positioned, nothing keeps it glued to the
    // button if the page (or the toolbar's own horizontal scroller)
    // moves out from under it — a plain position:absolute panel would've
    // followed automatically. Simplest fix: just close it, same as
    // clicking outside.
    window.addEventListener('scroll', () => { if (!panel.hidden) close(); }, true);
    window.addEventListener('resize', () => { if (!panel.hidden) close(); });
  }

  // Wall detection is experimental — vector data is solid when the
  // backend found it, but the pixel guesser especially can be noisy, so
  // it's marked "BETA" and tucked into its own flask-icon dropdown rather
  // than a full-size button. Grouped in with the rest of the measurement
  // tools (see #betaToolsGroup in page.tsx, nested inside that same
  // .toolbar-group pill) rather than off on its own. Never auto-run on
  // load, only ever from picking an item here (see
  // [[wall-detection-manual-trigger-pref]] in project memory).
  function createDetectWallsMenu() {
    const existing = $('detectWallsMenuBtn');
    if (existing) return existing;
    const group = getInjectedToolGroup('betaToolsGroup');
    if (!group) return null;

    const wrap = document.createElement('div');
    wrap.className = 'toolbar-dropdown';

    const btn = document.createElement('button');
    btn.id = 'detectWallsMenuBtn';
    btn.type = 'button';
    btn.className = 'mini-btn icon-btn toolbar-dropdown-btn';
    btn.title = 'Wall detection (beta) — experimental, accuracy varies. Uses vector wall data when available, otherwise guesses from the page image.';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2v6a2 2 0 0 0 .24.96l5.98 10.95A2 2 0 0 1 18.5 23h-13a2 2 0 0 1-1.74-2.99l5.98-10.95A2 2 0 0 0 10 8V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>
      <span class="beta-badge">Beta</span>
      <svg class="toolbar-dropdown-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    `;

    const panel = document.createElement('div');
    panel.id = 'detectWallsMenuPanel';
    panel.className = 'toolbar-dropdown-panel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    panel.innerHTML = `
      <button type="button" class="toolbar-dropdown-item" data-detect="auto" role="menuitem">Detect walls</button>
      <button type="button" class="toolbar-dropdown-item" data-detect="pixel" role="menuitem">Try pixel instead</button>
      <div id="detectWallsMethodCaption" class="detect-walls-method-caption"></div>
    `;

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    group.appendChild(wrap);
    return btn;
  }

  // Downloads a PNG snapshot of the current page with detected/vector
  // lines, measurements, and polygons drawn on top — plus a burned-in
  // debug caption when wall detection has run for that page this session
  // (see drawWallDetectDebugCaption). Not for end users: this is a
  // debugging aid for eyeballing wall-detection accuracy page by page
  // across iterations, same reasoning as createDetectWallsMenu above for
  // why it's built here rather than in the React page's markup.
  //
  // A single dropdown next to Save rather than two separate buttons
  // ("Export" / "Lines Only") — a custom button + floating menu (see
  // wireDropdownMenu above) instead of a native <select>, which can't be
  // themed to match the rest of the toolbar and renders its option list
  // with whatever the OS/browser feels like that day.
  function createExportMenu() {
    const existing = $('exportMenuBtn');
    if (existing) return existing;
    const group = getInjectedToolGroup('saveToolsGroup');
    if (!group) return null;

    const wrap = document.createElement('div');
    wrap.className = 'toolbar-dropdown';

    const btn = document.createElement('button');
    btn.id = 'exportMenuBtn';
    btn.type = 'button';
    btn.className = 'mini-btn icon-btn toolbar-dropdown-btn';
    btn.title = 'Export this page as an image, or the whole project as a PDF';
    btn.setAttribute('aria-label', 'Export');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
      <svg class="toolbar-dropdown-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    `;

    const panel = document.createElement('div');
    panel.id = 'exportMenuPanel';
    panel.className = 'toolbar-dropdown-panel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    panel.innerHTML = `
      <button type="button" class="toolbar-dropdown-item" data-export="full" role="menuitem">Full page</button>
      <button type="button" class="toolbar-dropdown-item" data-export="lines" role="menuitem">Lines only</button>
      <button type="button" class="toolbar-dropdown-item" data-export="pdf" role="menuitem">Full PDF (with SOV)</button>
    `;

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    group.appendChild(wrap);
    return btn;
  }

  // Toggles the length/area labels ("17 ft", "42 sq") the overlay draws
  // next to every line/shape — on by default, but they sit right on top
  // of the linework, which gets in the way while actively tracing more
  // lines nearby (worst with the live label that follows your cursor
  // while dragging a new measurement). Off just stops drawing them; the
  // underlying measurements/lines and their values are untouched, this is
  // purely a display toggle (see CanvasOverlay.setShowLabels).
  function createShowLabelsToggleBtn() {
    const existing = $('showLabelsToggle');
    if (existing) return existing;
    const group = getInjectedToolGroup('viewToolsGroup');
    if (!group) return null;
    const btn = document.createElement('button');
    btn.id = 'showLabelsToggle';
    btn.className = 'mini-btn active';
    btn.textContent = 'Labels On';
    btn.title = 'Show/hide the length and area labels drawn on lines and shapes';
    group.appendChild(btn);
    return btn;
  }

  // Cycles the background PDF page's opacity (Full -> Dim -> Off -> Full)
  // so already-drawn lines/measurements are easier to see against a busy
  // floor plan without leaving the page or losing your annotations -- the
  // overlay canvas sits above pdfCanvas and is untouched by this, this is
  // purely a display toggle on the source image, same spirit as
  // createShowLabelsToggleBtn above.
  function createDimBackgroundToggleBtn() {
    const existing = $('dimBackgroundToggle');
    if (existing) return existing;
    const group = getInjectedToolGroup('viewToolsGroup');
    if (!group) return null;
    const btn = document.createElement('button');
    btn.id = 'dimBackgroundToggle';
    btn.className = 'mini-btn';
    btn.textContent = DIM_BACKGROUND_STEPS[0].label;
    btn.dataset.dimStep = '0';
    btn.title = 'Dim or hide the floor plan behind your drawn lines, to see your work more clearly';
    group.appendChild(btn);
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

  // Tracks whether the user has deliberately zoomed (buttons, wheel,
  // pinch). Once true, the auto-fit-to-width resize handler below backs
  // off instead of overriding a zoom level they chose on purpose.
  let _userAdjustedZoom = false;

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

  // Expose store and overlay for debugging in the console
  try {
    window.highlightsStore = highlightsStore;
  } catch (_) {}

  const overlay = new CanvasOverlay({
    wrapperEl: pdfWrapper,
    canvasEl: pdfCanvas,
    store: highlightsStore,
    onMeasurementsChanged: () => { updateMeasurementList(); window.__saveAnnotations?.(); },
    onLineMeasurementCreated: (measurement) => {
      if (measurement && typeof measurement === 'object') {
        measurement.wallMeasurementSection = activeWallMeasurementSection || null;
      }
      addMeasurementToActiveWallSection(measurement);
      updateMeasurementList();
      window.__saveAnnotations?.();
    },
    onLineMeasurementRemoved: (measurement) => {
      removeMeasurementFromActiveWallSection(measurement);
      updateMeasurementList();
      window.__saveAnnotations?.();
    },
    // Keeps the Single/Double sided toolbar toggle showing the *selected*
    // measurement's own state (and acting on it) rather than always just
    // the global default for new measurements — see
    // _syncDoubleSideToggleToSelection. Also drives the floating trash
    // button (#selectionActionBar) — no Delete/Backspace key on touch, same
    // reasoning as #chainActionBar for ending a chain — and re-tints the
    // measurements sidebar rows themselves (see selectedIds in
    // updateMeasurementList).
    onSelectionChanged: () => {
      _syncDoubleSideToggleToSelection();
      updateMeasurementList();
      const active = overlay.hasDeletableSelection();
      const bar = document.getElementById('selectionActionBar');
      if (!bar) return;
      bar.classList.toggle('hidden', !active);
      bar.style.display = active ? 'flex' : 'none';
    },
    // Shows/hides the floating Done/Cancel pill (#chainActionBar) for an
    // in-progress measure chain or irregular shape — see hasActiveChain()/
    // finishActiveChain()/cancelActiveChain() in CanvasOverlay.
    onChainStateChanged: (active) => {
      const bar = document.getElementById('chainActionBar');
      if (!bar) return;
      bar.classList.toggle('hidden', !active);
      bar.style.display = active ? 'flex' : 'none';
    }
  });

  overlay.attach();

  try { window.__estimatorOverlay = overlay; } catch (_) {}

  overlay.setActive(false);

  overlay.setTool('area');

  if (undoShapeBtn) {
    undoShapeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlay?.undoLastShapeAction?.()) {
        toast('Shape action undone', 'info');
      } else {
        toast('Nothing to undo', 'info');
      }
    };
    overlay._syncShapeUndoButton?.();
  }

  // Per-project annotation persistence via API (with localStorage fallback).
  // Returns whether the server-side save actually succeeded (the
  // localStorage copy happens either way, as a fallback, but callers like
  // the toolbar Save button want to know if THIS actually round-tripped
  // before telling the user it saved).
  window.__saveAnnotations = async function(extraState = {}) {
    if (!activeProjectId) return false;
    const json = highlightsStore.serialize();
    try { localStorage.setItem(`annotations_${activeProjectId}`, json); } catch(_) {}
    try {
      const payload = {
        annotations: JSON.parse(json),
        ...extraState,
      };
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data) syncLoadedProjectLastEdited(data);
        return true;
      }
      return false;
    } catch(_) {
      return false;
    }
  };
  window.__restoreAnnotations = async function(projectId) {
    console.log('[restore] annotations projectId=', projectId);
    highlightsStore.clearAll();
    let restoredAnnotations = false;
    // Whether this response gave us an analysis payload to cache for the
    // "Detect Walls" button to use on click — NOT whether anything got
    // drawn (that's restoredAnnotations, for actual saved user shapes).
    let cachedVectorAnalysis = false;
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/annotations`, { cache: 'no-store' });
      console.log('[restore] annotations response status=', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[restore] annotation payload', data);
        if (data.annotations) {
          highlightsStore.deserialize(JSON.stringify(data.annotations));
          restoredAnnotations = true;
        }
        if (data.wall_measurements) {
          restoreWallMeasurementSectionValues(data.wall_measurements);
        }
        if (data.vector_annotations || data.analysis) {
          cacheAnalysisResult(data);
          cachedVectorAnalysis = true;
        }
        if (restoredAnnotations || cachedVectorAnalysis) {
          overlay.redraw();
          updateMeasurementList();
          if (!cachedVectorAnalysis) {
            await loadProjectFigureAnalysis(projectId);
          }
          refreshWallDetectMethodCaption();
          return;
        }
      }
    } catch(error) {
      console.warn('[restore] annotations fetch failed', error);
    }

    const json = localStorage.getItem(`annotations_${projectId}`);
    if (json) {
      console.log('[restore] found local annotations, deserializing');
      highlightsStore.deserialize(json);
      overlay.redraw();
      updateMeasurementList();
      if (!cachedVectorAnalysis) {
        console.log('[restore] no cached analysis from annotations, loading figure analysis');
        await loadProjectFigureAnalysis(projectId);
      }
      refreshWallDetectMethodCaption();
      return;
    }

    await loadProjectFigureAnalysis(projectId);
    overlay.redraw();
    updateMeasurementList();
    refreshWallDetectMethodCaption();
  };

  if (downloadPdfBtn) {
    downloadPdfBtn.disabled = true;
    downloadPdfBtn.addEventListener('click', exportCurrentPageWithAnnotations);
  }

  // Persists the project (annotations — measurements/lines/shapes; scale;
  // everything highlightsStore tracks) instead of generating/downloading a
  // PDF, which is what this button used to do (see exportAllPagesWithAnnotations,
  // now moved to the Export dropdown as "Full PDF (with SOV)" instead —
  // this button is "save my work", not "give me a file"). Updates the
  // "Last edited" line via __saveAnnotations -> syncLoadedProjectLastEdited.
  if (savePdfBtn) {
    savePdfBtn.addEventListener('click', async () => {
      if (!activeProjectId) {
        toast('Open or create a project first', 'info');
        return;
      }
      const originalText = savePdfBtn.textContent;
      savePdfBtn.disabled = true;
      savePdfBtn.textContent = 'Saving…';
      try {
        const ok = await window.__saveAnnotations();
        toast(ok ? 'Project saved' : 'Save failed — check your connection', ok ? 'success' : 'error');
      } finally {
        savePdfBtn.disabled = false;
        savePdfBtn.textContent = originalText;
      }
    });
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

  function parseSovAmount(value) {
    if (value == null || value === '') return null;
    const sanitized = String(value).replace(/[^0-9.-]/g, '');
    if (!sanitized) return null;
    const numericValue = Number(sanitized);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function getSovAnalysisPhaseValues() {
    const breakdown = _loadedProjectData?.labor_breakdown;
    if (!breakdown || !Array.isArray(breakdown.phases) || !breakdown.phases.length) {
      return { rough: 0, final: 0, touchup: 0 };
    }

    const rates = {
      cleanerRate: breakdown.cleaner_rate || 0,
      foremanRate: breakdown.foreman_rate || 0,
      overhead: (breakdown.overhead_pct || 0) / 100,
      profit: (breakdown.profit_pct || 0) / 100,
      tax: (breakdown.tax_pct || 0) / 100,
      commission: (breakdown.commission_pct || 0) / 100,
    };

    const values = { rough: 0, final: 0, touchup: 0 };
    breakdown.phases.forEach((phase) => {
      const name = String(phase.name || '').toLowerCase();
      const subtotal = _calcPhase(phase, rates).subtotal;
      if (name.includes('rough')) values.rough = subtotal;
      else if (name.includes('final')) values.final = subtotal;
      else if (name.includes('touch')) values.touchup = subtotal;
    });

    return values;
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

  function normalizeTextLine(value) {
    return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function formatStandardScaleDenominator(denominator) {
    const numeric = Number(denominator);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;

    if (numeric >= 1 && Number.isInteger(numeric)) {
      return `1/${numeric}`;
    }

    const cleaned = Number(numeric.toFixed(4));
    if (!Number.isFinite(cleaned) || cleaned <= 0) return null;

    return `1/${cleaned}`;
  }

  function standardizeScaleExpression(expression = '') {
    const normalized = normalizeTextLine(expression)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;

    const ratioMatch = normalized.match(/^([^=]+?)\s*(?:=|:|to)\s*([^=]+)$/i);
    if (!ratioMatch) return null;

    const leftText = ratioMatch[1].trim();
    const rightText = ratioMatch[2].trim();
    const leftInches = parseMeasurementToInches(leftText);
    const rightInches = parseMeasurementToInches(rightText);
    if (!Number.isFinite(leftInches) || leftInches <= 0 || !Number.isFinite(rightInches) || rightInches <= 0) {
      return null;
    }

    const leftIsFeet = /(?:ft|feet|foot|')/.test(leftText);
    const rightIsFeet = /(?:ft|feet|foot|')/.test(rightText);

    if (!leftIsFeet && !rightIsFeet) {
      const feetPerDrawingInch = (rightInches / leftInches) / 12;
      const denominator = formatStandardScaleDenominator(feetPerDrawingInch);
      return denominator ? `${denominator} in = 1 ft` : null;
    }

    const drawingFeet = leftIsFeet ? leftInches / 12 : leftInches;
    const realFeet = rightIsFeet ? rightInches / 12 : rightInches / 12;
    const feetPerDrawingInch = realFeet / drawingFeet;
    const denominator = formatStandardScaleDenominator(feetPerDrawingInch);
    return denominator ? `${denominator} in = 1 ft` : null;
  }

  function normalizeScaleExpressionCandidate(expression, fallbackText = '') {
    const rawText = normalizeTextLine(expression ?? fallbackText ?? '');
    if (!rawText) return null;

    const compacted = rawText.replace(/\s+/g, ' ').trim();
    if (!compacted) return null;

    const standardized = standardizeScaleExpression(compacted);
    if (standardized) {
      return standardized;
    }

    if (/(?:=|:|to)/.test(compacted) || /(?:in|inch|inches|ft|feet|foot|['"])/.test(compacted)) {
      return compacted;
    }

    const numericMatch = compacted.match(/^([0-9]+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|ft|feet|foot|['"]|')|)?$/i);
    if (!numericMatch?.[1]) return compacted;

    const value = numericMatch[1];
    if (value.includes('/')) {
      return `${value} in = 1 ft`;
    }

    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber) && parsedNumber > 1 && Number.isInteger(parsedNumber)) {
      return `1/${parsedNumber} in = 1 ft`;
    }

    return `${value} in = 1 ft`;
  }

  function extractScaleExpressionFromText(text = '') {
    const normalized = normalizeTextLine(text)
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;

    const compacted = normalized.replace(/\s+/g, ' ').trim();
    const scaleHint = /\b(scale|scaled|scales?|measure|measurement|dimension|dimensions)\b/i.test(compacted);
    const hasRelationship = /(?:=|:|to)/.test(compacted);
    if (!scaleHint && !hasRelationship) return null;

    const directMatch = compacted.match(/((?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?\s*(?:=|:|to)\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?)/i);
    if (directMatch?.[1]) {
      return normalizeScaleExpressionCandidate(directMatch[1], compacted) || directMatch[1].replace(/\s+/g, ' ').trim();
    }

    const withLabelMatch = compacted.match(/\b(scale|scaled|scales?|measure|measurement|dimension|dimensions)\b[^0-9]{0,20}((?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?(?:\s*(?:=|:|to)\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?)?)/i);
    if (withLabelMatch?.[2]) {
      return normalizeScaleExpressionCandidate(withLabelMatch[2], compacted) || withLabelMatch[2].replace(/\s+/g, ' ').trim();
    }

    const ratioMatch = compacted.match(/((?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?\s*(?:=|:|to)\s*(?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?)/i);
    if (ratioMatch?.[1]) {
      return normalizeScaleExpressionCandidate(ratioMatch[1], compacted) || ratioMatch[1].replace(/\s+/g, ' ').trim();
    }

    const fallbackMeasurementMatch = compacted.match(/((?:\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(?:in|inch|inches|"|')|)?(?:\s*(?:ft|feet|foot|"|')|)?)/i);
    if (fallbackMeasurementMatch?.[1] && scaleHint) {
      return normalizeScaleExpressionCandidate(fallbackMeasurementMatch[1], compacted) || fallbackMeasurementMatch[1].replace(/\s+/g, ' ').trim();
    }

    return null;
  }

  function inferScaleInfoFromEntries(entries = []) {
    const seen = new Set();
    const normalizedEntries = (Array.isArray(entries) ? entries : []).map((entry) => normalizeTextLine(entry?.text ?? entry)).filter(Boolean);

    for (let i = 0; i < normalizedEntries.length; i += 1) {
      const currentLine = normalizedEntries[i];
      if (!currentLine) continue;

      const previousLine = normalizedEntries[i - 1] || '';
      const nextLine = normalizedEntries[i + 1] || '';
      const candidateTexts = [
        currentLine,
        [previousLine, currentLine].filter(Boolean).join(' '),
        [currentLine, nextLine].filter(Boolean).join(' '),
        [previousLine, currentLine, nextLine].filter(Boolean).join(' '),
      ];

      for (const candidateText of candidateTexts) {
        if (!candidateText) continue;
        const expression = extractScaleExpressionFromText(candidateText);
        if (!expression) continue;

        const dedupeKey = expression.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const factor = computeScaleFactorFromExpression(expression, 0, 1);
        if (Number.isFinite(factor) && factor > 0) {
          return { expression, factor };
        }

        if (/(?:=|:|to)/.test(candidateText) || /\b(?:scale|scaled|scales?|measure|measurement|dimension|dimensions)\b/i.test(candidateText)) {
          return { expression, factor: null };
        }
      }
    }

    const joinedEntries = normalizedEntries.join(' | ');
    const fullTextExpression = extractScaleExpressionFromText(joinedEntries);
    if (fullTextExpression && !seen.has(fullTextExpression.toLowerCase())) {
      const factor = computeScaleFactorFromExpression(fullTextExpression, 0, 1);
      return {
        expression: fullTextExpression,
        factor: Number.isFinite(factor) && factor > 0 ? factor : null
      };
    }

    return null;
  }

  function compactMeasurementLabel(label = '') {
    const normalized = normalizeTextLine(label)
      .replace(/[:\-–—]/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) return '';

    const genericSummaryPatterns = [
      /\bstatement\b.*\brenovation\b/i,
      /\bthis\b.*\bincludes\b.*\brenovation\b/i,
      /\brenovation\b/i
    ];
    if (genericSummaryPatterns.some((pattern) => pattern.test(normalized))) {
      return 'Renovation';
    }

    const stopWords = new Set([
      'the', 'and', 'of', 'for', 'with', 'to', 'in', 'on', 'from', 'a', 'an',
      'project', 'code', 'summary', 'data', 'section', 'table', 'measurements', 'measurement',
      'statement', 'includes', 'description'
    ]);
    const descriptiveWhitelist = new Set([
      'suite', 'floor', 'ground', 'level', 'main', 'upper', 'lower', 'mezzanine', 'basement',
      'garage', 'deck', 'patio', 'porch', 'yard', 'room', 'hall', 'entry', 'office',
      'storage', 'bath', 'bathroom', 'kitchen', 'living', 'dining', 'bedroom', 'wall',
      'ceiling', 'window', 'door', 'exterior', 'interior', 'front', 'rear', 'side',
      'north', 'south', 'east', 'west', 'total', 'area', 'gross', 'net', 'access', 'restroom',
      'family'
    ]);

    const words = normalized
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => {
        const lower = word.toLowerCase();
        if (stopWords.has(lower) || /^\d+$/.test(lower)) return false;
        if (lower.length <= 2 && !descriptiveWhitelist.has(lower)) return false;
        return true;
      });

    if (!words.length) return '';

    const keepWords = words.length <= 4 ? words : words.slice(0, 4);
    const joined = keepWords.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

    return joined.length > 1 ? joined : '';
  }

  function extractNumberFromText(value) {
    const matches = String(value ?? '').match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g);
    if (!matches || !matches.length) return null;
    const parsed = Number(matches[matches.length - 1].replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isPdfAreaUnitLine(line) {
    return /\b(?:sf|sq\.?\s*ft|sqft|square feet|square footage|area)\b/i.test(line);
  }

  function isFloorLikeLine(line) {
    return /\b(?:floor|level)\b/i.test(line) || /\bsuite\s+level\b/i.test(line) || /^\d+(?:st|nd|rd|th)?\s+(?:floor|level)/i.test(line);
  }

  function groupPdfTextLines(items = [], pageNum = 1, viewport = null) {
    const buckets = [];
    const pageWidth = Number(viewport?.width || 0);
    const pageHeight = Number(viewport?.height || 0);

    for (const item of items) {
      const text = normalizeTextLine(item?.str);
      if (!text) continue;
      const y = Number(item?.transform?.[5] ?? item?.y ?? 0);
      const x = Number(item?.transform?.[4] ?? item?.x ?? 0);
      const bucket = buckets.find((entry) => Math.abs(entry.y - y) <= 4);
      if (bucket) {
        bucket.items.push({ x, y, text });
      } else {
        buckets.push({ y, items: [{ x, y, text }] });
      }
    }

    buckets.sort((a, b) => b.y - a.y);
    return buckets.map((bucket) => {
      const sortedItems = bucket.items.sort((a, b) => a.x - b.x);
      const text = sortedItems.map((entry) => entry.text).join(' ').trim();
      if (!text) return null;

      const minX = Math.min(...sortedItems.map((entry) => entry.x));
      const maxX = Math.max(...sortedItems.map((entry) => entry.x + 40));
      const minY = Math.min(...sortedItems.map((entry) => entry.y));
      const maxY = Math.max(...sortedItems.map((entry) => entry.y + 12));
      const width = Math.max(24, maxX - minX + 8);
      const height = Math.max(12, maxY - minY + 4);
      const normalizedBox = {
        x: pageWidth > 0 ? (minX / pageWidth) : 0,
        y: pageHeight > 0 ? (minY / pageHeight) : 0,
        width: pageWidth > 0 ? (width / pageWidth) : 0,
        height: pageHeight > 0 ? (height / pageHeight) : 0,
        pageWidth,
        pageHeight,
      };

      return {
        text,
        page: pageNum,
        ...normalizedBox,
        sourceItems: sortedItems,
      };
    }).filter(Boolean);
  }

  function looksLikeAddress(text) {
    const clean = normalizeTextLine(text);
    if (!clean) return false;

    const compact = clean
      .replace(/[^\w\s#.,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!compact) return false;
    if (/\b(?:sf|sq\.?\s*ft|square feet|square footage|area|total|gross|building|project|code|summary|table|measurement|measurements)\b/i.test(compact)) return false;
    if (/^\d+(?:st|nd|rd|th)?\s+(?:floor|level|suite|unit|apt|room|building|bldg)\b/i.test(compact)) return false;

    const startsWithStreetNumber = /^#?\d{1,5}(?:\s*[/-]\s*\d{1,5})?(?:\s*[a-z])?/i.test(compact);
    const hasStreetType = /\b(?:st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|ter|terrace|pkwy|parkway|trl|trail|cir|circle|hwy|highway|pl|place|sq|square|loop|row|pike|rte|route|expy|expressway|byp|bypass)\b/i.test(compact);
    const tokenCount = compact.split(/\s+/).filter(Boolean).length;

    return startsWithStreetNumber && hasStreetType && tokenCount <= 12;
  }

  function inferProjectNameFromLines(entries = []) {
    return null;
  }

  function inferAddressFromLines(entries = []) {
    const candidates = [];
    const seen = new Set();

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const line = normalizeTextLine(entry?.text ?? entry);
      if (!line) continue;

      const nextLine = normalizeTextLine(entries[i + 1]?.text ?? entries[i + 1]);
      const nextNextLine = normalizeTextLine(entries[i + 2]?.text ?? entries[i + 2]);
      const candidateTexts = [
        line,
        [line, nextLine].filter(Boolean).join(' '),
        [line, nextLine, nextNextLine].filter(Boolean).join(' '),
      ];

      candidateTexts.forEach((candidateText) => {
        const normalizedCandidate = normalizeTextLine(candidateText);
        if (!normalizedCandidate) return;
        if (seen.has(normalizedCandidate.toLowerCase())) return;
        if (!looksLikeAddress(normalizedCandidate)) return;
        seen.add(normalizedCandidate.toLowerCase());
        candidates.push({ text: normalizedCandidate, page: entry?.page || 1 });
      });
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      if (a.text.length !== b.text.length) return a.text.length - b.text.length;
      return a.page - b.page;
    });

    return candidates[0].text;
  }

  function inferTotalAreaFromLines(entries = []) {
    const candidates = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const line = normalizeTextLine(entry?.text ?? entry);
      if (!line) continue;

      const nextEntry = entries[i + 1];
      const nextLine = normalizeTextLine(nextEntry?.text ?? nextEntry);
      const combined = [line, nextLine].filter(Boolean).join(' ');
      const areaText = /\b(?:total|gross|building|site|area|square|footage|sq|sf)\b/i.test(combined) ? combined : line;
      const numeric = extractNumberFromText(areaText);
      const areaScale = isPdfAreaUnitLine(areaText);
      const hasAreaKeyword = /\b(?:total|gross|building|site|area|square|footage|sq|sf)\b/i.test(areaText);
      const hasTotalHint = /\b(?:total|gross)\b/i.test(areaText);
      const isFloorLine = isFloorLikeLine(areaText);

      if (numeric && areaScale && hasAreaKeyword && hasTotalHint && !isFloorLine) {
        candidates.push({ numeric, page: entry?.page || 1, line: areaText });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.numeric - a.numeric || a.page - b.page);
    return candidates[0].numeric;
  }

  function looksLikeMeasurementSectionHeader(text = '') {
    const normalized = normalizeTextLine(text)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!normalized) return false;

    const hasSectionKeyword = /\b(project|code|building|site|area)\b/.test(normalized);
    const hasTableKeyword = /\b(data|summary|table|section)\b/.test(normalized);
    if (!hasSectionKeyword || !hasTableKeyword) return false;

    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    return wordCount <= 6;
  }

  function findMeasurementTableRanges(entries = []) {
    const ranges = [];

    for (let i = 0; i < entries.length; i += 1) {
      const text = normalizeTextLine(entries[i]?.text ?? entries[i]);
      if (!text || !looksLikeMeasurementSectionHeader(text)) continue;

      let end = i + 1;
      while (end < entries.length) {
        const nextText = normalizeTextLine(entries[end]?.text ?? entries[end]);
        if (!nextText) {
          end += 1;
          continue;
        }

        const isAnotherHeader = looksLikeMeasurementSectionHeader(nextText);
        const looksLikeNewSection = /^[A-Z][A-Za-z0-9&/()\-\s]{2,}$/.test(nextText) && nextText.length <= 40 && !/\d/.test(nextText);
        if (isAnotherHeader || looksLikeNewSection) break;
        end += 1;
      }

      ranges.push({ start: i + 1, end });
    }

    if (ranges.length) return ranges;

    const candidateRows = [];
    for (let i = 0; i < entries.length; i += 1) {
      const line = normalizeTextLine(entries[i]?.text ?? entries[i]);
      if (!line) continue;

      const nextLine = normalizeTextLine(entries[i + 1]?.text ?? entries[i + 1]);
      const combined = [line, nextLine].filter(Boolean).join(' ');
      if (parseTableAreaRow(combined)) {
        candidateRows.push(i);
      }
    }

    if (candidateRows.length < 2) return ranges;

    let currentGroup = [candidateRows[0]];
    for (let i = 1; i < candidateRows.length; i += 1) {
      const prev = candidateRows[i - 1];
      const current = candidateRows[i];
      if (current - prev <= 4) {
        currentGroup.push(current);
      } else {
        if (currentGroup.length >= 2) ranges.push({ start: currentGroup[0], end: currentGroup[currentGroup.length - 1] + 2 });
        currentGroup = [current];
      }
    }

    if (currentGroup.length >= 2) {
      ranges.push({ start: currentGroup[0], end: currentGroup[currentGroup.length - 1] + 2 });
    }

    return ranges;
  }

  function parseTableAreaRow(text = '') {
    const normalized = normalizeTextLine(text);
    if (!normalized) return null;

    const unitMatch = normalized.match(/\b(sf|sq\.?\s*ft|sqft|square feet|square footage)\b/i);
    if (!unitMatch) return null;

    const numericMatch = normalized.match(/((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)(?=\s*(?:sf|sq\.?\s*ft|sqft|square feet|square footage)\b)/i);
    if (!numericMatch) return null;

    const labelText = normalized
      .replace(numericMatch[0], '')
      .replace(unitMatch[0], '')
      .replace(/[:\-–—]/g, ' ')
      .trim();

    const compactLabel = compactMeasurementLabel(labelText);
    const fallbackLabel = compactLabel || (labelText.split(/\s+/).filter(Boolean).length > 1 ? labelText : '');
    const isGenericLabel = /^(total|area|square feet|sq ft|sf|project data|code summary)$/i.test(labelText);

    if (!fallbackLabel && isGenericLabel) {
      return {
        label: 'Total Area',
        value: `${numericMatch[1]} ${unitMatch[1].replace(/\s+/g, ' ').trim()}`
      };
    }

    if (!fallbackLabel) {
      return null;
    }

    return {
      label: fallbackLabel,
      value: `${numericMatch[1]} ${unitMatch[1].replace(/\s+/g, ' ').trim()}`
    };
  }

  function inferSquareFootageRows(entries = []) {
    const rows = [];
    const seen = new Set();

    const addRow = (label, value, page = 1, sourceEntry = null) => {
      const normalizedLabel = normalizeTextLine(label);
      const normalizedValue = normalizeTextLine(value);
      if (!normalizedLabel || !normalizedValue) return;
      const dedupeKey = `${normalizedLabel}|${normalizedValue}|${page}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      rows.push({ label: normalizedLabel, value: normalizedValue, page, sourceEntry });
    };

    const relevantEntries = Array.isArray(entries) ? entries : [];
    const tableRanges = findMeasurementTableRanges(relevantEntries);

    tableRanges.forEach((range) => {
      for (let i = range.start; i < range.end; i += 1) {
        const line = normalizeTextLine(relevantEntries[i]?.text ?? relevantEntries[i]);
        if (!line) continue;

        const nextLine = normalizeTextLine(relevantEntries[i + 1]?.text ?? relevantEntries[i + 1]);
        const combined = [line, nextLine].filter(Boolean).join(' ');
        const parsedRow = parseTableAreaRow(combined);
        if (!parsedRow) continue;

        addRow(parsedRow.label, parsedRow.value, relevantEntries[i]?.page || 1, relevantEntries[i] || null);
      }
    });

    if (!rows.length) {
      for (let i = 0; i < relevantEntries.length; i += 1) {
        const line = normalizeTextLine(relevantEntries[i]?.text ?? relevantEntries[i]);
        if (!line) continue;

        const nextLine = normalizeTextLine(relevantEntries[i + 1]?.text ?? relevantEntries[i + 1]);
        const combined = [line, nextLine].filter(Boolean).join(' ');
        const parsedRow = parseTableAreaRow(combined) || parseTableAreaRow(line);
        if (!parsedRow) continue;

        addRow(parsedRow.label, parsedRow.value, relevantEntries[i]?.page || 1, relevantEntries[i] || null);
      }
    }

    return rows;
  }

  function inferExtractedMeasurements(entries = [], totalArea = null) {
    const rows = inferSquareFootageRows(entries);
    if (Number.isFinite(totalArea) && totalArea > 0) {
      const hasTotalRow = rows.some((row) => /^(total area|total)$/i.test(row.label || ''));
      if (!hasTotalRow) {
        rows.unshift({ label: 'Total Area', value: `${totalArea} SF`, page: 1, sourceEntry: null });
      }
    }
    return rows;
  }

  async function extractPdfMetadataFromFile(file) {
    if (!file || !/\.pdf$/i.test(file.name) || !window.pdfjsLib) {
      return null;
    }

    try {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
      const entries = [];

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const text = await page.getTextContent();
        const pageLines = groupPdfTextLines(text.items || [], pageNum, viewport);
        entries.push(...pageLines);
      }

      if (!entries.length) return null;

      const projectName = inferProjectNameFromLines(entries);
      const address = inferAddressFromLines(entries);
      const totalArea = inferTotalAreaFromLines(entries);
      const extractedMeasurements = inferExtractedMeasurements(entries, totalArea);
      const detectedScale = inferScaleInfoFromEntries(entries);

      return { projectName, address, totalArea, extractedMeasurements, pdfTextEntries: entries, detectedScale };
    } catch (error) {
      console.warn('[pdf metadata] extract failed', error);
      return null;
    }
  }

  function matchesExtractedMeasurementQuery(row = {}, query = '') {
    const normalizedQuery = normalizeTextLine(query).toLowerCase();
    if (!normalizedQuery) return true;
    const haystack = [
      row?.label,
      row?.value,
      row?.page,
      row?.sourceEntry?.text,
      row?.sourceEntry?.sourceItems?.map((entry) => entry.text).join(' '),
      row?.sourceEntry?.sourceText,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedQuery);
  }

  function getExtractedMeasurementHighlightTargets(meta, query = '') {
    const rows = Array.isArray(meta?.extractedMeasurements) ? meta.extractedMeasurements : [];
    const pdfEntries = Array.isArray(meta?.pdfTextEntries) ? meta.pdfTextEntries : [];
    const normalizedQuery = normalizeTextLine(query).toLowerCase();
    const targets = [];

    if (!normalizedQuery) return targets;

    rows.forEach((row) => {
      const haystack = [
        row?.label,
        row?.value,
        row?.page,
        row?.sourceEntry?.text,
        row?.sourceEntry?.sourceItems?.map((entry) => entry.text).join(' '),
      ].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(normalizedQuery)) {
        const sourceEntry = row?.sourceEntry || null;
        if (sourceEntry) {
          targets.push({ ...sourceEntry, row, kind: 'row' });
        }
      }
    });

    if (targets.length) return targets;

    pdfEntries.forEach((entry) => {
      const haystack = [
        entry?.text,
        entry?.sourceItems?.map((item) => item.text).join(' '),
      ].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(normalizedQuery)) {
        targets.push({ ...entry, kind: 'pdf' });
      }
    });

    return targets;
  }

  function redrawExtractedMeasurementHighlights() {
    return;
  }

  function hasTotalSquareFootageMeasurement(rows = []) {
    return rows.some((row) => {
      const label = normalizeTextLine(row?.label || '');
      if (!label) return false;

      return /total\s+area|total\s+square\s+feet/i.test(label);
    });
  }

  function renderExtractedMeasurementRows(container, rows, meta) {
    const list = container.querySelector('[data-extracted-list]');
    const emptyState = container.querySelector('[data-extracted-empty-state]');
    if (!list) return;

    const hasQuery = !!_activeExtractedMeasurementQuery;
    const visibleRows = rows.filter((row) => matchesExtractedMeasurementQuery(row, _activeExtractedMeasurementQuery));
    const showNoTotalSquareFootageMessage = !hasTotalSquareFootageMeasurement(rows);

    if (emptyState) {
      emptyState.innerHTML = showNoTotalSquareFootageMessage
        ? '<div class="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">no total square footage measurement</div>'
        : '';
    }

    list.innerHTML = `
      <div class="space-y-2">
        ${visibleRows.map((row, index) => `
          <div class="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2" data-extracted-row-index="${index}">
            <div class="mt-1 space-y-1">
              <label class="block text-[10px] uppercase tracking-wide text-gray-400">Description</label>
              <input
                type="text"
                class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-green-400"
                data-extracted-field="label"
                data-extracted-index="${index}"
                value="${escapeHtml(row.label || '')}"
              />
              <label class="block text-[10px] uppercase tracking-wide text-gray-400">Measurement</label>
              <input
                type="text"
                class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-green-400"
                data-extracted-field="value"
                data-extracted-index="${index}"
                value="${escapeHtml(row.value || '')}"
              />
            </div>
            ${row.page ? `<div class="mt-1 text-[10px] text-gray-400">p${row.page}</div>` : ''}
          </div>
        `).join('')}
        ${!visibleRows.length && hasQuery ? `<div class="rounded-md border border-dashed border-gray-200 px-2 py-2 text-[11px] text-gray-500">No matches for “${escapeHtml(_activeExtractedMeasurementQuery)}”.</div>` : ''}
      </div>
    `;

    list.querySelectorAll('input[data-extracted-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const index = Number(input.dataset.extractedIndex || 0);
        const field = input.dataset.extractedField;
        const row = rows[index];
        if (!row) return;
        row[field] = input.value;
      });
    });
  }

  let wallMeasurementSectionValues = {
    rooms: { ft: '0', in: '0' },
    hallways: { ft: '0', in: '0' },
    storage: { ft: '0', in: '0' },
    amenities: { ft: '0', in: '0' }
  };
  let wallMeasurementSectionLabels = {
    rooms: 'Rooms',
    hallways: 'Hallways',
    storage: 'Storage',
    amenities: 'Amenities'
  };
  let activeWallMeasurementSection = null;

  function getWallMeasurementSectionValue(section, unit = 'ft') {
    const sectionValues = wallMeasurementSectionValues[section];
    if (sectionValues && typeof sectionValues === 'object') {
      return sectionValues[unit] ?? '';
    }
    return '';
  }

  function getWallMeasurementStorageKey() {
    const projectKey = activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default';
    return `wallMeasurementSectionValues_${projectKey}`;
  }

  function getWallMeasurementStateSnapshot() {
    return {
      values: wallMeasurementSectionValues,
      labels: wallMeasurementSectionLabels
    };
  }

  function persistWallMeasurementSectionValues() {
    const snapshot = getWallMeasurementStateSnapshot();
    try {
      localStorage.setItem(getWallMeasurementStorageKey(), JSON.stringify(snapshot));
    } catch (_) {}
    if (activeProjectId && typeof window.__saveAnnotations === 'function') {
      window.__saveAnnotations({ wall_measurements: snapshot }).catch(() => {});
    }
  }

  function restoreWallMeasurementSectionValues(savedSnapshot = null) {
    try {
      const stored = savedSnapshot || localStorage.getItem(getWallMeasurementStorageKey());
      if (!stored) return;
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      if (!parsed || typeof parsed !== 'object') return;
      const savedValues = parsed.values;
      const savedLabels = parsed.labels;
      if (savedValues && typeof savedValues === 'object') {
        Object.keys(wallMeasurementSectionValues).forEach((section) => {
          const savedSection = savedValues[section];
          if (savedSection && typeof savedSection === 'object') {
            wallMeasurementSectionValues[section] = {
              ...wallMeasurementSectionValues[section],
              ...savedSection
            };
          }
        });
      }
      if (savedLabels && typeof savedLabels === 'object') {
        Object.keys(wallMeasurementSectionLabels).forEach((section) => {
          if (typeof savedLabels[section] === 'string') {
            wallMeasurementSectionLabels[section] = savedLabels[section];
          }
        });
      }
    } catch (_) {}
  }

  function setWallMeasurementSectionValue(section, unit, value) {
    if (section && Object.prototype.hasOwnProperty.call(wallMeasurementSectionValues, section)) {
      const sectionValues = wallMeasurementSectionValues[section];
      if (sectionValues && typeof sectionValues === 'object') {
        sectionValues[unit] = value;
        persistWallMeasurementSectionValues();
      }
    }
  }

  function parseWallMeasurementSectionValue(value) {
    const parsed = Number.parseFloat(String(value ?? '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function syncWallMeasurementSectionInputs(container) {
    container?.querySelectorAll('[data-wall-measurement-section]').forEach((input) => {
      const section = input.dataset.wallMeasurementSection;
      const unit = input.dataset.wallMeasurementUnit || 'ft';
      input.value = getWallMeasurementSectionValue(section, unit);
    });
  }

  function setActiveWallMeasurementSection(section) {
    activeWallMeasurementSection = activeWallMeasurementSection === section ? null : section;
  }

  function addMeasurementToActiveWallSection(measurement) {
    const section = measurement?.wallMeasurementSection || activeWallMeasurementSection;
    if (!section) return;
    const sectionValues = wallMeasurementSectionValues[section];
    if (!sectionValues) return;

    const inches = Number(measurement?.inches || 0);
    const currentTotalInches = parseWallMeasurementSectionValue(sectionValues.ft) * 12 + parseWallMeasurementSectionValue(sectionValues.in);
    const nextTotalInches = currentTotalInches + inches;
    const feet = Math.floor(nextTotalInches / 12);
    const remainingInches = Math.round((nextTotalInches % 12) * 100) / 100;

    sectionValues.ft = String(feet);
    sectionValues.in = String(remainingInches);
    persistWallMeasurementSectionValues();

    const container = document.getElementById('extractedMeasurementsContainer');
    syncWallMeasurementSectionInputs(container);
  }

  function removeMeasurementFromActiveWallSection(measurement) {
    const section = measurement?.wallMeasurementSection || activeWallMeasurementSection;
    if (!section) return;
    const sectionValues = wallMeasurementSectionValues[section];
    if (!sectionValues) return;

    const inches = Number(measurement?.inches || 0);
    const currentTotalInches = parseWallMeasurementSectionValue(sectionValues.ft) * 12 + parseWallMeasurementSectionValue(sectionValues.in);
    const nextTotalInches = Math.max(0, currentTotalInches - inches);
    const feet = Math.floor(nextTotalInches / 12);
    const remainingInches = Math.round((nextTotalInches % 12) * 100) / 100;

    sectionValues.ft = String(feet);
    sectionValues.in = String(remainingInches);
    persistWallMeasurementSectionValues();

    const container = document.getElementById('extractedMeasurementsContainer');
    syncWallMeasurementSectionInputs(container);
  }

  function renderExtractedMeasurements(meta) {
    const container = document.getElementById('extractedMeasurementsContainer');
    if (!container) return;

    restoreWallMeasurementSectionValues();

    const rows = Array.isArray(meta?.extractedMeasurements) ? meta.extractedMeasurements : [];
    const toggleButton = () => {
      _showExtractedMeasurements = !_showExtractedMeasurements;
      renderExtractedMeasurements(meta);
    };
    const toggleWallButton = () => {
      _showWallMeasurements = !_showWallMeasurements;
      renderExtractedMeasurements(meta);
    };

    container.innerHTML = `
      <div class="mb-3">
        <button
          type="button"
          data-extracted-toggle
          aria-expanded="${_showExtractedMeasurements ? 'true' : 'false'}"
          class="w-full rounded border border-green-200 bg-green-50 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-green-600 transition-colors hover:border-green-300 hover:bg-green-100 focus:outline-none"
        >
          Extracted measurements
        </button>
        ${_showExtractedMeasurements ? `
          <div class="mt-2">
            <div class="mb-2">
              <div class="text-xs text-gray-500 mt-1">Detected from the uploaded PDF.</div>
            </div>
            <div class="mb-2" data-extracted-empty-state></div>
            <div class="mb-2">
              <input
                type="search"
                data-extracted-search-input
                value="${escapeHtml(_activeExtractedMeasurementQuery)}"
                placeholder="Search extracted measurements or PDF"
                class="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:outline-none focus:border-green-400"
              />
            </div>
            <div class="max-h-48 overflow-y-auto pr-1" data-extracted-list></div>
          </div>
        ` : ''}
      </div>

      <div class="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2">
        <button
          type="button"
          data-wall-measurements-toggle
          aria-expanded="${_showWallMeasurements ? 'true' : 'false'}"
          class="w-full rounded border border-transparent px-0 py-0 text-left text-[11px] font-semibold uppercase tracking-wide text-green-600 transition-colors hover:border-green-200 hover:text-green-600 focus:outline-none"
        >
          Wall measurements
        </button>
        <div class="mt-1 text-xs text-gray-500">Wall dimensions detected from the uploaded PDF.</div>
        ${_showWallMeasurements ? `
          <div class="mt-2 rounded-md border border-dashed border-gray-200 px-2 py-2 text-[11px] text-gray-500" data-extracted-wall-measurements>
            No wall measurements detected yet.
          </div>
          <div class="mt-2 space-y-2">
            <div class="grid gap-2">
              ${[
                ['rooms', 'Rooms'],
                ['hallways', 'Hallways'],
                ['storage', 'Storage'],
                ['amenities', 'Amenities']
              ].map(([key, label]) => `
                <div>
                  <div class="mb-1">
                    <button
                      type="button"
                      class="w-full rounded border border-transparent px-1 py-0.5 text-left text-[10px] uppercase tracking-wide transition-colors hover:border-green-200 hover:text-green-600 focus:outline-none ${activeWallMeasurementSection === key ? 'text-green-600 font-semibold' : 'text-gray-400'}"
                      data-wall-measurement-button="${key}"
                      data-wall-measurement-label="${key}"
                    >${escapeHtml(wallMeasurementSectionLabels[key] || label)}</button>
                  </div>
                  <div class="flex items-center gap-2">
                    <input
                      type="text"
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-green-400"
                      data-wall-measurement-section="${key}"
                      data-wall-measurement-unit="ft"
                      value="${escapeHtml(getWallMeasurementSectionValue(key, 'ft'))}"
                    />
                    <span class="text-[10px] uppercase tracking-wide text-gray-400">ft</span>
                    <input
                      type="text"
                      class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-green-400"
                      data-wall-measurement-section="${key}"
                      data-wall-measurement-unit="in"
                      value="${escapeHtml(getWallMeasurementSectionValue(key, 'in'))}"
                    />
                    <span class="text-[10px] uppercase tracking-wide text-gray-400">in</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    const toggleBtn = container.querySelector('[data-extracted-toggle]');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleButton);
    }

    const wallToggleBtn = container.querySelector('[data-wall-measurements-toggle]');
    if (wallToggleBtn) {
      wallToggleBtn.addEventListener('click', toggleWallButton);
    }

    if (!_showExtractedMeasurements) {
      container.style.display = 'block';
      return;
    }

    container.style.display = 'block';

    container.querySelectorAll('[data-wall-measurement-section]').forEach((input) => {
      if (input.dataset.boundSection === 'true') return;
      input.dataset.boundSection = 'true';
      input.addEventListener('input', () => {
        setWallMeasurementSectionValue(input.dataset.wallMeasurementSection, input.dataset.wallMeasurementUnit || 'ft', input.value);
      });
    });

    container.querySelectorAll('[data-wall-measurement-button]').forEach((button) => {
      if (button.dataset.boundButton === 'true') return;
      button.dataset.boundButton = 'true';
      button.addEventListener('click', () => {
        const section = button.dataset.wallMeasurementButton;
        if (!section) return;
        setActiveWallMeasurementSection(section);
        const sectionValues = wallMeasurementSectionValues[section];
        if (!sectionValues) return;
        const inputs = container.querySelectorAll(`[data-wall-measurement-section="${section}"]`);
        inputs.forEach((input) => {
          const unit = input.dataset.wallMeasurementUnit || 'ft';
          input.value = sectionValues[unit] ?? '0';
        });
        container.querySelectorAll('[data-wall-measurement-button]').forEach((btn) => {
          const isActive = btn.dataset.wallMeasurementButton === activeWallMeasurementSection;
          btn.classList.toggle('text-green-600', isActive);
          btn.classList.toggle('font-semibold', isActive);
          btn.classList.toggle('text-gray-400', !isActive);
        });
      });
    });

    container.querySelectorAll('[data-wall-measurement-button]').forEach((button) => {
      if (button.dataset.boundLabel === 'true') return;
      button.dataset.boundLabel = 'true';
      button.addEventListener('dblclick', async () => {
        const section = button.dataset.wallMeasurementLabel;
        if (!section) return;
        const nextLabel = await textPrompt({ title: 'Edit section name', defaultValue: wallMeasurementSectionLabels[section] || '' });
        if (nextLabel == null) return;
        const trimmedLabel = nextLabel.trim();
        wallMeasurementSectionLabels[section] = trimmedLabel || 'Untitled';
        button.textContent = wallMeasurementSectionLabels[section];
        persistWallMeasurementSectionValues();
      });
    });

    const searchInput = container.querySelector('[data-extracted-search-input]');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      searchInput.addEventListener('input', (event) => {
        _activeExtractedMeasurementQuery = normalizeTextLine(event.target.value).trim();
        renderExtractedMeasurementRows(container, rows, meta);
      });
    }

    if (searchInput) {
      searchInput.value = _activeExtractedMeasurementQuery;
    }

    renderExtractedMeasurementRows(container, rows, meta);
    renderExtractedWallMeasurements(container);
  }

  function getExtractedWallMeasurementSummary() {
    // Prefer explicit store data (works even if pdfDoc isn't present yet)
    try {
      const all = highlightsStore.listLinesAllPages();
      let totalLines = 0;
      const pages = [];
      for (const entry of all) {
        const count = Array.isArray(entry.lines) ? entry.lines.length : 0;
        if (count > 0) {
          pages.push({ page: Number(entry.page) || 0, count });
          totalLines += count;
        }
      }
      if (totalLines) return { totalLines, pages };
    } catch (e) {
      // ignore and fallback to old behavior
    }

    const pageCount = pdfDoc?.numPages || 0;
    const pages = [];
    let totalLines = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const lines = highlightsStore.getLines(pageNum) || [];
      if (lines.length) {
        pages.push({ page: pageNum, count: lines.length });
        totalLines += lines.length;
      }
    }

    return { totalLines, pages };
  }

  async function renderExtractedWallMeasurements(container) {
    const wallContainer = container.querySelector('[data-extracted-wall-measurements]');
    if (!wallContainer) return;

    const all = highlightsStore.listLinesAllPages() || [];
    let totalLines = 0;
    for (const e of all) totalLines += (Array.isArray(e.lines) ? e.lines.length : 0);

    // If no lines in the in-memory store, fall back to the last fetched analysis (if any)
    if (!totalLines) {
      const analysis = window.__lastFetchedAnalysis || null;
      const fallbackPages = [];
      if (analysis && Array.isArray(analysis.pages)) {
        for (let i = 0; i < analysis.pages.length; i += 1) {
          const p = analysis.pages[i] || {};
          const lines = getVectorPayloadLines(p) || [];
          fallbackPages.push({ page: i + 1, lines });
        }
      } else if (analysis && typeof analysis === 'object') {
        // pages could be object keyed by page number
        const pagesObj = analysis.pages || analysis.vector_annotations || analysis;
        if (pagesObj && typeof pagesObj === 'object') {
          const keys = Array.isArray(pagesObj) ? pagesObj.map((_, idx) => String(idx + 1)) : Object.keys(pagesObj);
          for (const k of keys) {
            const p = pagesObj[k] || {};
            const lines = getVectorPayloadLines(p) || [];
            fallbackPages.push({ page: Number(k) || (fallbackPages.length + 1), lines });
          }
        }
      }

      const fallbackTotal = fallbackPages.reduce((s, it) => s + (Array.isArray(it.lines) ? it.lines.length : 0), 0);
      if (!fallbackTotal) {
        wallContainer.textContent = 'No wall measurements detected yet.';
        return;
      }
      // render fallback pages below by reusing existing rows rendering logic
      parts = [];
      parts = [];
      parts.push(`<div class="text-[11px] text-gray-700"><strong>${fallbackTotal}</strong> wall measurement ${fallbackTotal === 1 ? 'line' : 'lines'} detected (from analysis).</div>`);
      for (const entry of fallbackPages) {
        const pageNum = Number(entry.page) || 1;
        const lines = Array.isArray(entry.lines) ? entry.lines : [];
        if (!lines.length) continue;
        const rows = lines.map((ln, i) => `<div class="rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">p${pageNum} — line ${i+1}: ${escapeHtml(JSON.stringify(ln))}</div>`);
        parts.push(`<div class="mt-2"><div class="text-[10px] text-gray-500 mb-1">Page p${pageNum} — ${lines.length} line${lines.length===1?'':'s'}</div>${rows.join('')}</div>`);
      }
      wallContainer.innerHTML = `<div class="space-y-2 text-[11px]">${parts.join('')}</div>`;
      return;
    }

    const parts = [];
    parts.push(`<div class="text-[11px] text-gray-700"><strong>${totalLines}</strong> wall measurement ${totalLines === 1 ? 'line' : 'lines'} detected.</div>`);

    for (const entry of all) {
      const pageNum = Number(entry.page) || 1;
      const lines = Array.isArray(entry.lines) ? entry.lines : [];
      if (!lines.length) continue;

      let pageViewport = null;
      try {
        if (pdfDoc) pageViewport = await pdfDoc.getPage(pageNum).then(p => p.getViewport({ scale: 1 }));
      } catch (_) { pageViewport = null; }
      const pageW = pageViewport?.width || (pdfCanvas?.width || 0);
      const pageH = pageViewport?.height || (pdfCanvas?.height || 0);

      const rows = [];
      for (let i = 0; i < lines.length; i += 1) {
        const ln = lines[i] || {};
        const x1 = Number(ln.x1 ?? ln.x ?? 0);
        const y1 = Number(ln.y1 ?? ln.y ?? 0);
        const x2 = Number(ln.x2 ?? ln.x ?? 0);
        const y2 = Number(ln.y2 ?? ln.y ?? 0);

        const dx = ((x2 - x1) * pageW) || 0;
        const dy = ((y2 - y1) * pageH) || 0;
        const pxLen = Math.hypot(dx, dy) || 0;

        const scale = highlightsStore.getScale(pageNum) || null;
        let human = '';
        if (scale && Number(scale.factor)) {
          const inches = (pxLen / (overlay._pxPerPt || 1)) * Number(scale.factor);
          human = formatInches(inches);
        } else {
          const inches = ((pxLen / (overlay._pxPerPt || 1)) / 72) || 0;
          human = `${inches.toFixed(2)} in`;
        }

        rows.push(`<div class="rounded-md border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">p${pageNum} — line ${i+1}: <strong>${escapeHtml(human)}</strong></div>`);
      }

      parts.push(`<div class="mt-2"><div class="text-[10px] text-gray-500 mb-1">Page p${pageNum} — ${lines.length} line${lines.length===1?'':'s'}</div>${rows.join('')}</div>`);
    }

    wallContainer.innerHTML = `<div class="space-y-2 text-[11px]">${parts.join('')}</div>`;
  }

  function getVectorPayloadLines(pageData = {}) {
    if (Array.isArray(pageData)) return pageData;

    const candidates = [
      pageData.lines,
      pageData.lineData,
      pageData.vectorLines,
      pageData.vector_lines,
      pageData.wallLines,
      pageData.walls,
      pageData.vector,
      pageData.pageLines,
      pageData.vector_annotations,
      pageData.annotations,
      pageData.shapes,
      pageData.path || pageData.paths,
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
      if (candidate && typeof candidate === 'object') {
        const nested = getVectorPayloadLines(candidate);
        if (Array.isArray(nested) && nested.length) return nested;
      }
    }

    // Fallback: pick the first array of objects that look like lines
    for (const key of Object.keys(pageData || {})) {
      const value = pageData[key];
      if (!Array.isArray(value)) continue;
      if (value.length && value.every((item) => item && typeof item === 'object' && ('x1' in item || 'x2' in item || 'start' in item || 'points' in item))) {
        return value;
      }
    }

    return [];
  }

  function coerceLineCoordinates(rawLine = {}, pageWidth = 0, pageHeight = 0) {
    // start/end can arrive as {x,y} objects (most producers) or as [x,y]
    // coordinate pairs -- that's what the vector backend's analyze_vector_text
    // emits ({"start": [x,y], "end": [x,y]}). Without the array fallbacks
    // here, rawLine.start?.x on an array is undefined and every line
    // silently collapses to (0,0)-(0,0).
    const x1 = Number(rawLine.x1 ?? rawLine.x ?? rawLine.startX ?? rawLine.start?.x ?? rawLine.start?.[0] ?? rawLine.pt1?.x ?? rawLine.points?.[0]?.x ?? 0);
    const y1 = Number(rawLine.y1 ?? rawLine.y ?? rawLine.startY ?? rawLine.start?.y ?? rawLine.start?.[1] ?? rawLine.pt1?.y ?? rawLine.points?.[0]?.y ?? 0);
    const x2 = Number(rawLine.x2 ?? rawLine.x ?? rawLine.endX ?? rawLine.end?.x ?? rawLine.end?.[0] ?? rawLine.pt2?.x ?? rawLine.points?.[1]?.x ?? rawLine.points?.[2]?.x ?? 0);
    const y2 = Number(rawLine.y2 ?? rawLine.y ?? rawLine.endY ?? rawLine.end?.y ?? rawLine.end?.[1] ?? rawLine.pt2?.y ?? rawLine.points?.[1]?.y ?? rawLine.points?.[2]?.y ?? 0);

    const normalize = (value, dimension) => {
      if (!Number.isFinite(value)) return 0;
      if (dimension > 0 && value > 1) return value / dimension;
      return value;
    };

    return {
      id: rawLine.id || rawLine.__id || rawLine.lineId || rawLine.uuid || `${Math.random().toString(36).slice(2, 9)}`,
      x1: normalize(x1, pageWidth),
      y1: normalize(y1, pageHeight),
      x2: normalize(x2, pageWidth),
      y2: normalize(y2, pageHeight)
    };
  }

  // Runs the offline wall-finder worker (lib/walls/wallWorker.js) against
  // the current page. For a raw image upload there's only ever one
  // resolution to work with, so it reads straight off pdfCanvas. For a PDF
  // page, it deliberately re-renders at a fixed, higher resolution instead
  // of reusing whatever's on screen: thin wall lines get anti-aliased into
  // near-nothing at a small on-screen zoom (23%, say), which starves the
  // detector before it even runs, independent of anything the algorithm
  // itself is doing right or wrong.
  const WALL_DETECT_TARGET_LONG_SIDE = 2200;

  async function detectWallsFromImage() {
    let worker;
    const finish = () => {
      try { worker?.terminate(); } catch (_) {}
    };

    try {
      let width, height, imageData;

      if (pdfDoc) {
        const page = await pdfDoc.getPage(currentPage);
        const baseViewport = page.getViewport({ scale: 1 });
        const longSide = Math.max(baseViewport.width, baseViewport.height);
        const detectScale = Math.max(1, WALL_DETECT_TARGET_LONG_SIDE / longSide);
        const vp = page.getViewport({ scale: detectScale });

        const off = document.createElement('canvas');
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        await page.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise;

        width = off.width;
        height = off.height;
        imageData = off.getContext('2d').getImageData(0, 0, width, height);
      } else {
        width = pdfCanvas.width;
        height = pdfCanvas.height;
        if (!width || !height) return;
        imageData = pdfCanvas.getContext('2d').getImageData(0, 0, width, height);
      }

      await new Promise((resolve) => {
        try {
          // ?v= below: the worker is fetched as its own file, separately
          // from the ?v= cache-bust on simple-app.js itself. Bump this
          // alongside changes to wallWorker.js or the browser can keep
          // running an old cached copy indefinitely, same trap simple-app.js
          // already needed ESTIMATOR_ASSET_VERSION for.
          worker = new Worker(new URL('./lib/walls/wallWorker.js?v=11', import.meta.url), { type: 'module' });

          worker.onmessage = (e) => {
            const msg = e.data || {};
            if (msg.type !== 'walls') return;

            console.log('[wall-detect] result', {
              segments: (msg.segments || []).length,
              debug: msg.debug,
              error: msg.error,
            });
            _wallDetectDebugByPage[currentPage || 1] = msg.debug || null;

            try {
              const segments = Array.isArray(msg.segments) ? msg.segments : [];
              if (segments.length) {
                const normalized = segments.map((seg) => coerceLineCoordinates(seg, width, height));
                highlightsStore.setLines(currentPage || 1, normalized);
                overlay.redraw();
                updateVectorLineInfo();
                updateMeasurementList();
                toast(
                  `Guessed ${normalized.length} wall${normalized.length === 1 ? '' : 's'} from the image — check them against the plan`,
                  'info'
                );
              } else {
                toast('No straight walls found automatically on this image — trace manually below', 'info');
              }
            } catch (err) {
              console.warn('wall detection hydration failed', err);
            } finally {
              finish();
              resolve();
            }
          };

          worker.onerror = (err) => {
            console.warn('wall detection worker failed', err);
            finish();
            resolve();
          };

          worker.postMessage(
            { type: 'build', width, height, data: imageData.data.buffer },
            [imageData.data.buffer]
          );
        } catch (err) {
          console.warn('wall detection setup failed', err);
          finish();
          resolve();
        }
      });
    } catch (err) {
      console.warn('wall detection setup failed', err);
      finish();
    }
  }

  // Renders one page (the source PDF page, or the raw uploaded image when
  // there's no pdfDoc) plus everything the overlay draws on top of it —
  // detected/vector wall lines, measurements, polygons — flattened onto a
  // single canvas. Doesn't touch renderPageWithAnnotationsToCanvas above:
  // that one's PDF-only and shared by the multi-page PDF export flow, this
  // is specifically for the single-page debug image below and needs to
  // work for a plain image upload too, which has no PDF page to re-render.
  //
  // includeSource: false skips drawing the plan itself (PDF page / image)
  // entirely and just fills a plain white background before the overlay —
  // for comparing detected-line positions run to run without the floor
  // plan underneath competing for attention or shifting focus/zoom between
  // screenshots.
  async function renderAnnotatedPageToCanvas(pageNum, { includeSource = true } = {}) {
    let width, height;
    if (pdfDoc) {
      if (includeSource) {
        const rendered = await renderPageWithAnnotationsToCanvas(pageNum);
        return rendered ? rendered.exportCanvas : null;
      }
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      width = Math.ceil(viewport.width);
      height = Math.ceil(viewport.height);
    } else {
      if (!pdfCanvas || !pdfCanvas.width || !pdfCanvas.height) return null;
      width = pdfCanvas.width;
      height = pdfCanvas.height;
      if (includeSource) {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = width;
        exportCanvas.height = height;
        const ctx = exportCanvas.getContext('2d');
        ctx.drawImage(pdfCanvas, 0, 0);
        overlay.renderToContext(ctx, { width, height });
        return exportCanvas;
      }
    }

    // includeSource === false, either case above falls through to here —
    // same overlay-state save/swap/restore dance renderPageWithAnnotationsToCanvas
    // does, just against a blank canvas instead of a rendered page.
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const ctx = exportCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const prevPage = overlay.currentPage;
    const prevActive = overlay.active;
    const prevMeasurePreview = overlay._measurePreview;
    const prevIrregularPreview = overlay._irregularPreview;
    const prevHoverPoly = overlay.hoverPoly;
    overlay.currentPage = pageNum;
    overlay.active = false;
    overlay._measurePreview = null;
    overlay._irregularPreview = null;
    overlay.hoverPoly = null;

    overlay.renderToContext(ctx, { width, height });

    overlay.currentPage = prevPage;
    overlay.active = prevActive;
    overlay._measurePreview = prevMeasurePreview;
    overlay._irregularPreview = prevIrregularPreview;
    overlay.hoverPoly = prevHoverPoly;

    return exportCanvas;
  }

  // Draws a small dark caption box in the top-left with the wall-detect
  // worker's own debug stats — see the call site for why this rides along
  // in the image itself instead of a separate file.
  function drawWallDetectDebugCaption(ctx, canvasWidth, debug) {
    const fs = debug.filterStats || {};
    const lines = [
      `Detect Walls debug — ${new Date().toLocaleString()}`,
      `kept ${fs.kept ?? '?'}  ·  filtered: stub ${fs.stub ?? 0}, curved ${fs.notStraight ?? 0}, too short ${fs.tooShort ?? 0}, title block ${fs.excludedTitleBlock ?? 0}`,
      `minLen ${debug.minLenPx ?? '?'}px  ·  threshold ${debug.binThreshold ?? '?'} (otsu ${debug.otsuThreshold ?? '?'})  ·  downsample ${debug.downsampleScale ?? '?'}x`,
    ];

    ctx.save();
    ctx.font = '13px monospace';
    const padding = 8;
    const lineHeight = 17;
    const boxWidth = Math.min(canvasWidth - 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2);
    const boxHeight = lines.length * lineHeight + padding * 2;

    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.fillRect(8, 8, boxWidth, boxHeight);

    ctx.fillStyle = '#f8fafc';
    lines.forEach((line, i) => {
      ctx.fillText(line, 8 + padding, 8 + padding + lineHeight * (i + 0.8));
    });
    ctx.restore();
  }

  // Downloads a PNG of one page with detected walls (and any other
  // annotations) drawn on top, for eyeballing wall-detection accuracy
  // page by page — e.g. saving one before and one after a wallWorker.js
  // change to compare side by side. PNG rather than JPEG: this is thin
  // linework, and JPEG's lossy compression visibly blurs/ghosts thin lines
  // in a way that defeats the point of a debugging image.
  //
  // includeSource: false leaves the floor plan out entirely (see
  // renderAnnotatedPageToCanvas) — just the lines on white, for comparing
  // detected-line positions between runs without the plan itself pulling
  // focus or shifting between screenshots.
  async function exportPageAnnotations(pageNum, { includeSource = true } = {}) {
    const page = pageNum || currentPage || 1;
    const canvas = await renderAnnotatedPageToCanvas(page, { includeSource });
    if (!canvas) throw new Error('Nothing loaded to export for this page.');

    // When "Detect Walls" has been run on this page this session, burn its
    // own debug stats into a corner of the image — segment count, the
    // thresholds it used, how many candidate runs got filtered and why.
    // Point of the export is judging detection accuracy over time, and
    // having those numbers travel with the image (not a separate file to
    // keep matched up) makes a run-to-run comparison much easier to reason
    // about than the picture alone.
    const debug = _wallDetectDebugByPage[page];
    if (debug) drawWallDetectDebugCaption(canvas.getContext('2d'), canvas.width, debug);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to render the page image.');

    const projectPart = activeProjectId ? `${activeProjectId}-` : '';
    const suffix = includeSource ? '' : '-linesonly';
    await downloadBlob(blob, `annotations-${projectPart}page${page}${suffix}-${Date.now()}.png`);
    toast(`Exported page ${page} as an image${includeSource ? '' : ' (lines only)'}`, 'success');
  }

  function getVectorPageEntries(result) {
    const source = result.analysis || result.result || result;
    const pages = Array.isArray(source.pages)
      ? source.pages
      : source.pages || source.vector_annotations || source;
    return Array.isArray(pages)
      ? pages.map((value, idx) => ({ page: idx + 1, data: value }))
      : Object.keys(pages || {}).map((key) => ({ page: Number(key), data: pages[key] }));
  }

  // Pure extraction: given a raw analysis payload (backend /figures
  // response) and a page number, returns that page's normalized wall lines
  // (or [] if the backend found none for it / the page isn't in the
  // payload). No side effects — doesn't touch highlightsStore or redraw.
  // Split out of the old auto-hydrating hydrateDetectedWallsFromResult so
  // the "Detect Walls" click handler (runWallDetection) can pull just the
  // current page on demand instead of every page drawing itself the moment
  // analysis arrives.
  async function getVectorLinesForPage(result, pageNum) {
    if (!result) return [];
    const entry = getVectorPageEntries(result).find((e) => Number(e.page || 1) === Number(pageNum));
    if (!entry) return [];
    const pageData = entry.data || {};
    const lines = getVectorPayloadLines(pageData);
    if (!Array.isArray(lines) || !lines.length) return [];

    // The backend's line coordinates are in the PDF's fixed native point
    // space (page.rect, sent per-page as size_points) -- NOT the on-screen
    // pdf.js viewport. Normalizing against a zoomed viewport instead
    // scatters every line across the page depending on whatever zoom level
    // happened to be active. size_points is the divisor the backend
    // actually intends.
    const [sizePointsWidth, sizePointsHeight] = Array.isArray(pageData.size_points) ? pageData.size_points : [];
    let pageWidth = Number(sizePointsWidth) || 0;
    let pageHeight = Number(sizePointsHeight) || 0;
    if (!pageWidth || !pageHeight) {
      // Fallback for payloads without size_points (e.g. non-vector
      // producers). scale: 1 matches native point space -- scale: zoom
      // here would reintroduce the same bug for this fallback path.
      const pageViewport = pdfDoc
        ? await pdfDoc.getPage(pageNum).then((page) => page.getViewport({ scale: 1 })).catch(() => null)
        : null;
      pageWidth = pageWidth || pageViewport?.width || pdfCanvas?.width || 0;
      pageHeight = pageHeight || pageViewport?.height || pdfCanvas?.height || 0;
    }
    return lines.map((line) => coerceLineCoordinates(line, pageWidth, pageHeight));
  }

  // Analysis results (vector lines + page metadata) fetched automatically
  // in the background are only ever cached here — NOT drawn. Populating
  // highlightsStore with wall lines is entirely gated behind a
  // "Detect Walls" click now (see runWallDetection); nothing should draw
  // walls on a page just because analysis happened to finish loading. See
  // [[wall-detection-manual-trigger-pref]] in project memory.
  function cacheAnalysisResult(result) {
    if (!result) return;
    try { window.__lastFetchedAnalysis = result; } catch (_) {}

    // Extracted-measurements text panel is a separate feature from wall
    // line drawing (it lists dimension text, not canvas overlay lines), so
    // it's fine for this to stay automatic — it already has its own
    // fallback to window.__lastFetchedAnalysis when highlightsStore is
    // empty, so it renders something useful even before any click.
    const extractedContainer = document.getElementById('extractedMeasurementsContainer');
    if (extractedContainer) {
      renderExtractedWallMeasurements(extractedContainer);
    }
    if (_pdfMetadataSummary) {
      renderExtractedMeasurements(_pdfMetadataSummary);
    }
  }

  // Per-page record of which method last produced the walls shown, purely
  // for the caption next to the buttons — not persisted across reloads.
  let _wallDetectMethodByPage = {};

  function refreshWallDetectMethodCaption() {
    if (!detectWallsMethodCaption) return;
    const info = _wallDetectMethodByPage[currentPage || 1];
    if (!info) { detectWallsMethodCaption.textContent = ''; return; }
    const label = info.method === 'vector' ? 'Vector' : 'Pixel guess';
    detectWallsMethodCaption.textContent = `${label}: ${info.count} wall${info.count === 1 ? '' : 's'}`;
  }

  // Orchestrates the Detect Walls (beta) dropdown: vector-first, pixel
  // fallback — see [[wall-detection-manual-trigger-pref]]. forcePixel is
  // set by the "Try pixel instead" menu item, which bypasses the vector
  // lookup entirely so the two methods can be compared by eye even when
  // vector data exists for the page.
  async function runWallDetection({ forcePixel = false } = {}) {
    const pageNum = currentPage || 1;
    if (!forcePixel) {
      const vectorLines = await getVectorLinesForPage(window.__lastFetchedAnalysis, pageNum);
      if (vectorLines.length) {
        highlightsStore.setLines(pageNum, vectorLines);
        overlay.redraw();
        updateVectorLineInfo();
        updateMeasurementList();
        _wallDetectMethodByPage[pageNum] = { method: 'vector', count: vectorLines.length };
        refreshWallDetectMethodCaption();
        toast(
          `Loaded ${vectorLines.length} vector wall line${vectorLines.length === 1 ? '' : 's'} for this page`,
          'info'
        );
        return;
      }
    }
    // No vector data for this page (or pixel explicitly requested) — fall
    // back to the pixel-based guesser. detectWallsFromImage already writes
    // to highlightsStore, redraws, and toasts its own result.
    await detectWallsFromImage();
    _wallDetectMethodByPage[pageNum] = { method: 'pixel', count: (highlightsStore.getLines(pageNum) || []).length };
    refreshWallDetectMethodCaption();
  }

  async function fetchProjectFigures(projectId, options = {}) {
    const retries = Number(options.retries ?? 30);
    const delayMs = Number(options.delayMs ?? 1500);
    console.log('[figures] start fetchProjectFigures projectId=', projectId, 'retries=', retries);

    let lastData = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        const res = await fetch(`${API_BASE}/api/projects/${projectId}/figures`, { cache: 'no-store' });
        console.log('[figures] attempt', attempt + 1, 'status=', res.status);
        // Beta features are locked outright for free companies (not just
        // capped), so this is a hard block, not a "not ready yet" — no
        // point burning the retry loop's 30 attempts / ~45s on something
        // that will never turn ready. No paywall modal here on purpose:
        // this function is called automatically in the background (project
        // load, right after every upload, see callers above) — popping a
        // full-screen modal on a passive fetch nobody asked for is exactly
        // the bug this comment used to cause (a stuck-looking gray
        // backdrop blocking pan/zoom on the canvas underneath it). The
        // modal belongs on deliberate user actions only, like the Detect
        // Walls button, which already gates itself before calling this.
        if (res.status === 402) return null;
        if (!res.ok) {
          console.warn('[figures] unexpected status', res.status);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        const data = await res.json();
        console.log('[figures] attempt', attempt + 1, 'payload=', data);
        const analysisPayload = data.analysis || data.result || data;
        if (analysisPayload) {
          lastData = { ...data, analysis: analysisPayload };
        }
        if (data.status === 'ready' || data.status === 'failed') {
          return data;
        }
        if (data.status === 'analyzing') {
          if (analysisPayload) {
            console.log('[figures] analyzing state includes partial analysis, returning partial payload');
            return lastData;
          }
          console.warn('[figures] analyzing state has no analysis payload yet');
        }
      } catch (e) {
        console.warn('[figures] fetch failed', e);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (lastData) {
      console.warn('[figures] retries exhausted, returning last available analysis payload');
    }
    return lastData;
  }

  function summarizeAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object') return 'no analysis';
    const pages = Array.isArray(analysis.pages) ? analysis.pages : analysis.pages || analysis.vector_annotations || analysis;
    const pageEntries = Array.isArray(pages)
      ? pages.map((value, idx) => ({ page: idx + 1, data: value }))
      : Object.keys(pages || {}).map((key) => ({ page: Number(key) || 0, data: pages[key] }));
    const summary = pageEntries.map((entry) => {
      const lines = getVectorPayloadLines(entry.data);
      return `p${entry.page}: ${Array.isArray(lines) ? lines.length : 0}`;
    });
    return `pages=${summary.length} [${summary.join(', ')}]`;
  }

  async function loadProjectFigureAnalysis(projectId) {
    console.log('[analysis] loadProjectFigureAnalysis projectId=', projectId);
    const figures = await fetchProjectFigures(projectId, { retries: 6, delayMs: 1000 });
    if (!figures) {
      console.warn('[analysis] no figures returned');
      return null;
    }
    window.__lastFetchedFigures = figures;
    const analysisPayload = figures.analysis || figures.result || figures;
    console.log('[analysis] fetched figures', figures?.status, summarizeAnalysis(analysisPayload), figures);
    if (analysisPayload) {
      // Caches for the "Detect Walls" button to use on click — does not
      // draw anything. See cacheAnalysisResult.
      cacheAnalysisResult(analysisPayload);
    }
    refreshWallDetectMethodCaption();
    return figures;
  }

  async function patchProjectDetails(projectId, payload) {
    if (!projectId) return null;
    try {
      const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        console.warn('[project patch] failed', response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.warn('[project patch] exception', error);
      return null;
    }
  }

  function getDefaultSovManualOverrides() {
    return { rough: false, final: false, touchup: false, quote: false };
  }

  function getSovColumns() {
    const breakdownPhases = Array.isArray(_loadedProjectData?.labor_breakdown?.phases)
      ? _loadedProjectData.labor_breakdown.phases
      : [];
    const phaseNames = breakdownPhases.map((phase) => String(phase?.name || '').toLowerCase());
    const hasDefinedPhases = phaseNames.length > 0;

    const includeRough = !_deletedPhaseIds.has('rough') && (!hasDefinedPhases || phaseNames.some((name) => name.includes('rough')));
    const includeFinal = !_deletedPhaseIds.has('final') && (!hasDefinedPhases || phaseNames.some((name) => name.includes('final')));
    const includeTouchup = !_deletedPhaseIds.has('touchup') && (!hasDefinedPhases || phaseNames.some((name) => name.includes('touch')));

    return [
      { key: 'page', label: 'Page' },
      { key: 'description', label: 'Description' },
      ...(includeRough ? [{ key: 'rough', label: 'Rough' }] : []),
      ...(includeFinal ? [{ key: 'final', label: 'Final' }] : []),
      ...(includeTouchup ? [{ key: 'touchup', label: 'Touch up' }] : []),
      { key: 'quote', label: 'Quote' },
    ];
  }

  function isZeroSovAmount(value) {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return true;

    const normalized = rawValue.replace(/[$,%\s]/g, '');
    if (!normalized) return true;

    const numericValue = Number(normalized);
    return Number.isFinite(numericValue) && numericValue <= 0;
  }

  function hasVisibleSovRow(row) {
    return Boolean(row?.forceVisible) || ['rough', 'final', 'touchup', 'quote'].some((key) => !isZeroSovAmount(row?.[key]));
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
    const pageAggregateAreas = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      pageAggregateAreas.push(getPageAggregateTotals(pageNum).area);
    }
    const totalArea = pageAggregateAreas.reduce((sum, value) => sum + Number(value || 0), 0);
    const finalPrice = getSovFinalPrice();
    const phaseValues = getSovAnalysisPhaseValues();

    const rows = [];
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageArea = pageAggregateAreas[pageNum - 1] || 0;
      const percentShare = totalArea > 0 ? (pageArea / totalArea) : 0;
      const percent = totalArea > 0 ? percentShare * 100 : 0;
      const quoteValue = finalPrice != null && totalArea > 0 ? percentShare * finalPrice : null;
      const roughValue = phaseValues.rough != null && totalArea > 0 ? percentShare * phaseValues.rough : null;
      const finalValue = phaseValues.final != null && totalArea > 0 ? percentShare * phaseValues.final : null;
      const touchupValue = phaseValues.touchup != null && totalArea > 0 ? percentShare * phaseValues.touchup : null;
      rows.push({
        page: pageNum,
        description: `Page ${pageNum}`,
        rough: roughValue,
        final: finalValue,
        touchup: touchupValue,
        quote: quoteValue,
      });
    }

    if (!_sovRows.length) {
      _sovRows = rows.map((row) => ({ ...row, deleted: false, forceVisible: false, manualOverrides: getDefaultSovManualOverrides() }));
      persistSovState();
      return _sovRows.filter((row) => !row.deleted);
    }

    const existingByPage = new Map(_sovRows.map((row) => [row.page, row]));
    const syncedRows = rows.map((row) => {
      const existing = existingByPage.get(row.page);
      const manualOverrides = existing?.manualOverrides || getDefaultSovManualOverrides();
      return {
        page: row.page,
        description: existing?.description ?? row.description,
        rough: manualOverrides.rough ? existing?.rough : row.rough,
        final: manualOverrides.final ? existing?.final : row.final,
        touchup: manualOverrides.touchup ? existing?.touchup : row.touchup,
        quote: manualOverrides.quote ? existing?.quote : row.quote,
        deleted: existing?.deleted ?? false,
        forceVisible: existing?.forceVisible ?? false,
        manualOverrides,
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
      rough: 0,
      final: 0,
      touchup: 0,
      quote: 0,
      deleted: false,
      forceVisible: true,
      manualOverrides: getDefaultSovManualOverrides(),
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
        target.rough = lastAction.row.rough;
        target.final = lastAction.row.final;
        target.touchup = lastAction.row.touchup;
        target.quote = lastAction.row.quote;
        target.forceVisible = true;
        target.manualOverrides = lastAction.row.manualOverrides || getDefaultSovManualOverrides();
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
    const visibleRows = rows.filter((row) => hasVisibleSovRow(row));
    containerEl.innerHTML = '';

    if (!visibleRows.length) {
      containerEl.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px;border:1px dashed #e5e7eb;border-radius:10px;">No schedule data available yet.</div>';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sov-table-wrapper';

    const table = document.createElement('table');
    table.className = 'sov-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const columns = getSovColumns();
    columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column.label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    visibleRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = columns.map((column) => {
        switch (column.key) {
          case 'page':
            return `
              <td>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="mini-btn icon-btn danger" data-delete-sov-row="${row.page}" title="Delete row" aria-label="Delete row">${TRASH_ICON_SVG}</button>
                  <span>${escapeHtml(row.page)}</span>
                </div>
              </td>
            `;
          case 'description':
            return `
              <td>
                <input type="text" class="mini-input" value="${escapeHtml(row.description)}" data-sov-description="${row.page}" style="width:100%;" />
              </td>
            `;
          default:
            return `
              <td>
                <input type="text" class="mini-input" value="${escapeHtml(formatSovCurrency(row[column.key]))}" data-sov-amount="${row.page}" data-sov-key="${column.key}" style="width:110px;" />
              </td>
            `;
        }
      }).join('');

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

      tr.querySelectorAll('[data-sov-amount]').forEach((amountInput) => {
        const key = amountInput.getAttribute('data-sov-key');
        const saveAmount = (value) => {
          const storedRow = _sovRows.find((entry) => entry.page === row.page);
          if (storedRow) {
            storedRow[key] = parseSovAmount(value);
            storedRow.forceVisible = true;
            storedRow.manualOverrides = {
              ...(storedRow.manualOverrides || getDefaultSovManualOverrides()),
              [key]: true,
            };
            persistSovState();
          }
        };
        amountInput.addEventListener('input', (event) => saveAmount(event.target.value));
        amountInput.addEventListener('change', (event) => saveAmount(event.target.value));
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    wrapper.appendChild(table);
    containerEl.appendChild(wrapper);
  }

  // NOTE: this no longer touches #sovCard's own display — that panel now
  // lives inside #changeOrderSovTabCard (see page.tsx) and is shown/hidden
  // solely by _setChangeOrderSovTab, same as #changeOrderCard. This just
  // populates #sovTableContainer; if there's no project loaded it's
  // cleared to empty (the tab card itself is hidden at that point anyway,
  // by the same code that hides #estimatorTabCard).
  function renderSovCard() {
    const container = document.getElementById('sovTableContainer');
    const undoBtn = document.getElementById('undoSovRowBtn');
    const addBtn = document.getElementById('addSovRowBtn');
    if (!container) return;

    if (!pdfDoc || !_loadedProjectData) {
      container.innerHTML = '';
      return;
    }

    const rows = getSovPageRows();
    const visibleRows = rows.filter((row) => hasVisibleSovRow(row));
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
  // The pdf.js render task currently in flight, if any — lets a newer
  // renderPage() call cancel a superseded one instead of letting it run
  // to completion (expensive full-page rasterization) only to be thrown
  // away by the __renderSeq check. See renderPage().
  let _activeRenderTask = null;

  // ======================================================
  // OVERLAY ALIGNMENT
  // ======================================================

  // Keeps panOffset from ever sliding the page far enough to expose blank
  // container background on an edge it doesn't need to — the "weird
  // bounding that shows up when I move around" bug. #pdfWrapper sits
  // flex-centered in #pdfContainer at rest (panOffset 0,0); on either
  // axis where the wrapper is no bigger than the container, there's
  // nothing legitimate to pan into, so that axis is locked at 0. Where
  // the wrapper IS bigger (zoomed in past the box, or just a page taller
  // than the fixed 600px height), panning is capped at exactly the point
  // where the wrapper's own edge reaches the container's edge — beyond
  // that there's nothing left to reveal but blank, so the container stays
  // fully covered by content the whole time it's able to be.
  function clampPanOffset(offset){
    if (!pdfContainer || !pdfWrapper) return offset;

    const containerWidth = pdfContainer.clientWidth;
    const containerHeight = pdfContainer.clientHeight;
    const wrapperWidth = pdfWrapper.offsetWidth;
    const wrapperHeight = pdfWrapper.offsetHeight;

    const maxX = Math.max(0, (wrapperWidth - containerWidth) / 2);
    const maxY = Math.max(0, (wrapperHeight - containerHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y))
    };
  }

  function syncOverlayTransform(){

    // Mutate the shared panOffset itself (not just a local copy) so the
    // next drag's delta math (dragStart = clientX - panOffset.x, etc.)
    // starts from the clamped value — otherwise the first move after
    // hitting a bound would jump by however far past it the raw drag had
    // gone.
    panOffset = clampPanOffset(panOffset);

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
      vectorLineInfo.textContent = `Vector: ${lines.length}`;
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
      const columns = getSovColumns();
      const columnXPositions = {
        page: marginX,
        description: marginX + 72,
        rough: marginX + 220,
        final: marginX + 300,
        touchup: marginX + 380,
        quote: marginX + 460,
      };

      sovPage.drawText('Schedule of Values', {
        x: marginX,
        y: startY,
        size: 18,
        font: boldFont,
        color: rgb(0, 0, 0)
      });

      columns.forEach((column) => {
        const x = columnXPositions[column.key] ?? (marginX + 220 + 80 * (columns.indexOf(column) - 2));
        sovPage.drawText(column.label, {
          x,
          y: startY - 32,
          size: 12,
          font: boldFont,
          color: rgb(0, 0, 0)
        });
      });

      let currentY = startY - 56;
      rows.forEach((row) => {
        columns.forEach((column) => {
          const x = columnXPositions[column.key] ?? (marginX + 220 + 80 * (columns.indexOf(column) - 2));
          const textValue = column.key === 'page'
            ? String(row.page)
            : column.key === 'description'
              ? String(row.description)
              : String(formatSovCurrency(row[column.key]));
          sovPage.drawText(textValue, {
            x,
            y: currentY,
            size: 11,
            font: regularFont,
            color: rgb(0, 0, 0)
          });
        });
        currentY -= 18;
      });
    }

    const pdfBytes = await outPdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    await downloadBlob(blob, `annotated-${Date.now()}.pdf`);
  }

  // Called from the Export dropdown ("Full PDF (with SOV)") — moved here
  // from the toolbar's Save button, which now just persists the project
  // (see __saveAnnotations) instead of generating a file. The caller
  // (wireDropdownMenu callback below) already disables exportMenuBtn for
  // the duration; that button is icon-only (no text to swap to "Saving…"
  // the way savePdfBtn used to), so this toasts instead for feedback on
  // an operation that can take a few seconds.
  async function exportAllPagesWithAnnotations(){
    if (!pdfDoc) return;
    toast('Generating PDF…', 'info');

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
      const sovColumns = getSovColumns();
      const columnXPositions = {
        page: 40,
        description: 100,
        rough: 220,
        final: 300,
        touchup: 380,
        quote: 460,
      };
      doc.addPage([sovPageWidth, sovPageHeight]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Schedule of Values', 40, 48);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      sovColumns.forEach((column) => {
        const x = columnXPositions[column.key] ?? (220 + 80 * (sovColumns.indexOf(column) - 2));
        doc.text(column.label, x, 78);
      });
      doc.setLineWidth(0.5);
      doc.line(40, 84, sovPageWidth - 40, 84);

      let nextY = 104;
      sovRows.forEach((row) => {
        sovColumns.forEach((column) => {
          const x = columnXPositions[column.key] ?? (220 + 80 * (sovColumns.indexOf(column) - 2));
          const textValue = column.key === 'page'
            ? String(row.page)
            : column.key === 'description'
              ? String(row.description)
              : String(formatSovCurrency(row[column.key]));
          doc.text(textValue, x, nextY);
        });
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
    }
  }

  function getPageAggregateTotals(pageNum) {
    const measurements = highlightsStore.listMeasurements(pageNum) || [];
    const lineMeasurements = measurements.filter((item) => item.area == null);
    const areaMeasurements = measurements.filter((item) => item.area != null);
    const computedPageTotalInches = lineMeasurements.reduce((sum, item) => sum + (Number(item.inches) || 0), 0);
    const computedPageTotalArea = areaMeasurements.reduce((sum, item) => sum + (Number(item.area) || 0), 0);
    const override = _pageAggregateOverrides[pageNum] || {};
    return {
      length: override.length != null ? Number(override.length) : computedPageTotalInches,
      area: override.area != null ? Number(override.area) : computedPageTotalArea
    };
  }

  function getVisibleScaleInfo(pageNum) {
    const storedScale = highlightsStore.getScale(pageNum);
    if (storedScale?.expression || storedScale?.display || storedScale?.label || storedScale?.factor) {
      return storedScale;
    }

    if (_pdfMetadataSummary?.detectedScale?.expression) {
      return {
        factor: _pdfMetadataSummary.detectedScale.factor || null,
        unit: 'in',
        expression: _pdfMetadataSummary.detectedScale.expression,
        display: _pdfMetadataSummary.detectedScale.expression
      };
    }

    return null;
  }

  function updateMeasurementList(){
    restoreProjectAggregateOverrides(activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default');

    const pageToDisplay = Number.isFinite(measurementViewPage) ? measurementViewPage : currentPage;

    // Get measurements for the viewed page (not current PDF page)
    const measurements = highlightsStore.listMeasurements(pageToDisplay) || [];
    const scale = getVisibleScaleInfo(pageToDisplay);
    
    // Update scale info based on viewed page
    if (measurementScaleInfo) {
      const scaleLabel = scale?.expression || scale?.display || scale?.label;
      if (scaleLabel) {
        measurementScaleInfo.textContent = `Scale: ${scaleLabel}`;
      } else if (scale && scale.factor) {
        const pointsPerInch = 1 / scale.factor;
        measurementScaleInfo.textContent = `Scale set: 1 in = ${pointsPerInch.toFixed(1)} pt`;
      } else {
        measurementScaleInfo.textContent = 'Scale not set';
      }
    }

    // Update page label
    if (measurementPageLabel) {
      measurementPageLabel.textContent = `Page ${pageToDisplay}`;
    }

    // Split measurements into line (length) and area measurements
    const lineMeasurements = measurements.filter(m => m.area == null);
    const areaMeasurements = measurements.filter(m => m.area != null);

    // Left column: line measurements
    if (measurementListLeft) {
      if (!lineMeasurements.length) {
        measurementListLeft.innerHTML = 'No measurements';
      } else {
        // Tints whichever row(s) match the current canvas selection (single
        // click or box-select) — same green the canvas itself highlights a
        // selected measurement with, so the list and the drawing agree.
        const selectedIds = overlay.getSelectedMeasurementIds();
        measurementListLeft.innerHTML = lineMeasurements.map(m => {
          const label = m.label || `${(m.inches || 0).toFixed(1)} in`;
          const badge = m.doubleSided ? ' <span style="color:#0284c7;font-weight:600;">(2x)</span>' : '';
          const tint = selectedIds.has(m.id) ? 'background:rgba(22,163,74,0.14);border-radius:6px;' : '';
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;${tint}">
              <span style="font-size:11px;">${label}${badge}</span>
              <button class="mini-btn" data-measurement-id="${m.id}" style="padding:2px 4px;min-width:auto;font-size:10px;">X</button>
            </div>
          `;
        }).join('');
        measurementListLeft.querySelectorAll('button[data-measurement-id]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.dataset.measurementId;
            const targetMeasurement = (highlightsStore.listMeasurements(pageToDisplay) || []).find((m) => m.id === id);
            if (targetMeasurement && targetMeasurement.area == null) {
              removeMeasurementFromActiveWallSection(targetMeasurement);
            }
            highlightsStore.removeMeasurement(pageToDisplay, id);
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
        const selectedAreaIds = overlay.getSelectedMeasurementIds();
        measurementListRight.innerHTML = areaMeasurements.map(m => {
          const label = m.areaLabel || `${(m.area || 0).toFixed(2)} sq`;
          const tint = selectedAreaIds.has(m.id) ? 'background:rgba(22,163,74,0.14);border-radius:6px;' : '';
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;${tint}">
              <span style="font-size:11px;">${label}</span>
              <button class="mini-btn" data-measurement-id="${m.id}" style="padding:2px 4px;min-width:auto;font-size:10px;">X</button>
            </div>
          `;
        }).join('');
        measurementListRight.querySelectorAll('button[data-measurement-id]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.dataset.measurementId;
            const targetMeasurement = (highlightsStore.listMeasurements(pageToDisplay) || []).find((m) => m.id === id);
            if (targetMeasurement && targetMeasurement.area == null) {
              removeMeasurementFromActiveWallSection(targetMeasurement);
            }
            highlightsStore.removeMeasurement(pageToDisplay, id);
            updateMeasurementList();
            overlay.redraw();
            toast('Measurement removed', 'info');
          };
        });
      }
    }

    // Page totals: include both length and area
    const aggregateTotals = getPageAggregateTotals(pageToDisplay);
    const pageTotalInches = aggregateTotals.length;
    const pageTotalArea = aggregateTotals.area;

    // Project totals: sum of all page-level totals, using overrides when present
    const allPageMeasurementEntries = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const pageNumbers = Array.from(new Set([
      ...allPageMeasurementEntries.map((entry) => Number(entry.page)).filter(Number.isFinite),
      ...Object.keys(_pageAggregateOverrides).map((pageKey) => Number(pageKey)).filter(Number.isFinite)
    ])).sort((a, b) => a - b);
    const computedProjectTotalInches = pageNumbers.reduce((sum, pageNum) => sum + (getPageAggregateTotals(pageNum).length || 0), 0);
    const computedProjectTotalArea = pageNumbers.reduce((sum, pageNum) => sum + (getPageAggregateTotals(pageNum).area || 0), 0);
    const projectTotalInches = _projectAggregateOverrides.length != null ? Number(_projectAggregateOverrides.length) : computedProjectTotalInches;
    const projectTotalArea = _projectAggregateOverrides.area != null ? Number(_projectAggregateOverrides.area) : computedProjectTotalArea;

    if (measurementPageAggregateInfo) {
      measurementPageAggregateInfo.innerHTML = `
        <div style="display:inline-flex;align-items:center;gap:2px;flex-wrap:nowrap;white-space:nowrap;">
          <span style="font-size:11px;">Page ${pageToDisplay} total:</span>
          <div style="display:inline-flex;align-items:center;gap:1px;">
            <input type="text" inputmode="text" spellcheck="false" value="${escapeHtml(formatInches(pageTotalInches))}" data-aggregate-kind="length" style="width:66px;font-size:10px;padding:1px 3px;min-width:0;" />
            <div style="display:flex;flex-direction:column;gap:1px;">
              <button type="button" data-aggregate-step="up" style="font-size:8px;line-height:1;padding:1px 2px;">▲</button>
              <button type="button" data-aggregate-step="down" style="font-size:8px;line-height:1;padding:1px 2px;">▼</button>
            </div>
          </div>
          <span style="margin-left:1px;font-size:11px;">Area:</span>
          <input type="number" step="0.01" inputmode="decimal" value="${escapeHtml(pageTotalArea)}" data-aggregate-kind="area" style="width:54px;font-size:10px;padding:1px 3px;min-width:0;" />
          <span style="font-size:11px;line-height:1;">sq</span>
        </div>
      `;
      measurementPageAggregateInfo.querySelectorAll('input[data-aggregate-kind], button[data-aggregate-step]').forEach((control) => {
        if (control.tagName === 'BUTTON') {
          control.onclick = (event) => {
            event.preventDefault();
            const lengthInput = measurementPageAggregateInfo?.querySelector('input[data-aggregate-kind="length"]');
            if (!lengthInput) return;
            const currentValue = parseMeasurementToInches(lengthInput.value) ?? Number(lengthInput.value);
            if (!Number.isFinite(currentValue) || currentValue < 0) {
              lengthInput.value = formatInches(pageTotalInches);
              return;
            }
            const nextValue = control.dataset.aggregateStep === 'up' ? currentValue + 1 : Math.max(0, currentValue - 1);
            lengthInput.value = formatInches(nextValue);
            lengthInput.dispatchEvent(new Event('change', { bubbles: true }));
          };
          return;
        }

        control.onchange = () => {
          const parsedValue = control.dataset.aggregateKind === 'length'
            ? (parseMeasurementToInches(control.value) ?? Number(control.value))
            : Number(control.value);
          if (!Number.isFinite(parsedValue) || parsedValue < 0) {
            toast('Please enter a valid non-negative value', 'error');
            updateMeasurementList();
            return;
          }

          const pageTotalDisplay = measurementPageAggregateInfo?.querySelector('input[data-aggregate-kind="length"]');
          const pageAreaDisplay = measurementPageAggregateInfo?.querySelector('input[data-aggregate-kind="area"]');
          if (control.dataset.aggregateKind === 'length') {
            _pageAggregateOverrides[pageToDisplay] = {
              ...( _pageAggregateOverrides[pageToDisplay] || {}),
              length: parsedValue
            };
            if (pageTotalDisplay) pageTotalDisplay.value = formatInches(parsedValue);
            if (pageAreaDisplay) pageAreaDisplay.value = pageAreaDisplay.value ?? pageTotalArea;
          } else {
            _pageAggregateOverrides[pageToDisplay] = {
              ...( _pageAggregateOverrides[pageToDisplay] || {}),
              area: parsedValue
            };
            if (pageAreaDisplay) pageAreaDisplay.value = parsedValue;
            if (pageTotalDisplay) pageTotalDisplay.value = pageTotalDisplay.value ?? formatInches(pageTotalInches);
          }

          persistPageAggregateOverrides();
          updateMeasurementList();
          overlay.redraw();
          toast('Page total updated', 'info');
        };
        control.onkeydown = (event) => {
          if (event.key === 'Enter') control.blur();
        };
      });
    }
    if (measurementTotalAggregateInfo) {
      measurementTotalAggregateInfo.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px;">
          <div style="font-size:11px;color:#6b7280;">Project total</div>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;white-space:nowrap;">
            <span style="font-size:11px;">Length:</span>
            <input type="text" inputmode="text" spellcheck="false" value="${escapeHtml(formatInches(projectTotalInches))}" data-project-aggregate-kind="length" style="width:74px;font-size:10px;padding:1px 3px;min-width:0;" />
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:nowrap;white-space:nowrap;">
            <span style="font-size:11px;">Area:</span>
            <input type="number" step="0.01" inputmode="decimal" value="${escapeHtml(projectTotalArea.toFixed(2))}" data-project-aggregate-kind="area" style="width:60px;font-size:10px;padding:1px 3px;min-width:0;" />
            <span style="font-size:11px;">sq</span>
          </div>
        </div>
      `;
      measurementTotalAggregateInfo.querySelectorAll('input[data-project-aggregate-kind]').forEach((control) => {
        control.onchange = () => {
          const parsedValue = control.dataset.projectAggregateKind === 'length'
            ? (parseMeasurementToInches(control.value) ?? Number(control.value))
            : Number(control.value);
          if (!Number.isFinite(parsedValue) || parsedValue < 0) {
            toast('Please enter a valid non-negative value', 'error');
            updateMeasurementList();
            return;
          }

          if (control.dataset.projectAggregateKind === 'length') {
            _projectAggregateOverrides.length = parsedValue;
          } else {
            _projectAggregateOverrides.area = parsedValue;
          }
          persistProjectAggregateOverrides();
          updateMeasurementList();
          overlay.redraw();
          toast('Project total updated', 'info');
        };
        control.onkeydown = (event) => {
          if (event.key === 'Enter') control.blur();
        };
      });
    }

    renderSovCard();
  }

  // ======================================================
  // RENDER PAGE
  // ======================================================

  async function renderPage(){

    if(!pdfDoc) return;

    sessionStorage.setItem('estimator_last_page', currentPage);
    sessionStorage.setItem('estimator_last_zoom', zoom);

    const seq = ++__renderSeq;

    // A render from an earlier zoom/pan/page-change step is still in
    // flight — it's about to be superseded by this one anyway (see the
    // seq check below), so cancel it now rather than let pdf.js finish
    // rasterizing the whole page just to throw the result away. Standard
    // pdf.js API; its promise rejects (RenderingCancelledException),
    // caught where that render's own await is, below.
    if (_activeRenderTask) {
      try { _activeRenderTask.cancel(); } catch (err) {}
    }

    const page = await pdfDoc.getPage(currentPage);

    const vp = page.getViewport({
      scale: zoom
    });

    const sc = document.createElement('canvas');

    sc.width = vp.width;
    sc.height = vp.height;

    const renderTask = page.render({
      canvasContext: sc.getContext('2d'),
      viewport: vp
    });
    _activeRenderTask = renderTask;

    try {
      await renderTask.promise;
    } catch (err) {
      // Cancelled by a newer renderPage() call above, or any other render
      // failure — either way, nothing more to do with this pass.
      if (_activeRenderTask === renderTask) _activeRenderTask = null;
      return;
    }
    if (_activeRenderTask === renderTask) _activeRenderTask = null;

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
    redrawExtractedMeasurementHighlights();

    syncOverlayTransform();

    updateZoomLabel();
    // update page UI
    if (pageInfo) pageInfo.textContent = `${currentPage} of ${pdfDoc.numPages}`;
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
    restorePageAggregateOverrides(activeProjectId || sessionStorage.getItem('estimator_last_project_id') || 'default');
    updateVectorLineInfo();
    updateMeasurementList();
    refreshWallDetectMethodCaption();
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
    const quotedUnitMatch = str.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(["'])$/i);
    if (quotedUnitMatch) {
      const numericValue = parseNumericValue(quotedUnitMatch[1]);
      if (numericValue == null) return null;
      return quotedUnitMatch[2] === "'" ? numericValue * 12 : numericValue;
    }
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
    highlightsStore.clearAll();
    _pdfMetadataSummary = null;

    showGlobalLoading('Loading file…');
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
        document.getElementById('pageInfo').textContent = '1 of 1';

        // Scanned/photographed plans have no vector data to read, so wall
        // guessing runs from the pixels instead, on demand via the button
        // below, not automatically on every upload.
        refreshWallDetectMethodCaption();
      } else {
        const ab = await file.arrayBuffer();
        const lib = window.pdfjsLib;
        pdfDoc = await lib.getDocument({ data: ab }).promise;
        currentPage = 1;
        measurementViewPage = 1;
        zoom = 1;
        panOffset = { x: 0, y: 0 };
        _userAdjustedZoom = false;
        await renderPage();
        _pdfMetadataSummary = await extractPdfMetadataFromFile(file);

        renderExtractedMeasurements(_pdfMetadataSummary);
      }

      if (downloadPdfBtn) {
        downloadPdfBtn.disabled = false;
      }
      if (savePdfBtn) {
        savePdfBtn.disabled = false;
      }

      if (_pdfMetadataSummary?.detectedScale) {
        const detectedScale = _pdfMetadataSummary.detectedScale;
        const nextScale = {
          factor: detectedScale.factor || null,
          unit: 'in',
          expression: detectedScale.expression || null,
          display: detectedScale.expression || null
        };
        if (nextScale.factor || nextScale.expression) {
          highlightsStore.setScale(currentPage, nextScale);
          highlightsStore.setScale(measurementViewPage, nextScale);
          updateMeasurementList();
          overlay.redraw();
        }
      }

      if (mainContent){

        mainContent.classList.remove('hidden');
        overlay.resizeToMatchCanvas();

        // Only now is #pdfContainer actually laid out (it was display:none
        // a moment ago, so measuring it earlier would read 0). If the page
        // is wider than the now-visible container — typical on a phone —
        // zoom out to fit it instead of leaving it spilling off the edge.
        if (pdfDoc) {
          const fitZoom = await computeFitZoom(pdfDoc, currentPage);
          if (fitZoom < zoom) {
            zoom = fitZoom;
            await renderPage();
            overlay.resizeToMatchCanvas();
          }
        }
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
    } finally {
      hideGlobalLoading();
    }
  }

  window.__handleFile = handleFile;

  // ======================================================
  // PROJECT DETAILS CARD
  // ======================================================

  function updateProjectDetails(project) {
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    const di = project.driving_info || {};
    setText('detailDistance', _convertDistanceToMiles(di.distance));
    setText('detailDuration', di.duration);
  }

  function _convertDistanceToMiles(distanceText) {
    if (!distanceText && distanceText !== 0) return distanceText || '';
    const s = String(distanceText).trim();
    const lower = s.toLowerCase();
    const num = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(num)) return s;
    // If already in miles, return normalized miles string
    if (lower.includes('mi') || lower.includes('mile')) {
      return `${Number(num).toFixed(2)} mi`;
    }
    // If in kilometers, convert to miles
    if (lower.includes('km') || lower.includes('kilometer') || lower.includes('kilometre')) {
      const miles = num * 0.621371;
      return `${miles.toFixed(2)} mi`;
    }
    // Unknown unit: don't assume conversion — return as-is
    return s;
  }

  // ======================================================
  // PROJECT LOADED CARD (sidebar → open project)
  // ======================================================

  let _loadedProjectData = null; // cache for edit form

  function formatLastEditedLabel(value, editorName) {
    if (!value) return 'Last edited: —';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Last edited: —';
    const when = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
    return editorName ? `Last edited: ${when} by ${editorName}` : `Last edited: ${when}`;
  }

  // Called after every save path that can change what's shown here —
  // annotations (measurements/lines/shapes, autosaves on every edit),
  // Analysis tab Save, Painting tab Save — not just on initial project
  // load, so "Last edited" reflects whichever of those actually ran most
  // recently, not just whenever the project was first opened. Also
  // updates _loadedProjectData in place so later re-syncs (e.g. switching
  // tabs) don't regress to a stale cached value.
  function syncLoadedProjectLastEdited(project) {
    const lastEditedEl = document.getElementById('loadedProjectLastEdited');
    if (!project) return;
    const updatedAt = project.updatedAt || project.updated_at || project.lastEdited || project.last_edited;
    const editorName = project.updatedByName || project.updated_by_name || project.updatedByEmail || project.updated_by_email || null;
    if (_loadedProjectData) {
      if (updatedAt) _loadedProjectData.updated_at = updatedAt;
      if (editorName) _loadedProjectData.updated_by_name = editorName;
    }
    if (lastEditedEl) lastEditedEl.textContent = formatLastEditedLabel(updatedAt, editorName);
  }

  function showProjectLoadedCard(projData, blueprintFilename) {
    _loadedProjectData = projData;
    // Normalize stored driving distance to miles for consistent display/calculation
    try {
      if (_loadedProjectData?.driving_info?.distance) {
        _loadedProjectData.driving_info.distance = _convertDistanceToMiles(_loadedProjectData.driving_info.distance);
      }
    } catch (e) { /* ignore */ }
    if (projData?.id) {
      sessionStorage.setItem('estimator_last_project_id', projData.id);
      activeProjectId = projData.id;
      restorePageAggregateOverrides(projData.id);
    }
    window.__estimatorProjectLoaded = true;

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    syncLoadedProjectLastEdited(projData);
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
    window.__estimatorProjectLoaded = false;
    sessionStorage.removeItem('estimator_last_project_id');
    sessionStorage.removeItem('estimator_last_page');
    sessionStorage.removeItem('estimator_last_zoom');
    document.getElementById('projectLoadedCard').style.display = 'none';
    document.getElementById('newProjectForm').style.display = 'block';
    document.getElementById('editProjectForm').style.display = 'none';
    const tabCard = document.getElementById('estimatorTabCard');
    if (tabCard) tabCard.style.display = 'none';
    const changeOrderSovTabCard = document.getElementById('changeOrderSovTabCard');
    if (changeOrderSovTabCard) changeOrderSovTabCard.style.display = 'none';
    const scopeCommentsTabCard = document.getElementById('scopeCommentsTabCard');
    if (scopeCommentsTabCard) scopeCommentsTabCard.style.display = 'none';
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
        const isEditMode = document.getElementById('analysisEditForm')?.style.display !== 'none';
        const body = {};
        if (isEditMode) {
          const addrInput = document.getElementById('analysisAddressInput')?.value?.trim();
          const startSel = document.getElementById('startAddressSelect');
          const startCustom = document.getElementById('startAddressInput');
          if (addrInput) body.address = addrInput;
          if (startSel?.value === 'custom' && startCustom?.value?.trim()) body.start_address = startCustom.value.trim();
        }
        const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}/refresh-distance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('Failed to refresh');
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        const di = data.driving_info || {};
        if (!di.distance || !di.duration) throw new Error('Driving information missing');
        // convert distance to miles for display and downstream calculations
        const convertedDistance = _convertDistanceToMiles(di.distance);
        di.distance = convertedDistance;
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        setText('detailDistance', convertedDistance);
        setText('detailDuration', di.duration);
        setText('editDriveDistance', convertedDistance);
        setText('editDriveTime', di.duration);
        if (_loadedProjectData) {
          _loadedProjectData.driving_info = di;
        }
        // If edit form is open, ensure mobilizations and gasoline inputs are populated (when not manual)
        try {
          if (document.getElementById('analysisEditForm')?.style.display !== 'none') {
            const mobilizationsInput = document.getElementById('mobilizationsInput');
            if (mobilizationsInput && mobilizationsInput.dataset.manual !== 'true') {
              let derivedMobil = null;
              if (_loadedProjectData?.mobilizations != null && _loadedProjectData.mobilizations !== '') {
                derivedMobil = parseFloat(_loadedProjectData.mobilizations);
              } else {
                const daysEl = document.getElementById('expectedDaysInput');
                const daysVal = parseFloat(daysEl?.value) || (Number.isFinite(parseFloat(_loadedProjectData?.expected_days)) ? parseFloat(_loadedProjectData.expected_days) : 0);
                if (daysVal > 0) derivedMobil = daysVal * 2;
              }
              mobilizationsInput.value = derivedMobil != null ? derivedMobil.toFixed(0) : '';
            }
            const gasolineInput = document.getElementById('gasolineInput');
            if (gasolineInput && gasolineInput.dataset.manual !== 'true') {
              const mobilVal = parseFloat(document.getElementById('mobilizationsInput')?.value) || 0;
              const convDist = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
              const derivedGas = _getDistanceDerivedGasoline(convDist || '', mobilVal);
              gasolineInput.value = derivedGas > 0 ? derivedGas.toFixed(2) : '';
            }
          }
        } catch (e) { /* ignore */ }
        // Recompute crew/phase-derived expected days and materials so mobilizations can be derived
        try { _updateCrewCalcs(); } catch (e) { /* ignore */ }
        _updateTransportCosts();
        toast('Distance updated', 'info');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        refreshDistanceBtn.textContent = '↻ Refresh Distance';
        refreshDistanceBtn.disabled = false;
      }
    });
  }

  const refreshPaintingDistanceBtn = document.getElementById('refreshPaintingDistanceBtn');
  if (refreshPaintingDistanceBtn) {
    refreshPaintingDistanceBtn.addEventListener('click', async () => {
      if (!activeProjectId) return;
      refreshPaintingDistanceBtn.textContent = '↻ Refreshing...';
      refreshPaintingDistanceBtn.disabled = true;
      try {
        const isEditMode = document.getElementById('paintingEditForm')?.style.display !== 'none';
        const body = {};
        if (isEditMode) {
          const addrInput = document.getElementById('paintingAddressInput')?.value?.trim();
          const startSel = document.getElementById('paintingStartAddressSelect');
          const startCustom = document.getElementById('paintingStartAddressInput');
          if (addrInput) body.address = addrInput;
          if (startSel?.value === 'custom' && startCustom?.value?.trim()) body.start_address = startCustom.value.trim();
        }
        const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}/refresh-distance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('Failed to refresh');
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        const di = data.driving_info || {};
        if (!di.distance || !di.duration) throw new Error('Driving information missing');
        const convertedDistance = _convertDistanceToMiles(di.distance);
        di.distance = convertedDistance;
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        setText('paintingDetailDistance', convertedDistance);
        setText('paintingDetailDuration', di.duration);
        setText('paintingEditDriveDistance', convertedDistance);
        setText('paintingEditDriveTime', di.duration);
        if (_loadedProjectData) _loadedProjectData.driving_info = di;
        // If painting edit form is open, ensure painting mobilizations and gasoline inputs are populated (when not manual)
        try {
          if (document.getElementById('paintingEditForm')?.style.display !== 'none') {
            const mobilizationsInput = document.getElementById('paintingMobilizationsInput');
            if (mobilizationsInput && mobilizationsInput.dataset.manual !== 'true') {
              let derivedMobil = null;
              if (_loadedProjectData?.mobilizations != null && _loadedProjectData.mobilizations !== '') {
                derivedMobil = parseFloat(_loadedProjectData.mobilizations);
              } else {
                const daysEl = document.getElementById('paintingExpectedDaysInput');
                const daysVal = parseFloat(daysEl?.value) || (Number.isFinite(parseFloat(_loadedProjectData?.expected_days)) ? parseFloat(_loadedProjectData.expected_days) : 0);
                if (daysVal > 0) derivedMobil = daysVal * 2;
              }
              mobilizationsInput.value = derivedMobil != null ? derivedMobil.toFixed(0) : '';
            }
            const gasolineInput = document.getElementById('paintingGasolineInput');
            if (gasolineInput && gasolineInput.dataset.manual !== 'true') {
              const mobilVal = parseFloat(document.getElementById('paintingMobilizationsInput')?.value) || 0;
              const convDist = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
              const derivedGas = _getDistanceDerivedGasoline(convDist || '', mobilVal);
              gasolineInput.value = derivedGas > 0 ? derivedGas.toFixed(2) : '';
            }
          }
        } catch (e) { /* ignore */ }
        // Ensure painting phases/days are refreshed so mobilizations derive correctly
        try { _updatePaintingCrewCalcs(); } catch (e) { /* ignore */ }
        _updatePaintingTransportCosts();
        toast('Distance updated', 'info');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        refreshPaintingDistanceBtn.textContent = '↻ Distance';
        refreshPaintingDistanceBtn.disabled = false;
      }
    });
  }

  // ======================================================
  // ANALYSIS CARD
  // ======================================================

  const fmt$ = v => (v != null ? `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');
  const fmtSF = v => (v != null ? Number(v).toLocaleString() + ' SF' : '—');

  // ---- Estimate phases ----
  // Combined sales tax rates (state + common local) by state abbreviation
  const STATE_TAX_RATES = {
    PA: 6, NJ: 6.625, DE: 0, MD: 6, VA: 5.3, DC: 6,
    NY: 8, CT: 6.35, MA: 6.25, FL: 6, TX: 6.25, CA: 7.25,
    GA: 4, NC: 4.75, SC: 6, OH: 5.75, IL: 6.25, CO: 2.9,
    WA: 6.5, OR: 0, AZ: 5.6, NV: 6.85, MI: 6, MN: 6.875,
  };

  function _inferStateTaxRate(address = '') {
    const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s+\d{5})?$/);
    if (!stateMatch) return null;
    const state = stateMatch[1];
    return STATE_TAX_RATES[state] ?? null;
  }

  const PHASES = ['Rough Cleaning', 'Final Cleaning', 'Touch Up Cleaning'];
  const PHASE_IDS = ['rough', 'final', 'touchup'];

  // Per-phase crew state: each entry is { role: 'cleaner'|'foreman', rate: number, days: number }
  let _phaseCrews = { rough: [], final: [], touchup: [] };
  let _phaseMaterials = { rough: 0, final: 0, touchup: 0 };
  let _deletedPhaseIds = new Set();
  let _expectedDaysManual = false;
  let _phasesLocked = true;
  let _analysisMaterialsManual = false;
  let _analysisAreaManual = false;
  let _analysisAreaManualValue = null;
  const CLEANING_MATERIALS_PER_SF = 57.4;
  const GASOLINE_PER_DISTANCE = 1.210580204778157;
  const CLEANING_BUILDING_TYPE_FACTORS = {
    commercial: 1.00,
    retail: 1.03,
    multifamily: 1.05,
    schoolinstitutional: 1.05,
    medicalhealthcare: 1.08,
    warehouse: 1.10,
    industrialmanufacturing: 1.12,
    highriselargecommercial: 1.15,
  };

  function _normalizeCleaningBuildingType(value) {
    const raw = String(value ?? 'Commercial').trim();
    if (!raw) return 'commercial';
    const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalized === 'schoolinstitutional' || normalized === 'schoolinstitutional') return 'schoolinstitutional';
    if (normalized === 'medicalhealthcare') return 'medicalhealthcare';
    if (normalized === 'industrialmanufacturing') return 'industrialmanufacturing';
    if (normalized === 'highriselargecommercial') return 'highriselargecommercial';
    if (normalized in CLEANING_BUILDING_TYPE_FACTORS) return normalized;
    return 'commercial';
  }

  function _getCleaningBuildingTypeMultiplier(value) {
    const key = _normalizeCleaningBuildingType(value);
    return CLEANING_BUILDING_TYPE_FACTORS[key] ?? 1.00;
  }

  function _getCleaningMaterialsDerivedValue(totalArea) {
    const area = parseFloat(totalArea) || 0;
    return area > 0 ? area / CLEANING_MATERIALS_PER_SF : 0;
  }

  function _getDistanceDerivedGasoline(distanceText, mobilizationsValue) {
    const distance = parseFloat(String(distanceText || '').replace(/[^0-9.\-]/g, ''));
    const mobilizations = parseFloat(String(mobilizationsValue ?? '').replace(/[^0-9.\-]/g, '')) || 0;
    if (!Number.isFinite(distance) || mobilizations <= 0) return 0;
    return (distance * mobilizations / 28) * 5.08;
  }

  // Painting phases
  const PAINTING_PHASES = ['Interior Painting (primer)', 'Interior Painting'];
  const PAINTING_PHASE_IDS = ['phase1', 'phase2'];
  const PAINTING_PHASE_NAME_TO_ID = Object.freeze({
    'Interior Painting (primer)': 'phase1',
    'Interior Painting': 'phase2',
    'Phase 1': 'phase1',
    'Phase 2': 'phase2',
  });
  const PAINTING_MATERIALS_PER_SF = 0.5569993851;
  const PAINTING_FINAL_SUBTOTAL_PER_SF = 1.536175446;
  let _paintingPhaseCrews = { phase1: [], phase2: [] };
  let _paintingPhaseMaterials = { phase1: 0, phase2: 0 };
  let _deletedPaintingPhaseIds = new Set();
  let _paintingExpectedDaysManual = false;
  let _paintingMaterialsManual = false;
  let _paintingPhasesLocked = true;

  const PAINTING_PRIMER_SF_PER_PERSON_DAY = 2000;
  const PAINTING_INTERIOR_SF_PER_PERSON_DAY = 1200;
  // Was a module-load-time const; now a function so it always reflects
  // whatever _estimatorSettings currently holds (including after the
  // settings fetch resolves), not just whatever was true when this script
  // first evaluated.
  function _getPaintingStandardCrew() {
    return [
      { role: 'project_manager', rate: _rate('projectManagerRateCents'), hours: 8 },
      { role: 'assistant', rate: _rate('assistantRateCents'), hours: 8 },
      { role: 'painter', rate: _rate('painterRateCents'), hours: 8 },
      { role: 'painter', rate: _rate('painterRateCents'), hours: 8 },
      { role: 'painter', rate: _rate('painterRateCents'), hours: 8 },
    ];
  }

  const PAINTING_PAINT_COVERAGE_SF = 350;
  const PAINTING_PRIMER_COVERAGE_SF = 250;
  const PAINTING_APPLICATION_FACTORS = {
    roller: 1.00,
    brush: 1.05,
    airless: 1.15,
  };

  // Primer coverage (sq ft per gallon) by application method — lower means more gallons
  const PAINTING_PRIMER_COVERAGE_BY_METHOD = {
    roller: 275,
    brush: 250,
    airless: 225,
  };

  // Consumables and PPE defaults (configurable prices)
  const PAINTING_CONSUMABLE_PRICES = {
    // airless spray
    spray_tip: 25,
    spray_filter: 10,
    masking_plastic_per_1000sf: 20,
    tape_roll: 6,
    respirator: 80,
    respirator_cartridge: 12,
    gloves_box: 8,
    protective_coveralls: 12,
    // roller
    roller_cover: 3,
    roller_tray: 6,
    brush_small: 5,
    // generic
    drop_cloth: 10,
  };

  const PAINTING_CONSUMABLES_BY_METHOD = {
    airless: [
      { key: 'spray_tip', qtyPerJob: 2 },
      { key: 'spray_filter', qtyPerJob: 2 },
      { key: 'masking_plastic_per_1000sf', qtyPerJobPer1000sf: 1 },
      { key: 'tape_roll', qtyPerJob: 4 },
      { key: 'respirator', qtyPerJob: 1 },
      { key: 'respirator_cartridge', qtyPerJob: 2 },
      { key: 'gloves_box', qtyPerJob: 2 },
      { key: 'protective_coveralls', qtyPerJob: 2 },
    ],
    roller: [
      { key: 'roller_cover', qtyPerJobPer1000sf: 6 },
      { key: 'roller_tray', qtyPerJob: 2 },
      { key: 'brush_small', qtyPerJob: 2 },
      { key: 'tape_roll', qtyPerJob: 3 },
      { key: 'gloves_box', qtyPerJob: 1 },
    ],
    brush: [
      { key: 'brush_small', qtyPerJob: 4 },
      { key: 'tape_roll', qtyPerJob: 3 },
      { key: 'drop_cloth', qtyPerJob: 2 },
      { key: 'gloves_box', qtyPerJob: 1 },
    ],
  };
  const PAINTING_SURFACE_MULTIPLIERS = {
    smooth: 1.00,
    normal: 1.05,
    good: 1.05,
    average: 1.05,
    rough: 1.15,
    very_rough: 1.25,
  };
  const PAINTING_FINISH_MULTIPLIERS = {
    flat: 1.00,
    matte: 1.02,
    eggshell: 1.05,
    satin: 1.08,
    semi_gloss: 1.12,
    gloss: 1.15,
  };
  const PAINTING_COLOR_MULTIPLIERS = {
    white_light: 1.0,
    medium: 1.05,
    dark: 1.10,
    very_dark: 1.15,
  };
  const PAINTING_PRICE_PER_GALLON = {
    economy: 32,
    standard: 45,
    premium: 60,
    ultra: 75,
  };
  const PAINTING_PRIMER_PRICE_PER_GALLON = {
    none: 0,
    standard_commercial: 30,
    commercial_acrylic: 40,
    high_build: 50,
    stain_blocking: 55,
    metal_corrosion: 60,
  };
  const PAINTING_BUILDING_TYPE_FACTORS = {
    officecommercial: 1.00,
    retailstore: 1.03,
    multifamilyapartment: 1.05,
    schoolinstitutional: 1.08,
    medicalhealthcare: 1.12,
    warehouse: 1.15,
    manufacturing: 1.20,
    highriselargecommercial: 1.20,
  };

  function _normalizePaintingBuildingType(value) {
    const raw = String(value ?? 'Office / Commercial').trim();
    if (!raw) return 'officecommercial';
    const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalized in PAINTING_BUILDING_TYPE_FACTORS) return normalized;
    return 'officecommercial';
  }

  function _getPaintingBuildingTypeMultiplier(value) {
    const key = _normalizePaintingBuildingType(value);
    return PAINTING_BUILDING_TYPE_FACTORS[key] ?? 1.00;
  }

  function _getPaintingMaterialOptionKey(mapping, value, fallback) {
    if (value == null) return fallback;
    const found = Object.entries(mapping).find(([, mappedValue]) => Number(mappedValue) === Number(value));
    return found ? found[0] : fallback;
  }

  function _getPaintingMaterialSettings() {
    const getValue = id => document.getElementById(id)?.value ?? '';
    const coats = parseInt(getValue('paintingCoatsSelect'), 10) || 2;
    const surface = getValue('paintingSurfaceConditionSelect') || 'smooth';
    const qualitySelectValue = getValue('paintingPaintQualitySelect') || 'standard';
    const customQualityField = document.getElementById('paintingPaintQualityCustomInput');
    const customQuality = customQualityField ? parseFloat(customQualityField.value) : NaN;
    const quality = qualitySelectValue === 'custom'
      ? (Number.isFinite(customQuality) && customQuality >= 0 ? 'custom' : 'standard')
      : qualitySelectValue;
    const finish = getValue('paintingFinishTypeSelect') || 'flat';
    const color = getValue('paintingColorDepthSelect') || 'white_light';
    const primer = getValue('paintingPrimerTypeSelect') || 'none';
    const primerRequired = (getValue('paintingPrimerRequiredSelect') || 'yes') === 'yes';
    // application method for paint (roller|brush|airless)
    const application = getValue('paintingApplicationMethodSelect') || getValue('paintingApplicationSelect') || 'roller';
    // primer-specific settings: coats and application method
    const primerCoats = parseInt(getValue('paintingPrimerCoatsSelect') || getValue('paintingPrimerCoats') || '1', 10) || 1;
    const primerApplication = getValue('paintingPrimerApplicationMethodSelect') || application || 'roller';
    const activeApplicationMethod = application || primerApplication || 'roller';
    const paintPrice = quality === 'custom'
      ? (Number.isFinite(customQuality) && customQuality >= 0 ? customQuality : (PAINTING_PRICE_PER_GALLON.standard ?? 45))
      : (PAINTING_PRICE_PER_GALLON[quality] ?? 45);

    return {
      coats,
      surface,
      quality,
      finish,
      color,
      primer,
      application: application || 'roller',
      primerCoats,
      primerApplication,
      activeApplicationMethod,
      surfaceMultiplier: PAINTING_SURFACE_MULTIPLIERS[surface] ?? 1,
      applicationFactor: PAINTING_APPLICATION_FACTORS[application] ?? 1.0,
      paintPrice,
      finishMultiplier: PAINTING_FINISH_MULTIPLIERS[finish] ?? 1,
      colorMultiplier: PAINTING_COLOR_MULTIPLIERS[color] ?? 1,
      primerPrice: primerRequired ? (PAINTING_PRIMER_PRICE_PER_GALLON[primer] ?? 0) : 0,
      hasPrimer: primerRequired && primer !== 'none',
    };
  }

  function _calculatePaintingMaterialsCost() {
    // Prefer explicit painting total area input; fall back to loaded project total area
    const rawAreaValue = document.getElementById('paintingTotalAreaInput')?.value;
    const area = (rawAreaValue !== null && rawAreaValue !== undefined && rawAreaValue !== '' && Number.isFinite(parseFloat(rawAreaValue)))
      ? parseFloat(rawAreaValue)
      : (parseFloat(_loadedProjectData?.total_area) || 0);
    const settings = _getPaintingMaterialSettings();
    // Paint gallons based on application factor and coverage
    const paintGallons = area > 0
      ? Math.ceil((area * settings.coats * settings.applicationFactor * settings.surfaceMultiplier) / PAINTING_PAINT_COVERAGE_SF)
      : 0;
    const basePaintCost = paintGallons * settings.paintPrice;
    const paintCost = basePaintCost * settings.finishMultiplier * settings.colorMultiplier;

    // Primer calculation: only if primer selected
    let primerGallons = 0;
    let primerCost = 0;
    if (area > 0 && settings.hasPrimer && settings.primerPrice > 0) {
      const primerCoverage = PAINTING_PRIMER_COVERAGE_BY_METHOD[settings.primerApplication] || PAINTING_PRIMER_COVERAGE_SF;
      primerGallons = Math.ceil((area * settings.primerCoats) / primerCoverage);
      primerCost = primerGallons * settings.primerPrice;
    }

    // Consumables / PPE based on the current active application method
    const appMethod = settings.activeApplicationMethod || settings.application || settings.primerApplication || 'roller';
    const consumablesList = PAINTING_CONSUMABLES_BY_METHOD[appMethod] || [];
    let consumablesCost = 0;
    const consumablesDetailed = [];
    for (const item of consumablesList) {
      let qty = 0;
      if (item.qtyPerJob) qty = item.qtyPerJob;
      else if (item.qtyPerJobPer1000sf && area > 0) qty = Math.ceil((area / 1000) * item.qtyPerJobPer1000sf);
      else if (item.qtyPerJobPer1000sf === undefined && item.qtyPerJob === undefined && item.key.endsWith('_per_1000sf')) {
        // handle special per-1000sf keys
        const keyBase = item.key.replace('_per_1000sf', '');
        qty = Math.ceil(area / 1000);
      }
      // For masking_plastic_per_1000sf we treat qty as number of 1000sf units
      if (item.key === 'masking_plastic_per_1000sf') {
        const units = Math.ceil(area / 1000) || 0;
        const price = PAINTING_CONSUMABLE_PRICES['masking_plastic_per_1000sf'] || 0;
        const c = units * price;
        if (c > 0) {
          consumablesDetailed.push({ key: item.key, qty: units, unitPrice: price, cost: c });
          consumablesCost += c;
        }
        continue;
      }

      const unitPrice = PAINTING_CONSUMABLE_PRICES[item.key] || 0;
      const cost = qty * unitPrice;
      if (qty > 0 && unitPrice > 0) {
        consumablesDetailed.push({ key: item.key, qty, unitPrice, cost });
        consumablesCost += cost;
      }
    }

    const baseTotalCost = paintCost + primerCost + consumablesCost;
    const buildingTypeMultiplier = _getPaintingBuildingTypeMultiplier(document.getElementById('paintingBuildingTypeSelect')?.value);
    const totalCost = baseTotalCost * buildingTypeMultiplier;

    return {
      paintGallons,
      primerGallons,
      paintCost,
      primerCost,
      consumablesCost,
      consumablesDetailed,
      totalCost,
    };
  }

  function _updatePaintingMaterialsCostDisplays() {
    const costs = _calculatePaintingMaterialsCost();
    const setText = (id, value) => {
      const matches = document.querySelectorAll(`#${CSS.escape(id)}`);
      matches.forEach(el => {
        el.textContent = typeof value === 'number' ? `$${value.toFixed(2)}` : value;
      });
    };
    const setNumericText = (id, value) => {
      const matches = document.querySelectorAll(`#${CSS.escape(id)}`);
      matches.forEach(el => {
        el.textContent = value ?? '0';
      });
    };

    setNumericText('paintingPaintGallonsDisplay', costs.paintGallons || '0');
    setNumericText('paintingPrimerGallonsDisplay', costs.primerGallons || '0');
    setNumericText('paintingPaintGallonsDetailDisplay', costs.paintGallons || '0');
    setNumericText('paintingPrimerGallonsDetailDisplay', costs.primerGallons || '0');
    setText('paintingPaintCostDisplay', costs.paintCost);
    setText('paintingPrimerCostDisplay', costs.primerCost);
    setText('paintingPaintCostDetailDisplay', costs.paintCost);
    setText('paintingPrimerCostDetailDisplay', costs.primerCost);
    setText('paintingConsumablesCostDisplay', costs.consumablesCost || 0);
    setNumericText('paintingTotalMaterialsCostDisplay', `$${costs.totalCost.toFixed(2)}`);

    const materialsInput = document.getElementById('paintingMaterialsInput');
    if (materialsInput && !_paintingMaterialsManual) {
      materialsInput.value = costs.totalCost.toFixed(2);
    }
  }

  function _attachPaintingMaterialsListeners() {
    const materialIds = ['paintingTotalAreaInput', 'paintingCoatsSelect', 'paintingSurfaceConditionSelect', 'paintingPaintQualitySelect', 'paintingPaintQualityCustomInput', 'paintingFinishTypeSelect', 'paintingColorDepthSelect', 'paintingPrimerTypeSelect', 'paintingPrimerRequiredSelect', 'paintingApplicationMethodSelect', 'paintingPrimerCoatsSelect', 'paintingPrimerApplicationMethodSelect', 'paintingBuildingTypeSelect'];
    const handleMaterialChange = () => {
      _updatePaintingMaterialsCostDisplays();
      _updatePaintingCrewCalcs();
    };

    const qualitySelect = document.getElementById('paintingPaintQualitySelect');
    const qualityCustomInput = document.getElementById('paintingPaintQualityCustomInput');
    const syncCustomPaintQualityInput = () => {
      if (!qualitySelect || !qualityCustomInput) return;
      const isCustom = qualitySelect.value === 'custom';
      qualityCustomInput.disabled = !isCustom;
      qualityCustomInput.style.opacity = isCustom ? '1' : '0.6';
      if (!isCustom) qualityCustomInput.value = '';
    };
    if (qualitySelect && qualityCustomInput) {
      qualitySelect.addEventListener('input', syncCustomPaintQualityInput);
      qualitySelect.addEventListener('change', syncCustomPaintQualityInput);
      syncCustomPaintQualityInput();
    }

    materialIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', handleMaterialChange);
      el.addEventListener('change', handleMaterialChange);
    });

    const phaseContainer = document.getElementById('paintingPhaseTableContainer');
    if (phaseContainer) {
      phaseContainer.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!materialIds.includes(target.id)) return;
        handleMaterialChange();
      });
      phaseContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!materialIds.includes(target.id)) return;
        handleMaterialChange();
      });
    }

    const materialsInput = document.getElementById('paintingMaterialsInput');
    if (materialsInput) {
      materialsInput.addEventListener('input', () => {
        _paintingMaterialsManual = true;
      });
    }
  }

  function _ensurePaintingMaterialsListeners() {
    if (_paintingMaterialsListenersAttached) return;
    _attachPaintingMaterialsListeners();
    _paintingMaterialsListenersAttached = true;
  }

  let _paintingMaterialsListenersAttached = false;

  function _getPaintingAreaDerivedValues(totalArea) {
    const area = parseFloat(totalArea) || 0;
    return {
      materials: area * PAINTING_MATERIALS_PER_SF,
      finalSubtotal: area * PAINTING_FINAL_SUBTOTAL_PER_SF,
    };
  }

  function _getPaintingAreaPerPersonRate(pid) {
    if (pid === 'phase1') {
      return parseFloat(document.getElementById('paintingPrimerAreaPerPersonInput')?.value) || PAINTING_PRIMER_SF_PER_PERSON_DAY;
    }
    return parseFloat(document.getElementById('paintingInteriorAreaPerPersonInput')?.value) || PAINTING_INTERIOR_SF_PER_PERSON_DAY;
  }

  function _getPaintingPhaseDays(totalArea, pid) {
    const area = parseFloat(totalArea) || 0;
    if (area <= 0) return 1;
    const rate = _getPaintingAreaPerPersonRate(pid);
    // Use actual number of painters in the phase when available, fall back to default 3
    const crew = _paintingPhaseCrews[pid] || [];
    const painters = crew.filter(m => m.role === 'painter').length || 3;
    return Math.max(1, Math.ceil(area / (painters * rate)));
  }

  function _refreshPaintingDays() {
    const areaInput = document.getElementById('paintingTotalAreaInput');
    const area = parseFloat(areaInput?.value) || 0;
    if (area <= 0) return;
    PAINTING_PHASE_IDS.forEach(pid => {
      const crew = _paintingPhaseCrews[pid] || [];
      if (crew.length === 0) return;
      const days = _getPaintingPhaseDays(area, pid);
      crew.forEach(member => { member.days = days; });
    });
    _updatePaintingCrewCalcs();
    _updatePaintingTransportCosts();
  }

  function _generatePaintingCrewForPhase(pid, totalArea) {
    const days = _getPaintingPhaseDays(totalArea, pid);
    const uid = () => Math.random().toString(36).slice(2);
    return _getPaintingStandardCrew().map(member => ({ ...member, days, _uid: uid() }));
  }

  function _autoGeneratePaintingPhases(totalArea) {
    const area = parseFloat(totalArea) || 0;
    if (area <= 0) return;
    _deletedPaintingPhaseIds.clear();
    PAINTING_PHASE_IDS.forEach((pid) => {
      _paintingPhaseCrews[pid] = _generatePaintingCrewForPhase(pid, area);
      _paintingPhaseMaterials[pid] = 0;
    });
  }

  function _getPaintingExpectedDaysFromPhases() {
    let totalDays = 0;
    PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid)).forEach(pid => {
      const crew = _paintingPhaseCrews[pid] || [];
      if (crew.length > 0) totalDays += Math.max(...crew.map(m => m.days || 0));
    });
    return totalDays;
  }

  function _applyPaintingExpectedDaysSplit(totalDays) {
    const days = parseFloat(totalDays) || 0;
    if (days <= 0) return;

    const activePhaseIds = PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid));
    if (activePhaseIds.length === 0) return;

    const phase1Days = days * 0.3;
    const phase2Days = days * 0.7;

    activePhaseIds.forEach((pid) => {
      const crew = _paintingPhaseCrews[pid] || [];
      if (crew.length === 0) return;
      const memberDays = pid === 'phase1' ? phase1Days : phase2Days;
      crew.forEach((member) => {
        member.days = memberDays;
      });
    });

    _updatePaintingCrewCalcs();
  }

  function _autoGeneratePhases(totalArea) {
    const area = parseFloat(totalArea) || 0;
    if (area <= 0) return;
    const uid = () => Math.random().toString(36).slice(2);

    // Crew size by area tier
    let mainCleaners, touchupCleaners;
    if (area < 50000) {
      mainCleaners = 4; touchupCleaners = 3;
    } else if (area <= 100000) {
      mainCleaners = 5; touchupCleaners = 4;
    } else {
      mainCleaners = 7; touchupCleaners = 6;
    }

    // Days = area / (cleaners * area-per-person-per-day)
    const roughAppd   = parseFloat(document.getElementById('roughAreaPerPersonInput')?.value)   || 4000;
    const finalAppd   = parseFloat(document.getElementById('finalAreaPerPersonInput')?.value)   || 4000;
    const touchupAppd = parseFloat(document.getElementById('touchupAreaPerPersonInput')?.value) || 4000;
    const roughDays   = Math.ceil(area / (mainCleaners    * roughAppd));
    const finalDays   = Math.ceil(area / (mainCleaners    * finalAppd));
    const touchupDays = Math.ceil(area / (touchupCleaners * touchupAppd));

    const makeCleaners = (count, days) =>
      Array.from({ length: count }, () => ({ role: 'cleaner', rate: _rate('cleanerRateCents'), hours: 8, days, _uid: uid() }));

    _phaseCrews.rough = [
      ...makeCleaners(mainCleaners, roughDays),
      { role: 'foreman', rate: _rate('foremanRateCents'), hours: 8, days: roughDays, _uid: uid() },
    ];
    _phaseCrews.final = [
      ...makeCleaners(mainCleaners, finalDays),
      { role: 'foreman', rate: _rate('foremanRateCents'), hours: 8, days: finalDays, _uid: uid() },
    ];
    _phaseCrews.touchup = [
      ...makeCleaners(touchupCleaners, touchupDays),
      { role: 'foreman', rate: _rate('foremanRateCents'), hours: 8, days: touchupDays, _uid: uid() },
    ];
    _deletedPhaseIds = new Set();
  }

  function _refreshCleaningDays() {
    const area = parseFloat(document.getElementById('analysisTotalAreaInput')?.value) || 0;
    if (area <= 0) return;
    const roughRate = parseFloat(document.getElementById('roughAreaPerPersonInput')?.value) || 4000;
    const finalRate = parseFloat(document.getElementById('finalAreaPerPersonInput')?.value) || 4000;
    const touchupRate = parseFloat(document.getElementById('touchupAreaPerPersonInput')?.value) || 4000;
    const updatePhaseDays = (pid, rate) => {
      const crew = _phaseCrews[pid] || [];
      const cleaners = crew.filter(m => m.role === 'cleaner').length || 1;
      const days = Math.max(1, Math.ceil(area / (cleaners * rate)));
      crew.forEach(member => { member.days = days; });
    };
    updatePhaseDays('rough', roughRate);
    updatePhaseDays('final', finalRate);
    updatePhaseDays('touchup', touchupRate);
  }

  function _calcProfitAmount(subtotal, materials, profitRate) {
    return (subtotal + materials) * profitRate;
  }

  function _calcPhase(p, rates) {
    const crew = p.crew || [];
    let cleanersPay = 0, foremanPay = 0, assistantPay = 0, painterPay = 0, pmPay = 0;
    if (crew.length > 0) {
      for (const m of crew) {
        const pay = (m.rate || 0) * (m.hours ?? 8) * (m.days || 0);
        if (m.role === 'cleaner') cleanersPay += pay;
        else if (m.role === 'foreman') foremanPay += pay;
        else if (m.role === 'assistant') assistantPay += pay;
        else if (m.role === 'painter') painterPay += pay;
        else if (m.role === 'project_manager') pmPay += pay;
        else foremanPay += pay;
      }
    } else {
      // backward compat: old format with persons/days + global rates
      cleanersPay = (p.persons || 0) * (p.days || 0) * (rates.cleanerRate || 0);
      foremanPay = (p.days || 0) * (rates.foremanRate || 0);
    }
    const baseLaborCost = cleanersPay + foremanPay + assistantPay + painterPay + pmPay;
    const buildingMultiplier = _getCleaningBuildingTypeMultiplier(document.getElementById('buildingTypeSelect')?.value);
    const laborCost = baseLaborCost * buildingMultiplier;
    const materials = p.materials || 0;
    const subtotal = laborCost;
    const markupBase = subtotal + materials;
    const oh = markupBase * rates.overhead;
    const pft = _calcProfitAmount(subtotal, materials, rates.profit);
    const comm = markupBase * rates.commission;
    const finalPrice = subtotal + materials + oh + pft + comm;
    return { cleanersPay, foremanPay, assistantPay, painterPay, pmPay, laborCost, materials, subtotal, oh, pft, comm, finalPrice };
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
    return PHASE_IDS
      .filter(pid => !_deletedPhaseIds.has(pid))
      .map((pid, i) => {
        const actualIdx = PHASE_IDS.indexOf(pid);
        return {
          name: PHASES[actualIdx],
          crew: (_phaseCrews[pid] || []).map(m => ({ ...m })),
          persons: (_phaseCrews[pid] || []).filter(m => m.role === 'cleaner').length,
          days: Math.max(0, ...(_phaseCrews[pid] || []).map(m => m.days || 0), 0),
          materials: _phaseMaterials[pid] || 0,
        };
      });
  }

  function _updateCrewCalcs() {
    const rates = _getRates();
    const overheadPct = parseFloat(document.getElementById('overheadInput')?.value) || 0;
    const profitPct = parseFloat(document.getElementById('profitInput')?.value) || 0;
    const taxPct = parseFloat(document.getElementById('taxInput')?.value) || 0;
    const commPct = parseFloat(document.getElementById('commissionInput')?.value) || 0;

    let totLabor = 0, totSubtotal = 0, totOh = 0, totPft = 0, totComm = 0;

    PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach((pid) => {
      const crew = _phaseCrews[pid] || [];
      const phaseMat = _phaseMaterials[pid] || 0;
      const c = _calcPhase({ crew, materials: phaseMat }, rates);
      totLabor += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
      totPft += c.pft; totComm += c.comm;

      crew.forEach((m) => {
        const pay = (m.rate||0)*(m.hours??8)*(m.days||0);
        const el = document.getElementById(`crew_pay_${m._uid}`);
        if (el) el.textContent = fmt$(pay);
      });

      const setFoot = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt$(val); };
      setFoot(`phase_cleaners_${pid}`, c.cleanersPay);
      setFoot(`phase_foreman_${pid}`, c.foremanPay);
      setFoot(`phase_assistant_${pid}`, c.assistantPay);
      setFoot(`phase_painter_${pid}`, c.painterPay);
      setFoot(`phase_pm_${pid}`, c.pmPay);
      setFoot(`phase_labor_${pid}`, c.laborCost);
      setFoot(`phase_subtotal_${pid}`, c.subtotal);
    });

    const totalPhaseMaterials = PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid))
      .reduce((sum, pid) => sum + (_phaseMaterials[pid] || 0), 0);
    const matInput = document.getElementById('materialsInput');
    const materialsForSummary = matInput && matInput.value !== ''
      ? (parseFloat(matInput.value) || 0)
      : totalPhaseMaterials;
    const driverCostInSubtotal = parseFloat(document.getElementById('driverCostDisplay')?.value) || 0;
    const subtotalWithDriver = totSubtotal + driverCostInSubtotal;
    if (matInput && !_analysisMaterialsManual) matInput.value = totalPhaseMaterials;

    const summaryContainer = document.getElementById('calcSummaryContainer');
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
      const markUpBase = subtotalWithDriver + materialsForSummary;
      const totPftSummary = _calcProfitAmount(subtotalWithDriver, materialsForSummary, profitPct / 100);
      const totOhSummary = markUpBase * (overheadPct / 100);
      const totCommSummary = markUpBase * (commPct / 100);
      const gasInput = document.getElementById('gasolineInput');
      // Ensure mobilizations are in-sync before deriving gasoline
      try { _syncAnalysisMobilizations(); } catch (e) { /* ignore */ }
      const mobilizationsInputEl = document.getElementById('mobilizationsInput');
      const mobilizationsVal = parseFloat(mobilizationsInputEl?.value) || 0;
      const convertedDistance = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
      const gasCost = gasInput && gasInput.dataset.manual === 'true'
        ? (parseFloat(gasInput.value) || 0)
        : _getDistanceDerivedGasoline(convertedDistance || '', mobilizationsVal);
      const taxBase = subtotalWithDriver + materialsForSummary + gasCost + totOhSummary + totPftSummary + totCommSummary;
      const totTax = taxBase * (taxPct / 100);
      const totFinal = taxBase + totTax;
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;margin-top:8px;';
      [
        [`Labor`, totSubtotal],
        [`Materials`, materialsForSummary],
        [`Overhead (${overheadPct}%)`, totOhSummary],
        [`Profit (${profitPct}%)`, totPftSummary],
        [`Tax (${taxPct}%)`, totTax],
        [`Commission (${commPct}%)`, totCommSummary],
        [`Final Price`, totFinal],
      ].forEach(([label, val], i) => {
        const isLast = i === 6;
        const item = document.createElement('div');
        item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#16a34a' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
        grid.appendChild(item);
      });
      summaryContainer.appendChild(grid);
    }

    // Auto-calculate expected days from phases (sum of max days per active phase)
    if (!_expectedDaysManual) {
      let totalDays = 0;
      PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach(pid => {
        const crew = _phaseCrews[pid] || [];
        if (crew.length > 0) totalDays += Math.max(...crew.map(m => m.days || 0));
      });
      const daysEl = document.getElementById('expectedDaysInput');
      if (daysEl) daysEl.value = totalDays > 0 ? totalDays : '';
    }
    _syncAnalysisMobilizations();

    _changeOrders.forEach(co => _updateOneChangeOrderCalc(co));
  }

  const _updateCalcCells = _updateCrewCalcs;

  function _parseDurationToHours(text) {
    if (!text) return 0;
    let hours = 0;
    const h = text.match(/(\d+)\s*hour/);
    const m = text.match(/(\d+)\s*min/);
    if (h) hours += parseInt(h[1]);
    if (m) hours += parseInt(m[1]) / 60;
    return hours;
  }

  function _syncAnalysisMobilizations() {
    const daysInput = document.getElementById('expectedDaysInput');
    const mobilizationsInput = document.getElementById('mobilizationsInput');
    if (!mobilizationsInput) return;
    if (mobilizationsInput.dataset.manual === 'true' || mobilizationsInput.value !== '') return;
    const expectedDays = parseFloat(daysInput?.value) || 0;
    const derived = expectedDays > 0 ? expectedDays * 2 : '';
    mobilizationsInput.value = derived !== '' ? derived.toFixed(0) : '';
  }

  function _syncPaintingMobilizations() {
    const daysInput = document.getElementById('paintingExpectedDaysInput');
    const mobilizationsInput = document.getElementById('paintingMobilizationsInput');
    if (!mobilizationsInput) return;
    if (mobilizationsInput.dataset.manual === 'true') return;
    const expectedDays = parseFloat(daysInput?.value) || 0;
    const derived = expectedDays > 0 ? expectedDays * 2 : '';
    mobilizationsInput.value = derived !== '' ? derived.toFixed(0) : '';
  }

  function _getForemanRate() {
    for (const pid of PHASE_IDS) {
      const foreman = (_phaseCrews[pid] || []).find(m => m.role === 'foreman');
      if (foreman) return foreman.rate || _rate('foremanRateCents');
    }
    return _rate('foremanRateCents');
  }

  function _updateTransportCosts() {
    _syncAnalysisMobilizations();
    const durationText = _loadedProjectData?.driving_info?.duration || '';
    const hours = _parseDurationToHours(durationText);
    const foremanRate = _getForemanRate();
    const mobilizationsInput = document.getElementById('mobilizationsInput');
    const mobilizations = parseFloat(mobilizationsInput?.value) || 0;
    const driverCostInput = document.getElementById('driverCostDisplay');
    const manualDriverCost = driverCostInput && driverCostInput.dataset.manual === 'true'
      ? (parseFloat(driverCostInput.value) || 0)
      : null;
    const autoDriverCost = hours > 0 ? (mobilizations * hours * foremanRate) : 0;
    const driverCost = manualDriverCost != null ? manualDriverCost : autoDriverCost;
    const gasInput = document.getElementById('gasolineInput');
    const convertedDistance = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
    const gasoline = gasInput && gasInput.dataset.manual === 'true'
      ? (parseFloat(gasInput.value) || 0)
      : _getDistanceDerivedGasoline(convertedDistance || '', mobilizations);
    if (gasInput && gasInput.dataset.manual !== 'true') {
      gasInput.value = gasoline > 0 ? gasoline.toFixed(2) : '';
    }
    const tollCost = parseFloat(document.getElementById('tollCostInput')?.value) || 0;
    const costPerMileInput = document.getElementById('costPerMileInput');
    const distance = parseFloat(String(convertedDistance || '').replace(/[^0-9.\-]/g, '')) || 0;
    const autoCostPerMile = distance > 0 ? (driverCost + gasoline + tollCost) / distance : 0;
    if (costPerMileInput && costPerMileInput.dataset.manual !== 'true') {
      costPerMileInput.value = autoCostPerMile > 0 ? autoCostPerMile.toFixed(2) : '';
    }
    const total = gasoline + tollCost;

    const driverEl = document.getElementById('driverCostDisplay');
    const totalEl  = document.getElementById('totalTransportDisplay');
    if (driverEl) driverEl.value = driverCost > 0 ? driverCost.toFixed(2) : '';
    if (totalEl)  totalEl.textContent  = (gasoline > 0 || tollCost > 0) ? fmt$(total) : '—';
  }

  function _updatePaintingTransportCosts() {
    _syncPaintingMobilizations();
    const durationText = _loadedProjectData?.driving_info?.duration || '';
    const hours = _parseDurationToHours(durationText);
    const foremanRate = (() => {
      for (const pid of PAINTING_PHASE_IDS) {
        const f = (_paintingPhaseCrews[pid] || []).find(m => m.role === 'foreman');
        if (f) return f.rate || _rate('foremanRateCents');
      }
      return _rate('foremanRateCents');
    })();
    const mobilizationsInput = document.getElementById('paintingMobilizationsInput');
    const mobilizations = parseFloat(mobilizationsInput?.value) || 0;
    const driverCostInput = document.getElementById('paintingDriverCostDisplay');
    const manualDriverCost = driverCostInput && driverCostInput.dataset.manual === 'true'
      ? (parseFloat(driverCostInput.value) || 0)
      : null;
    const autoDriverCost = hours > 0 ? (mobilizations * hours * foremanRate) : 0;
    const driverCost = manualDriverCost != null ? manualDriverCost : autoDriverCost;
    const gasInput = document.getElementById('paintingGasolineInput');
    const convertedDistance = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
    const gasoline = gasInput && gasInput.dataset.manual === 'true'
      ? (parseFloat(gasInput.value) || 0)
      : _getDistanceDerivedGasoline(convertedDistance || '', mobilizations);
    if (gasInput && gasInput.dataset.manual !== 'true') {
      gasInput.value = gasoline > 0 ? gasoline.toFixed(2) : '';
    }
    const tollCost = parseFloat(document.getElementById('paintingTollCostInput')?.value) || 0;
    const costPerMileInput = document.getElementById('paintingCostPerMileInput');
    const distance = parseFloat(String(convertedDistance || '').replace(/[^0-9.\-]/g, '')) || 0;
    const autoCostPerMile = distance > 0 ? (driverCost + gasoline + tollCost) / distance : 0;
    if (costPerMileInput && costPerMileInput.dataset.manual !== 'true') {
      costPerMileInput.value = autoCostPerMile > 0 ? autoCostPerMile.toFixed(2) : '';
    }
    const total = gasoline + tollCost;
    const driverEl = document.getElementById('paintingDriverCostDisplay');
    const totalEl  = document.getElementById('paintingTotalTransportDisplay');
    if (driverEl) driverEl.value = driverCost > 0 ? driverCost.toFixed(2) : '';
    if (totalEl)  totalEl.textContent  = (gasoline > 0 || tollCost > 0) ? fmt$(total) : '—';
  }

  let _changeOrders = [];

  function _getPhaseLaborCosts() {
    const isEditing = document.getElementById('analysisEditForm')?.style.display !== 'none';
    let laborCosts = 0;
    if (isEditing) {
      const rates = _getRates();
      PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach(pid => {
        laborCosts += _calcPhase({ crew: _phaseCrews[pid] || [] }, rates).laborCost;
      });
    } else {
      const bd = _loadedProjectData?.labor_breakdown;
      if (bd?.phases) {
        const rates = { cleanerRate: 0, foremanRate: 0, overhead: 0, profit: 0, tax: 0, commission: 0 };
        for (const p of bd.phases) laborCosts += _calcPhase(p, rates).laborCost;
      }
    }
    return laborCosts;
  }

  function _updateOneChangeOrderCalc(co) {
    let laborChangeOrder = 0;
    (co.crew || []).forEach(m => {
      const pay = (m.rate || 0) * (m.hours ?? 8) * (m.days || 0);
      laborChangeOrder += pay;
      const payEl = document.getElementById(`co_pay_${m._uid}`);
      if (payEl) payEl.textContent = fmt$(pay);
    });
    const laborCosts = _getPhaseLaborCosts();
    const materials = co.materials ?? 0;
    const materialsGC = co.materials_gc ?? 0;
    const profit = laborChangeOrder - laborCosts - materials + materialsGC;
    const summaryEl = document.getElementById(`co_summary_${co.id}`);
    if (summaryEl) {
      summaryEl.innerHTML = `<div style="display:grid;grid-template-columns:1fr auto;gap:3px 24px;max-width:380px;font-size:12px;">
        <span style="color:#6b7280;">Labor Change Order</span><span style="font-weight:600;text-align:right;">${fmt$(laborChangeOrder)}</span>
        <span style="color:#6b7280;">Labor</span><span style="font-weight:600;text-align:right;">${fmt$(laborCosts)}</span>
        <span style="color:#6b7280;">Materials</span><span style="font-weight:600;text-align:right;">${fmt$(materials)}</span>
        <span style="color:#6b7280;">Materials GC</span><span style="font-weight:600;text-align:right;">${fmt$(materialsGC)}</span>
        <span style="font-weight:700;border-top:1px solid #e5e7eb;padding-top:4px;">Profit</span><span style="font-weight:700;color:#16a34a;text-align:right;border-top:1px solid #e5e7eb;padding-top:4px;">${fmt$(profit)}</span>
      </div>`;
    }
  }

  // Shared trash icon for the delete buttons below (change order, crew
  // member, and — via renderSovTable — SOV row), same stroke-icon
  // language as the toolbar instead of a raw "×"/"Delete" text button.
  const TRASH_ICON_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function _renderChangeOrders() {
    const container = document.getElementById('changeOrdersContainer');
    if (!container) return;
    container.innerHTML = '';
    const coRoleDefs = [
      { label: '+ Cleaner', role: 'cleaner', rate: _rate('cleanerRateCents'), color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
      { label: '+ Foreman', role: 'foreman', rate: _rate('foremanRateCents'), color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
      { label: '+ Assistant', role: 'assistant', rate: _rate('assistantRateCents'), color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
      { label: '+ Painter', role: 'painter', rate: _rate('painterRateCents'), color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
      { label: '+ PM', role: 'project_manager', rate: _rate('projectManagerRateCents'), color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd' },
    ];
    const roleLabels = { cleaner: 'Cleaner', foreman: 'Foreman', assistant: 'Assistant', painter: 'Painter', project_manager: 'PM' };
    const roleStyles = {
      cleaner: 'background:#eff6ff;color:#2563eb;', foreman: 'background:#f0fdf4;color:#16a34a;',
      assistant: 'background:#fffbeb;color:#d97706;', painter: 'background:#fef2f2;color:#dc2626;',
      project_manager: 'background:#f5f3ff;color:#7c3aed;',
    };

    if (_changeOrders.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No change orders yet. Click "+ Add" to create one.';
      empty.style.cssText = 'padding:20px;text-align:center;color:#9ca3af;font-size:12px;border:1px dashed #e5e7eb;border-radius:10px;';
      container.appendChild(empty);
      return;
    }

    _changeOrders.forEach((co, idx) => {
      const section = document.createElement('div');
      section.className = 'co-section';

      // Header: name input + delete
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:#f9fafb;border-bottom:1px solid #eef1f5;';
      const nameLabel = document.createElement('span');
      nameLabel.textContent = 'Name:';
      nameLabel.style.cssText = 'font-size:12px;color:#6b7280;font-weight:500;white-space:nowrap;';
      const nameInp = document.createElement('input');
      nameInp.type = 'text'; nameInp.value = co.name || `Change Order ${idx + 1}`; nameInp.placeholder = 'Change Order Name';
      nameInp.className = 'mini-input';
      nameInp.style.cssText = 'font-weight:600;flex:1;min-width:0;';
      nameInp.addEventListener('input', () => { co.name = nameInp.value; });
      const delCOBtn = document.createElement('button');
      delCOBtn.type = 'button';
      delCOBtn.className = 'mini-btn icon-btn danger';
      delCOBtn.title = 'Delete change order';
      delCOBtn.setAttribute('aria-label', 'Delete change order');
      delCOBtn.innerHTML = TRASH_ICON_SVG;
      delCOBtn.onclick = () => { _changeOrders.splice(idx, 1); _renderChangeOrders(); };
      hdr.appendChild(nameLabel); hdr.appendChild(nameInp); hdr.appendChild(delCOBtn);
      section.appendChild(hdr);

      // Add role buttons — full-pill "chips", still color-coded per role
      const addRow = document.createElement('div');
      addRow.style.cssText = 'display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap;border-bottom:1px solid #eef1f5;';
      coRoleDefs.forEach(({ label, role, rate, color, bg, border }) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.className = 'co-role-chip';
        btn.style.cssText = `color:${color};background:${bg};border-color:${border};`;
        btn.onclick = () => { co.crew.push({ role, name: '', rate, hours: 8, days: 1, _uid: Math.random().toString(36).slice(2) }); _renderChangeOrders(); };
        addRow.appendChild(btn);
      });
      section.appendChild(addRow);

      // Crew table
      if (co.crew.length > 0) {
        const table = document.createElement('table');
        table.className = 'co-crew-table';
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        const thead = table.createTHead(); const hrow = thead.insertRow();
        ['Role', 'Name', 'Rate', 'Hrs', 'Days', 'Pay', ''].forEach((h, hi) => {
          const th = document.createElement('th'); th.textContent = h;
          th.style.textAlign = hi >= 4 ? 'right' : 'left';
          hrow.appendChild(th);
        });
        const tbody = table.createTBody();
        co.crew.forEach(member => {
          const tr = tbody.insertRow();
          const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:6px 10px;';
          const badge = document.createElement('span');
          badge.textContent = roleLabels[member.role] || member.role;
          badge.style.cssText = `padding:3px 9px;border-radius:999px;${roleStyles[member.role] || 'background:#f3f4f6;color:#374151;'};font-size:11px;font-weight:600;`;
          roleTd.appendChild(badge);
          const nameTd = tr.insertCell(); nameTd.style.cssText = 'padding:6px 10px;';
          const nameI = document.createElement('input'); nameI.type = 'text'; nameI.placeholder = 'Name'; nameI.value = member.name || '';
          nameI.className = 'mini-input'; nameI.style.width = '100px';
          nameI.addEventListener('input', () => { member.name = nameI.value.trim(); });
          nameTd.appendChild(nameI);
          const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:6px 10px;';
          const rw = document.createElement('div'); rw.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const rateI = document.createElement('input'); rateI.type = 'number'; rateI.min = '0'; rateI.step = '0.01'; rateI.value = member.rate;
          rateI.className = 'mini-input'; rateI.style.width = '64px';
          rateI.addEventListener('input', () => { member.rate = parseFloat(rateI.value) || 0; _updateOneChangeOrderCalc(co); });
          const rl = document.createElement('span'); rl.textContent = '$/hr'; rl.style.cssText = 'font-size:11px;color:#9ca3af;';
          rw.appendChild(rateI); rw.appendChild(rl); rateTd.appendChild(rw);
          const hoursTd = tr.insertCell(); hoursTd.style.cssText = 'padding:6px 10px;';
          const hw = document.createElement('div'); hw.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const hoursI = document.createElement('input'); hoursI.type = 'number'; hoursI.min = '0'; hoursI.max = '24'; hoursI.step = '0.5'; hoursI.value = member.hours ?? 8;
          hoursI.className = 'mini-input'; hoursI.style.width = '44px';
          hoursI.addEventListener('input', () => { member.hours = parseFloat(hoursI.value) || 0; _updateOneChangeOrderCalc(co); });
          const hl = document.createElement('span'); hl.textContent = 'hrs'; hl.style.cssText = 'font-size:11px;color:#9ca3af;';
          hw.appendChild(hoursI); hw.appendChild(hl); hoursTd.appendChild(hw);
          const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:6px 10px;text-align:right;';
          const daysI = document.createElement('input'); daysI.type = 'number'; daysI.min = '0'; daysI.step = '0.5'; daysI.value = member.days;
          daysI.className = 'mini-input'; daysI.style.width = '56px';
          daysI.addEventListener('input', () => { member.days = parseFloat(daysI.value) || 0; _updateOneChangeOrderCalc(co); });
          daysTd.appendChild(daysI);
          const payTd = tr.insertCell(); payTd.id = `co_pay_${member._uid}`;
          payTd.style.cssText = 'padding:6px 10px;text-align:right;color:#374151;font-weight:600;white-space:nowrap;';
          payTd.textContent = fmt$((member.rate || 0) * (member.hours ?? 8) * (member.days || 0));
          const delTd = tr.insertCell(); delTd.style.cssText = 'padding:6px 8px;text-align:right;';
          const delMBtn = document.createElement('button'); delMBtn.type = 'button';
          delMBtn.className = 'mini-btn icon-btn danger';
          delMBtn.title = 'Remove crew member';
          delMBtn.setAttribute('aria-label', 'Remove crew member');
          delMBtn.innerHTML = TRASH_ICON_SVG;
          delMBtn.onclick = () => { co.crew.splice(co.crew.indexOf(member), 1); _renderChangeOrders(); };
          delTd.appendChild(delMBtn);
        });
        table.appendChild(tbody); section.appendChild(table);
      } else {
        const empty = document.createElement('div');
        empty.textContent = 'No crew — add a role above';
        empty.style.cssText = 'padding:10px 12px;color:#9ca3af;font-size:12px;';
        section.appendChild(empty);
      }

      // Bottom: materials inputs + summary
      const bottom = document.createElement('div');
      bottom.style.cssText = 'padding:12px;background:#fafbfc;border-top:1px solid #eef1f5;';
      const matRow = document.createElement('div'); matRow.style.cssText = 'display:flex;gap:16px;margin-bottom:10px;';
      const mkMat = (label, key) => {
        const wrap = document.createElement('div');
        const lbl = document.createElement('label'); lbl.textContent = label;
        lbl.style.cssText = 'display:block;font-size:10px;color:#6b7280;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;';
        const inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.step = '0.01'; inp.placeholder = '0.00';
        inp.value = co[key] ?? ''; inp.id = `co_${co.id}_${key}`;
        inp.className = 'mini-input'; inp.style.width = '120px';
        inp.addEventListener('input', () => { co[key] = parseFloat(inp.value) || 0; _updateOneChangeOrderCalc(co); });
        wrap.appendChild(lbl); wrap.appendChild(inp); return wrap;
      };
      matRow.appendChild(mkMat('Materials ($)', 'materials'));
      matRow.appendChild(mkMat('Materials GC ($)', 'materials_gc'));
      bottom.appendChild(matRow);
      const summaryDiv = document.createElement('div'); summaryDiv.id = `co_summary_${co.id}`;
      bottom.appendChild(summaryDiv);
      section.appendChild(bottom);
      container.appendChild(section);
      _updateOneChangeOrderCalc(co);
    });
  }

  function showChangeOrderCard(projData) {
    const card = document.getElementById('changeOrderCard');
    if (!card) return;
    const bd = projData?.labor_breakdown;
    const saved = bd?.change_orders || [];
    _changeOrders = saved.map(co => ({
      ...co,
      crew: (co.crew || []).map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) })),
    }));
    // Migrate old single change_order format
    if (_changeOrders.length === 0 && bd?.change_order?.crew?.length > 0) {
      const old = bd.change_order;
      _changeOrders = [{ id: Math.random().toString(36).slice(2), name: 'Change Order #1',
        crew: old.crew.map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) })),
        materials: old.materials || 0, materials_gc: old.materials_gc || 0 }];
    }
    _renderChangeOrders();
    // Not this function's job to touch card.style.display — it's a tab
    // panel now, and _setChangeOrderSovTab is the only thing that should
    // set that (see its comment). This used to set it too; harmless since
    // the one call site already runs right after _setChangeOrderSovTab
    // sets the same panel visible, but redundant, so dropped.
  }

  // ======================================================
  // MOBILE: SCROLLABLE TABLE WRAPPER
  // ======================================================
  // These phase/crew tables have a fixed set of nowrap columns, so on a
  // narrow phone they'd otherwise squeeze/overlap. Wrap them so they
  // scroll horizontally instead.
  function _scrollX(el){
    const wrap = document.createElement('div');
    wrap.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';
    wrap.appendChild(el);
    return wrap;
  }

  function _renderPhaseTable() {
    const container = document.getElementById('phaseTableContainer');
    if (!container) return;
    container.innerHTML = '';

    if (_phasesLocked) {
      const rates = _getRates();
      PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach((pid, i) => {
        const actualIdx = PHASE_IDS.indexOf(pid);
        const crew = _phaseCrews[pid] || [];
        const phaseMat = _phaseMaterials[pid] || 0;
        const c = _calcPhase({ crew, materials: phaseMat }, rates);
        const days = crew.length > 0 ? Math.max(...crew.map(m => m.days || 0)) : 0;
        const cleaners = crew.filter(m => m.role === 'cleaner').length;
        const foremen = crew.filter(m => m.role === 'foreman').length;
        const pms = crew.filter(m => m.role === 'project_manager').length;

        const details = document.createElement('details');
        details.style.cssText = 'margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';
        details.open = true;
        const summary = document.createElement('summary');
        summary.style.cssText = 'list-style:none;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;cursor:pointer;font-size:13px;font-weight:600;color:#374151;';
        const nameEl = document.createElement('span');
        nameEl.textContent = PHASES[actualIdx];
        nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#374151;';
        const summaryMeta = document.createElement('span');
        const parts = [];
        if (cleaners) parts.push(`${cleaners} Cleaner${cleaners > 1 ? 's' : ''}`);
        if (foremen) parts.push(`${foremen} Foreman`);
        if (pms) parts.push(`${pms} PM`);
        summaryMeta.textContent = `${parts.join(', ')} · ${days} day${days !== 1 ? 's' : ''} · Labor: ${fmt$(c.laborCost)}`;
        summaryMeta.style.cssText = 'font-size:12px;color:#6b7280;';
        summary.appendChild(nameEl); summary.appendChild(summaryMeta);
        details.appendChild(summary);

        const body = document.createElement('div');
        body.style.cssText = 'border-top:1px solid #e5e7eb;';

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
        const leftGroup = document.createElement('div');
        leftGroup.style.cssText = 'display:flex;align-items:center;';
        const addBtns = document.createElement('div');
        addBtns.style.cssText = 'display:flex;gap:6px;';
        const mkAddBtn = (label, role, color, bg, border, defaultRate) => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.textContent = label;
          btn.style.cssText = `padding:3px 8px;border:1px solid ${border};border-radius:4px;background:${bg};color:${color};font-size:11px;cursor:pointer;`;
          btn.onclick = () => {
            const newMember = { role, rate: defaultRate, hours: 8, days: 1, _uid: Math.random().toString(36).slice(2) };
            _phaseCrews[pid].push(newMember);
            _renderPhaseTable();
          };
          return btn;
        };
        addBtns.appendChild(mkAddBtn('+ Cleaner', 'cleaner', '#2563eb', '#eff6ff', '#93c5fd', parseFloat(document.getElementById('cleanerRateInput')?.value) || _rate('cleanerRateCents')));
        addBtns.appendChild(mkAddBtn('+ Foreman', 'foreman', '#16a34a', '#f0fdf4', '#86efac', parseFloat(document.getElementById('foremanRateInput')?.value) || _rate('foremanRateCents')));
        addBtns.appendChild(mkAddBtn('+ Assistant', 'assistant', '#d97706', '#fffbeb', '#fcd34d', _rate('assistantRateCents')));
        addBtns.appendChild(mkAddBtn('+ Painter', 'painter', '#dc2626', '#fef2f2', '#fca5a5', _rate('painterRateCents')));
        addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', _rate('projectManagerRateCents')));
        const delPhaseBtn = document.createElement('button');
        delPhaseBtn.type = 'button'; delPhaseBtn.textContent = 'Delete Phase';
        delPhaseBtn.style.cssText = 'padding:3px 8px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:11px;cursor:pointer;margin-left:8px;';
        delPhaseBtn.onclick = () => {
          _deletedPhaseIds.add(pid);
          _renderPhaseTable();
          _updateCrewCalcs();
          renderSovCard();
        };
        leftGroup.appendChild(delPhaseBtn);
        header.appendChild(leftGroup); header.appendChild(addBtns);
        body.appendChild(header);

        const iStyle = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;';
        if (crew.length === 0) {
          const empty = document.createElement('div');
          empty.textContent = 'No crew — add a cleaner or foreman above';
          empty.style.cssText = 'padding:12px;text-align:center;color:#9ca3af;font-size:12px;';
          body.appendChild(empty);
        } else {
          const table = document.createElement('table');
          table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
          const thead = table.createTHead();
          const hrow = thead.insertRow();
          ['Role', 'Name', 'Rate', 'Hrs', 'Days', 'Pay', ''].forEach((h, hi) => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = `text-align:${hi >= 4 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
            hrow.appendChild(th);
          });
          const roleOrder = { cleaner: 0, foreman: 1, assistant: 2, painter: 3, project_manager: 4 };
          const sortedCrew = [...crew].sort((a, b) => (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1));
          const tbody = table.createTBody();
          sortedCrew.forEach((member, idx) => {
            const tr = tbody.insertRow();
            tr.style.cssText = 'border-top:1px solid #f3f4f6;';
            const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:5px 10px;';
            const badge = document.createElement('span');
            const roleLabels = { cleaner: 'Cleaner', foreman: 'Foreman', assistant: 'Assistant', painter: 'Painter', project_manager: 'Project Manager' };
            const roleColors = {
              cleaner: 'background:#eff6ff;color:#2563eb;', foreman: 'background:#f0fdf4;color:#16a34a;',
              assistant: 'background:#fffbeb;color:#d97706;', painter: 'background:#fef2f2;color:#dc2626;',
              project_manager: 'background:#f5f3ff;color:#7c3aed;',
            };
            badge.textContent = roleLabels[member.role] || member.role;
            badge.style.cssText = `padding:2px 7px;border-radius:10px;${roleColors[member.role] || 'background:#f3f4f6;color:#374151;'};font-size:11px;font-weight:500;`;
            roleTd.appendChild(badge);
            const nameTd = tr.insertCell(); nameTd.style.cssText = 'padding:4px 10px;';
            const nameInput = document.createElement('input');
            nameInput.type = 'text'; nameInput.placeholder = 'Name'; nameInput.value = member.name || '';
            nameInput.style.cssText = iStyle + 'width:100px;';
            nameInput.addEventListener('input', () => { member.name = nameInput.value.trim(); });
            nameTd.appendChild(nameInput);
            const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:4px 10px;';
            const rateWrap = document.createElement('div'); rateWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const rateInput = document.createElement('input');
            rateInput.type = 'number'; rateInput.min = '0'; rateInput.step = '0.01'; rateInput.value = member.rate;
            rateInput.style.cssText = iStyle + 'width:64px;';
            rateInput.addEventListener('input', () => { member.rate = parseFloat(rateInput.value) || 0; _updateCrewCalcs(); });
            const rateLabel = document.createElement('span');
            rateLabel.textContent = '$/hr'; rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
            rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel);
            rateTd.appendChild(rateWrap);
            const hoursTd = tr.insertCell(); hoursTd.style.cssText = 'padding:4px 10px;';
            const hoursWrap = document.createElement('div'); hoursWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const hoursInput = document.createElement('input');
            hoursInput.type = 'number'; hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5'; hoursInput.value = member.hours ?? 8;
            hoursInput.style.cssText = iStyle + 'width:44px;';
            hoursInput.addEventListener('input', () => { member.hours = parseFloat(hoursInput.value) || 0; _updateCrewCalcs(); });
            const hoursLabel = document.createElement('span');
            hoursLabel.textContent = 'hrs'; hoursLabel.style.cssText = 'font-size:11px;color:#6b7280;';
            hoursWrap.appendChild(hoursInput); hoursWrap.appendChild(hoursLabel); hoursTd.appendChild(hoursWrap);
            const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
            const daysInput = document.createElement('input');
            daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
            daysInput.style.cssText = iStyle + 'width:56px;';
            daysInput.addEventListener('input', () => { member.days = parseFloat(daysInput.value) || 0; _updateCrewCalcs(); });
            daysTd.appendChild(daysInput);
            const payTd = tr.insertCell();
            payTd.id = `crew_pay_${member._uid || idx}`;
            payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
            const pay = (member.rate||0)*(member.hours??8)*(member.days||0); payTd.textContent = fmt$(pay);
            const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
            const delBtn = document.createElement('button');
            delBtn.type = 'button'; delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
            delBtn.onclick = () => { const realIdx = _phaseCrews[pid].indexOf(member); if (realIdx !== -1) _phaseCrews[pid].splice(realIdx, 1); _renderPhaseTable(); };
            delTd.appendChild(delBtn);
          });
          table.appendChild(tbody); body.appendChild(_scrollX(table));
        }
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:16px;padding:6px 12px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;flex-wrap:wrap;';
        [
          ['Cleaners Pay', `phase_cleaners_${pid}`],
          ['Foreman Pay', `phase_foreman_${pid}`],
          ['Assistant Pay', `phase_assistant_${pid}`],
          ['Painter Pay', `phase_painter_${pid}`],
          ['PM Pay', `phase_pm_${pid}`],
          ['Labor', `phase_labor_${pid}`],
          ['Labor', `phase_subtotal_${pid}`],
        ].forEach(([label, id]) => {
          const span = document.createElement('span');
          span.innerHTML = `${label}: <strong id="${id}" style="color:#374151;">$0.00</strong>`;
          footer.appendChild(span);
        });
        body.appendChild(footer);

        const matRow = document.createElement('div');
        matRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid #f3f4f6;font-size:12px;';
        const matLabel = document.createElement('label');
        matLabel.textContent = 'Materials ($):';
        matLabel.style.cssText = 'color:#6b7280;white-space:nowrap;';
        const matInput = document.createElement('input');
        matInput.type = 'number';
        matInput.min = '0';
        matInput.step = '0.01';
        matInput.value = Number.isFinite(phaseMat) ? phaseMat : 0;
        matInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:12px;width:120px;outline:none;';
        matInput.addEventListener('input', () => {
          _phaseMaterials[pid] = parseFloat(matInput.value) || 0;
          _analysisMaterialsManual = false;
          const totalPhaseMaterials = PHASE_IDS.filter(activePid => !_deletedPhaseIds.has(activePid))
            .reduce((sum, activePid) => sum + (_phaseMaterials[activePid] || 0), 0);
          const materialsInput = document.getElementById('materialsInput');
          if (materialsInput) materialsInput.value = totalPhaseMaterials.toFixed(2);
          _updateCrewCalcs();
        });
        matRow.appendChild(matLabel);
        matRow.appendChild(matInput);
        body.appendChild(matRow);
        details.appendChild(body);
        container.appendChild(details);
      });
      _updateCrewCalcs();
      return;
    }

    const iStyle = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;';

    // Lock button at top when in edit mode
    const lockBar = document.createElement('div');
    lockBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button'; lockBtn.textContent = 'Done Editing';
    lockBtn.style.cssText = 'padding:4px 12px;border:1px solid #86efac;border-radius:6px;background:white;color:#16a34a;font-size:12px;cursor:pointer;';
    lockBtn.onclick = () => { _phasesLocked = true; _renderPhaseTable(); };
    lockBar.appendChild(lockBtn);
    container.appendChild(lockBar);

    PHASE_IDS.forEach((pid, i) => {
      if (_deletedPhaseIds.has(pid)) {
        // Render collapsed row with restore button
        const collapsed = document.createElement('div');
        collapsed.style.cssText = 'margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;opacity:0.5;';
        const collapsedHeader = document.createElement('div');
        collapsedHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;';
        const collapsedName = document.createElement('span');
        collapsedName.textContent = PHASES[i] + ' (removed)';
        collapsedName.style.cssText = 'font-weight:600;font-size:13px;color:#9ca3af;';
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button'; restoreBtn.textContent = 'Restore';
        restoreBtn.style.cssText = 'padding:3px 10px;border:1px solid #6ee7b7;border-radius:4px;background:white;color:#059669;font-size:11px;cursor:pointer;';
        restoreBtn.onclick = () => {
          _deletedPhaseIds.delete(pid);
          _renderPhaseTable();
          _updateCrewCalcs();
          renderSovCard();
        };
        collapsedHeader.appendChild(collapsedName); collapsedHeader.appendChild(restoreBtn);
        collapsed.appendChild(collapsedHeader);
        container.appendChild(collapsed);
        return;
      }

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
          const newMember = { role, rate: defaultRate, hours: 8, days: 1, _uid: Math.random().toString(36).slice(2) };
          _phaseCrews[pid].push(newMember);
          _renderPhaseTable();
        };
        return btn;
      };
      addBtns.appendChild(mkAddBtn('+ Cleaner', 'cleaner', '#2563eb', '#eff6ff', '#93c5fd', parseFloat(document.getElementById('cleanerRateInput')?.value) || _rate('cleanerRateCents')));
      addBtns.appendChild(mkAddBtn('+ Foreman', 'foreman', '#16a34a', '#f0fdf4', '#86efac', parseFloat(document.getElementById('foremanRateInput')?.value) || _rate('foremanRateCents')));
      addBtns.appendChild(mkAddBtn('+ Assistant', 'assistant', '#d97706', '#fffbeb', '#fcd34d', _rate('assistantRateCents')));
      addBtns.appendChild(mkAddBtn('+ Painter', 'painter', '#dc2626', '#fef2f2', '#fca5a5', _rate('painterRateCents')));
      addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', _rate('projectManagerRateCents')));

      const delPhaseBtn = document.createElement('button');
      delPhaseBtn.type = 'button'; delPhaseBtn.textContent = 'Delete Phase';
      delPhaseBtn.style.cssText = 'padding:3px 8px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:11px;cursor:pointer;margin-left:8px;';
      delPhaseBtn.onclick = () => {
        _deletedPhaseIds.add(pid);
        _renderPhaseTable();
        _updateCrewCalcs();
        renderSovCard();
      };

      const leftGroup = document.createElement('div');
      leftGroup.style.cssText = 'display:flex;align-items:center;';
      leftGroup.appendChild(nameEl); leftGroup.appendChild(delPhaseBtn);
      header.appendChild(leftGroup); header.appendChild(addBtns);
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
        ['Role', 'Name', 'Rate', 'Hrs', 'Days', 'Pay', ''].forEach((h, hi) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${hi >= 4 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
          hrow.appendChild(th);
        });
        const roleOrder = { cleaner: 0, foreman: 1, assistant: 2, painter: 3, project_manager: 4 };
        const sortedCrew = [...crew].sort((a, b) => (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1));
        const tbody = table.createTBody();
        sortedCrew.forEach((member, idx) => {
          const tr = tbody.insertRow();
          tr.style.cssText = 'border-top:1px solid #f3f4f6;';

          const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:5px 10px;';
          const badge = document.createElement('span');
          const _phaseRoleLabels = { cleaner: 'Cleaner', foreman: 'Foreman', assistant: 'Assistant', painter: 'Painter', project_manager: 'Project Manager' };
          const _phaseRoleColors = {
            cleaner: 'background:#eff6ff;color:#2563eb;', foreman: 'background:#f0fdf4;color:#16a34a;',
            assistant: 'background:#fffbeb;color:#d97706;', painter: 'background:#fef2f2;color:#dc2626;',
            project_manager: 'background:#f5f3ff;color:#7c3aed;',
          };
          badge.textContent = _phaseRoleLabels[member.role] || member.role;
          badge.style.cssText = `padding:2px 7px;border-radius:10px;${_phaseRoleColors[member.role] || 'background:#f3f4f6;color:#374151;'};font-size:11px;font-weight:500;`;
          roleTd.appendChild(badge);

          const nameTd = tr.insertCell(); nameTd.style.cssText = 'padding:4px 10px;';
          const nameInput = document.createElement('input');
          nameInput.type = 'text'; nameInput.placeholder = 'Name'; nameInput.value = member.name || '';
          nameInput.style.cssText = iStyle + 'width:100px;';
          nameInput.addEventListener('input', () => { member.name = nameInput.value.trim(); });
          nameTd.appendChild(nameInput);

          const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:4px 10px;';
          const rateWrap = document.createElement('div'); rateWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const rateInput = document.createElement('input');
          rateInput.type = 'number'; rateInput.min = '0'; rateInput.step = '0.01'; rateInput.value = member.rate;
          rateInput.style.cssText = iStyle + 'width:64px;';
          rateInput.addEventListener('input', () => { member.rate = parseFloat(rateInput.value) || 0; _updateCrewCalcs(); });
          const rateLabel = document.createElement('span');
          rateLabel.textContent = '$/hr';
          rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
          rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel);
          rateTd.appendChild(rateWrap);

          const hoursTd = tr.insertCell(); hoursTd.style.cssText = 'padding:4px 10px;';
          const hoursWrap = document.createElement('div'); hoursWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const hoursInput = document.createElement('input');
          hoursInput.type = 'number'; hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5';
          hoursInput.value = member.hours ?? 8;
          hoursInput.style.cssText = iStyle + 'width:44px;';
          hoursInput.addEventListener('input', () => { member.hours = parseFloat(hoursInput.value) || 0; _updateCrewCalcs(); });
          const hoursLabel = document.createElement('span');
          hoursLabel.textContent = 'hrs';
          hoursLabel.style.cssText = 'font-size:11px;color:#6b7280;';
          hoursWrap.appendChild(hoursInput); hoursWrap.appendChild(hoursLabel);
          hoursTd.appendChild(hoursWrap);

          const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
          const daysInput = document.createElement('input');
          daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
          daysInput.style.cssText = iStyle + 'width:56px;';
          daysInput.addEventListener('input', () => { member.days = parseFloat(daysInput.value) || 0; _updateCrewCalcs(); });
          daysTd.appendChild(daysInput);

          const payTd = tr.insertCell();
          payTd.id = `crew_pay_${member._uid || idx}`;
          payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
          const pay = (member.rate||0)*(member.hours??8)*(member.days||0);
          payTd.textContent = fmt$(pay);

          const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
          const delBtn = document.createElement('button');
          delBtn.type = 'button'; delBtn.textContent = '\u00d7';
          delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
          delBtn.onclick = () => { const realIdx = _phaseCrews[pid].indexOf(member); if (realIdx !== -1) _phaseCrews[pid].splice(realIdx, 1); _renderPhaseTable(); };
          delTd.appendChild(delBtn);
        });
        table.appendChild(tbody);
        section.appendChild(_scrollX(table));
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;gap:16px;padding:6px 12px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;flex-wrap:wrap;';
      [
        ['Cleaners Pay', `phase_cleaners_${pid}`],
        ['Foreman Pay', `phase_foreman_${pid}`],
        ['Assistant Pay', `phase_assistant_${pid}`],
        ['Painter Pay', `phase_painter_${pid}`],
        ['PM Pay', `phase_pm_${pid}`],
        ['Labor', `phase_labor_${pid}`],
        ['Labor', `phase_subtotal_${pid}`],
      ].forEach(([label, id]) => {
        const span = document.createElement('span');
        span.innerHTML = `${label}: <strong id="${id}" style="color:#374151;">$0.00</strong>`;
        footer.appendChild(span);
      });
      section.appendChild(footer);

      // Materials input row per phase
      const matRow = document.createElement('div');
      matRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid #f3f4f6;font-size:12px;';
      const matLabel = document.createElement('label');
      matLabel.textContent = 'Materials ($):';
      matLabel.style.cssText = 'color:#6b7280;white-space:nowrap;';
      const matInput = document.createElement('input');
      matInput.type = 'number'; matInput.min = '0'; matInput.step = '0.01';
      matInput.value = _phaseMaterials[pid] || 0;
      matInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:12px;width:120px;outline:none;';
      matInput.addEventListener('input', () => {
        _phaseMaterials[pid] = parseFloat(matInput.value) || 0;
        _analysisMaterialsManual = false;
        const totalPhaseMaterials = PHASE_IDS.filter(activePid => !_deletedPhaseIds.has(activePid))
          .reduce((sum, activePid) => sum + (_phaseMaterials[activePid] || 0), 0);
        const materialsInput = document.getElementById('materialsInput');
        if (materialsInput) materialsInput.value = totalPhaseMaterials.toFixed(2);
        _updateCrewCalcs();
      });
      matRow.appendChild(matLabel); matRow.appendChild(matInput);
      section.appendChild(matRow);

      container.appendChild(section);
    });

    ['overheadInput', 'profitInput', 'taxInput', 'commissionInput', 'materialsInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updateCrewCalcs);
    });

    _updateCrewCalcs();
  }

  // ── Painting phases ────────────────────────────────────────────────────────

  function _getPaintingRates() {
    return {
      overhead: (parseFloat(document.getElementById('paintingOverheadInput')?.value) || 0) / 100,
      profit:   (parseFloat(document.getElementById('paintingProfitInput')?.value) || 0) / 100,
      tax:      (parseFloat(document.getElementById('paintingTaxInput')?.value) || 0) / 100,
      commission: (parseFloat(document.getElementById('paintingCommissionInput')?.value) || 0) / 100,
    };
  }

  function _syncPaintingMaterialsInputFromPhases() {
    const materialsInput = document.getElementById('paintingMaterialsInput');
    if (!materialsInput) return;

    const activePhaseIds = PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid));
    const totalPhaseMaterials = activePhaseIds.reduce((sum, pid) => sum + (parseFloat(_paintingPhaseMaterials[pid]) || 0), 0);
    if (!_paintingMaterialsManual) {
      materialsInput.value = totalPhaseMaterials.toFixed(2);
    }

    document.querySelectorAll('[data-painting-phase-material-input]').forEach(el => {
      const pid = el.dataset.paintingPhasePid;
      if (!pid) return;
      const phaseValue = Number.isFinite(parseFloat(_paintingPhaseMaterials[pid])) ? parseFloat(_paintingPhaseMaterials[pid]) : 0;
      el.value = phaseValue.toFixed(2);
    });
  }

  function _updatePaintingCrewCalcs() {
    const rates = _getPaintingRates();
    const overheadPct = parseFloat(document.getElementById('paintingOverheadInput')?.value) || 0;
    const profitPct   = parseFloat(document.getElementById('paintingProfitInput')?.value) || 0;
    const taxPct      = parseFloat(document.getElementById('paintingTaxInput')?.value) || 0;
    const commPct     = parseFloat(document.getElementById('paintingCommissionInput')?.value) || 0;

    const activePhaseIds = PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid));
    const totalPhaseMaterials = activePhaseIds.reduce((sum, pid) => sum + (parseFloat(_paintingPhaseMaterials[pid]) || 0), 0);
    const materialsInput = document.getElementById('paintingMaterialsInput');
    const totalArea = parseFloat(document.getElementById('paintingTotalAreaInput')?.value) || 0;
    const derivedMaterials = _getPaintingAreaDerivedValues(totalArea).materials;
    const materialsForPricing = Number.isFinite(parseFloat(materialsInput?.value))
      ? parseFloat(materialsInput.value)
      : derivedMaterials;

    let totLabor = 0, totSubtotal = 0, totOh = 0, totPft = 0, totPrice = 0, totTaxes = 0, totComm = 0, totFinal = 0;
    let phaseMaterialsTotal = 0;

    PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid)).forEach(pid => {
      const crew = _paintingPhaseCrews[pid] || [];
      const phaseMat = _paintingPhaseMaterials[pid] || 0;
      const c = _calcPhase({ crew, materials: phaseMat }, rates);
      phaseMaterialsTotal += phaseMat;
      totLabor += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
      totPft += c.pft; totPrice += c.price; totTaxes += c.taxes; totComm += c.comm; totFinal += c.finalPrice;

      crew.forEach(m => {
        const pay = (m.rate||0)*(m.hours??8)*(m.days||0);
        const el = document.getElementById(`pcrew_pay_${m._uid}`);
        if (el) el.textContent = fmt$(pay);
      });

      const setFoot = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt$(val); };
      setFoot(`pphase_foreman_${pid}`, c.foremanPay);
      setFoot(`pphase_assistant_${pid}`, c.assistantPay);
      setFoot(`pphase_painter_${pid}`, c.painterPay);
      setFoot(`pphase_pm_${pid}`, c.pmPay);
      setFoot(`pphase_labor_${pid}`, c.laborCost);
      setFoot(`pphase_subtotal_${pid}`, c.subtotal);
    });

    const gasInput = document.getElementById('paintingGasolineInput');
    // Ensure painting mobilizations are in-sync before deriving gasoline
    try { _syncPaintingMobilizations(); } catch (e) { /* ignore */ }
    const pMobilizationsInputEl = document.getElementById('paintingMobilizationsInput');
    const pMobilizationsVal = parseFloat(pMobilizationsInputEl?.value) || 0;
    const convertedDistance = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
    const gasCost = gasInput && gasInput.dataset.manual === 'true'
      ? (parseFloat(gasInput.value) || 0)
      : _getDistanceDerivedGasoline(convertedDistance || '', pMobilizationsVal);
    const taxBase = totSubtotal + materialsForPricing + gasCost + totOh + totPft + totComm;
    const totTax = taxBase * (taxPct / 100);
    const totFinalActual = taxBase + totTax;

    const summaryContainer = document.getElementById('paintingCalcSummaryContainer');
    if (summaryContainer) {
      summaryContainer.innerHTML = '';
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;margin-top:8px;';
      [
        [`Labor`, totSubtotal],
        [`Materials`, materialsForPricing],
        [`Overhead (${overheadPct}%)`, totOh],
        [`Profit (${profitPct}%)`, totPft],
        [`Tax (${taxPct}%)`, totTax],
        [`Commission (${commPct}%)`, totComm],
        [`Final Price`, totFinalActual],
      ].forEach(([label, val], i) => {
        const isLast = i === 6;
        const item = document.createElement('div');
        item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#16a34a' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
        grid.appendChild(item);
      });
      summaryContainer.appendChild(grid);
    }

    _syncPaintingMobilizations();

    _updatePaintingTransportCosts();

    if (!_paintingExpectedDaysManual) {
      const totalDays = _getPaintingExpectedDaysFromPhases();
      const daysEl = document.getElementById('paintingExpectedDaysInput');
      if (daysEl) {
        const previousDays = parseFloat(daysEl.value) || 0;
        const newDays = totalDays > 0 ? totalDays : '';
        if (previousDays !== newDays) {
          const mobilizationsInput = document.getElementById('paintingMobilizationsInput');
          const isManualMobilizations = mobilizationsInput?.dataset.manual === 'true' || (mobilizationsInput?.value ?? '') !== '';
          if (mobilizationsInput && !isManualMobilizations) {
            mobilizationsInput.dataset.manual = 'false';
          }
        }
        daysEl.value = newDays;
      }
      _syncPaintingMobilizations();
    }
  }

  function _renderPaintingPhaseTable() {
    const container = document.getElementById('paintingPhaseTableContainer');
    if (!container) return;
    container.innerHTML = '';

    const iStyle = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;';

    const appendMaterialSubsection = (section, phaseIndex) => {
      const isPrimer = phaseIndex === 0;
      const title = isPrimer ? 'Primer Materials' : 'Paint Materials';
      const gallonsId = isPrimer ? 'paintingPrimerGallonsDisplay' : 'paintingPaintGallonsDisplay';
      const costId = isPrimer ? 'paintingPrimerCostDisplay' : 'paintingPaintCostDisplay';
      const detailMarkup = isPrimer ? `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Primer Required</label>
            <select id="paintingPrimerRequiredSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Primer Type</label>
            <select id="paintingPrimerTypeSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="none">None</option>
              <option value="standard_commercial">Standard Commercial: $30/gal</option>
              <option value="commercial_acrylic">Commercial Acrylic: $40/gal</option>
              <option value="high_build">High-Build: $50/gal</option>
              <option value="stain_blocking">Stain-Blocking: $55/gal</option>
              <option value="metal_corrosion">Metal/Corrosion: $60/gal</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Primer Coats</label>
            <select id="paintingPrimerCoatsSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="1">1 coat</option>
              <option value="2">2 coats</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Primer Application</label>
            <select id="paintingPrimerApplicationMethodSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="roller">Roller</option>
              <option value="brush">Brush</option>
              <option value="airless">Airless Spray</option>
            </select>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Primer Gallons</div>
            <div id="paintingPrimerGallonsDetailDisplay" class="text-gray-900 font-semibold">—</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Primer Cost</div>
            <div id="paintingPrimerCostDetailDisplay" class="text-gray-900 font-semibold">—</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-3 xl:col-span-2">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Consumables & PPE Cost</div>
            <div id="paintingConsumablesCostDisplay" class="text-gray-900 font-semibold">—</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-green-50 p-3 xl:col-span-2">
            <div class="text-xs text-green-700 uppercase tracking-wide mb-1">Total Materials Cost</div>
            <div id="paintingTotalMaterialsCostDisplay" class="text-green-900 font-semibold text-lg">—</div>
          </div>
        </div>` : `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Coats</label>
            <select id="paintingCoatsSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="1">1 coat</option>
              <option value="2">2 coats</option>
              <option value="3">3 coats</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Application Method</label>
            <select id="paintingApplicationMethodSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="roller">Roller</option>
              <option value="brush">Brush</option>
              <option value="airless">Airless Spray</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Paint Quality</label>
            <div class="flex gap-2 items-end">
              <select id="paintingPaintQualitySelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
                <option value="economy">Economy: $32/gal</option>
                <option value="standard">Standard: $45/gal</option>
                <option value="premium">Premium: $60/gal</option>
                <option value="ultra">Ultra Premium: $75/gal</option>
                <option value="custom">Custom</option>
              </select>
              <input id="paintingPaintQualityCustomInput" type="number" min="0" step="0.01" placeholder="$/gal" class="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-green-400" style="opacity:0.6;" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Surface Condition</label>
            <select id="paintingSurfaceConditionSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="smooth">Smooth</option>
              <option value="normal">Normal</option>
              <option value="rough">Rough</option>
              <option value="very_rough">Very Rough</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Finish Type</label>
            <select id="paintingFinishTypeSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="flat">Flat</option>
              <option value="matte">Matte</option>
              <option value="eggshell">Eggshell</option>
              <option value="satin">Satin</option>
              <option value="semi_gloss">Semi-Gloss</option>
              <option value="gloss">Gloss</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Color Depth</label>
            <select id="paintingColorDepthSelect" class="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
              <option value="white_light">White / Light</option>
              <option value="medium">Medium</option>
              <option value="dark">Dark</option>
              <option value="very_dark">Very Dark / Accent</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Paint Gallons</div>
            <div id="paintingPaintGallonsDetailDisplay" class="text-gray-900 font-semibold">—</div>
          </div>
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Paint Cost</div>
            <div id="paintingPaintCostDetailDisplay" class="text-gray-900 font-semibold">—</div>
          </div>
        </div>`;

      const details = document.createElement('details');
      details.style.cssText = 'margin:8px 12px 12px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';
      details.innerHTML = `
        <summary style="list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;background:#f9fafb;cursor:pointer;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">
          <span>${title}</span>
          <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#4b5563;font-weight:500;">
            <span style="display:inline-flex;align-items:center;gap:4px;border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:2px 6px;">
              Gallons: <span id="${gallonsId}" style="color:#111827;font-weight:700;">—</span>
            </span>
            <span style="display:inline-flex;align-items:center;gap:4px;border:1px solid #e5e7eb;background:#fff;border-radius:6px;padding:2px 6px;">
              Cost: <span id="${costId}" style="color:#111827;font-weight:700;">—</span>
            </span>
          </div>
        </summary>
        <div style="border-top:1px solid #e5e7eb;padding:12px;">
          ${detailMarkup}
        </div>
      `;
      section.appendChild(details);
    };

    if (_paintingPhasesLocked) {
      const rates = _getPaintingRates();
      PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid)).forEach((pid, i) => {
        const crew = _paintingPhaseCrews[pid] || [];
        const c = _calcPhase({ crew }, rates);
        const days = crew.length > 0 ? Math.max(...crew.map(m => m.days || 0)) : 0;
        const painters  = crew.filter(m => m.role === 'painter').length;
        const foremen   = crew.filter(m => m.role === 'foreman').length;
        const assistants = crew.filter(m => m.role === 'assistant').length;
        const pms = crew.filter(m => m.role === 'project_manager').length;

        const details = document.createElement('details');
        details.style.cssText = 'margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';
        details.open = true;
        const summary = document.createElement('summary');
        summary.style.cssText = 'list-style:none;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;cursor:pointer;font-size:13px;font-weight:600;color:#374151;';
        const nameEl = document.createElement('span');
        nameEl.textContent = PAINTING_PHASES[PAINTING_PHASE_IDS.indexOf(pid)];
        nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#374151;';
        const parts = [];
        if (painters) parts.push(`${painters} Painter${painters > 1 ? 's' : ''}`);
        if (foremen) parts.push(`${foremen} Foreman`);
        if (assistants) parts.push(`${assistants} Assistant${assistants > 1 ? 's' : ''}`);
        if (pms) parts.push(`${pms} PM${pms > 1 ? 's' : ''}`);
        const summaryMeta = document.createElement('span');
        summaryMeta.textContent = `${parts.join(', ')} · ${days} day${days !== 1 ? 's' : ''} · Labor: ${fmt$(c.laborCost)}`;
        summaryMeta.style.cssText = 'font-size:12px;color:#6b7280;';
        summary.appendChild(nameEl); summary.appendChild(summaryMeta);
        details.appendChild(summary);

        const body = document.createElement('div');
        body.style.cssText = 'border-top:1px solid #e5e7eb;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
        const leftGroup = document.createElement('div');
        leftGroup.style.cssText = 'display:flex;align-items:center;';
        const addBtns = document.createElement('div');
        addBtns.style.cssText = 'display:flex;gap:6px;';
        const mkAddBtn = (label, role, color, bg, border, defaultRate) => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.textContent = label;
          btn.style.cssText = `padding:3px 8px;border:1px solid ${border};border-radius:4px;background:${bg};color:${color};font-size:11px;cursor:pointer;`;
          btn.onclick = () => {
            _paintingPhaseCrews[pid].push({ role, rate: defaultRate, hours: 8, days: 1, _uid: Math.random().toString(36).slice(2) });
            if (!_paintingExpectedDaysManual) _refreshPaintingDays();
            _renderPaintingPhaseTable();
            _updatePaintingCrewCalcs();
          };
          return btn;
        };
        addBtns.appendChild(mkAddBtn('+ Foreman', 'foreman', '#16a34a', '#f0fdf4', '#86efac', _rate('foremanRateCents')));
        addBtns.appendChild(mkAddBtn('+ Assistant', 'assistant', '#d97706', '#fffbeb', '#fcd34d', _rate('assistantRateCents')));
        addBtns.appendChild(mkAddBtn('+ Painter', 'painter', '#dc2626', '#fef2f2', '#fca5a5', _rate('painterRateCents')));
        addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', _rate('projectManagerRateCents')));
        const delPhaseBtn = document.createElement('button');
        delPhaseBtn.type = 'button'; delPhaseBtn.textContent = 'Delete Phase';
        delPhaseBtn.style.cssText = 'padding:3px 8px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:11px;cursor:pointer;margin-left:8px;';
        delPhaseBtn.onclick = () => { _deletedPaintingPhaseIds.add(pid); _renderPaintingPhaseTable(); _updatePaintingCrewCalcs(); };
        leftGroup.appendChild(delPhaseBtn);
        header.appendChild(leftGroup); header.appendChild(addBtns);
        body.appendChild(header);

        if (crew.length === 0) {
          const empty = document.createElement('div');
          empty.textContent = 'No crew — add a role above';
          empty.style.cssText = 'padding:12px;text-align:center;color:#9ca3af;font-size:12px;';
          body.appendChild(empty);
        } else {
          const table = document.createElement('table');
          table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
          const thead = table.createTHead();
          const hrow = thead.insertRow();
          ['Role', 'Name', 'Rate', 'Hrs', 'Days', 'Pay', ''].forEach((h, hi) => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.cssText = `text-align:${hi >= 4 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
            hrow.appendChild(th);
          });
          const roleOrder = { foreman: 0, assistant: 1, painter: 2, project_manager: 3 };
          const sortedCrew = [...crew].sort((a, b) => (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1));
          const tbody = table.createTBody();
          const roleLabels = { foreman: 'Foreman', assistant: 'Assistant', painter: 'Painter', project_manager: 'Project Manager' };
          const roleColors = {
            foreman:   'background:#f0fdf4;color:#16a34a;', assistant: 'background:#fffbeb;color:#d97706;',
            painter:   'background:#fef2f2;color:#dc2626;', project_manager: 'background:#f5f3ff;color:#7c3aed;',
          };
          sortedCrew.forEach((member, idx) => {
            const tr = tbody.insertRow();
            tr.style.cssText = 'border-top:1px solid #f3f4f6;';
            const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:5px 10px;';
            const badge = document.createElement('span');
            badge.textContent = roleLabels[member.role] || member.role;
            badge.style.cssText = `padding:2px 7px;border-radius:10px;${roleColors[member.role] || 'background:#f3f4f6;color:#374151;'};font-size:11px;font-weight:500;`;
            roleTd.appendChild(badge);
            const nameTd = tr.insertCell(); nameTd.style.cssText = 'padding:4px 10px;';
            const nameInput = document.createElement('input');
            nameInput.type = 'text'; nameInput.placeholder = 'Name'; nameInput.value = member.name || '';
            nameInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;width:100px;';
            nameInput.addEventListener('input', () => { member.name = nameInput.value.trim(); });
            nameTd.appendChild(nameInput);
            const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:4px 10px;';
            const rateWrap = document.createElement('div'); rateWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const rateInput = document.createElement('input');
            rateInput.type = 'number'; rateInput.min = '0'; rateInput.step = '0.01'; rateInput.value = member.rate;
            rateInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;width:64px;';
            rateInput.addEventListener('input', () => { member.rate = parseFloat(rateInput.value) || 0; _updatePaintingCrewCalcs(); });
            const rateLabel = document.createElement('span');
            rateLabel.textContent = '$/hr'; rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
            rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel); rateTd.appendChild(rateWrap);
            const hoursTd = tr.insertCell(); hoursTd.style.cssText = 'padding:4px 10px;';
            const hoursWrap = document.createElement('div'); hoursWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
            const hoursInput = document.createElement('input');
            hoursInput.type = 'number'; hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5'; hoursInput.value = member.hours ?? 8;
            hoursInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;width:44px;';
            hoursInput.addEventListener('input', () => { member.hours = parseFloat(hoursInput.value) || 0; _updatePaintingCrewCalcs(); });
            const hoursLabel = document.createElement('span');
            hoursLabel.textContent = 'hrs'; hoursLabel.style.cssText = 'font-size:11px;color:#6b7280;';
            hoursWrap.appendChild(hoursInput); hoursWrap.appendChild(hoursLabel); hoursTd.appendChild(hoursWrap);
            const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
            const daysInput = document.createElement('input');
            daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
            daysInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:12px;outline:none;width:56px;';
            daysInput.addEventListener('input', () => { member.days = parseFloat(daysInput.value) || 0; _updatePaintingCrewCalcs(); });
            daysTd.appendChild(daysInput);
            const payTd = tr.insertCell();
            payTd.id = `pcrew_pay_${member._uid || idx}`;
            payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
            const pay = (member.rate||0)*(member.hours??8)*(member.days||0); payTd.textContent = fmt$(pay);
            const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
            const delBtn = document.createElement('button');
            delBtn.type = 'button'; delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
            delBtn.onclick = () => { const realIdx = _paintingPhaseCrews[pid].indexOf(member); if (realIdx !== -1) _paintingPhaseCrews[pid].splice(realIdx, 1); _renderPaintingPhaseTable(); };
            delTd.appendChild(delBtn);
          });
          table.appendChild(tbody); body.appendChild(_scrollX(table));
        }
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;gap:16px;padding:6px 12px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;flex-wrap:wrap;';
        [
          ['Foreman Pay', `pphase_foreman_${pid}`],
          ['Assistant Pay', `pphase_assistant_${pid}`],
          ['Painter Pay', `pphase_painter_${pid}`],
          ['PM Pay', `pphase_pm_${pid}`],
          ['Labor', `pphase_labor_${pid}`],
          ['Labor', `pphase_subtotal_${pid}`],
        ].forEach(([label, id]) => {
          const span = document.createElement('span');
          span.innerHTML = `${label}: <strong id="${id}" style="color:#374151;">$0.00</strong>`;
          footer.appendChild(span);
        });
        body.appendChild(footer);
        appendMaterialSubsection(body, i);
        details.appendChild(body);
        container.appendChild(details);
      });
      _updatePaintingCrewCalcs();
      return;
    }

    // Edit mode
    const lockBar = document.createElement('div');
    lockBar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button'; lockBtn.textContent = 'Done Editing';
    lockBtn.style.cssText = 'padding:4px 12px;border:1px solid #86efac;border-radius:6px;background:white;color:#16a34a;font-size:12px;cursor:pointer;';
    lockBtn.onclick = () => { _paintingPhasesLocked = true; _renderPaintingPhaseTable(); };
    lockBar.appendChild(lockBtn);
    container.appendChild(lockBar);

    PAINTING_PHASE_IDS.forEach((pid, i) => {
      if (_deletedPaintingPhaseIds.has(pid)) {
        const collapsed = document.createElement('div');
        collapsed.style.cssText = 'margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;opacity:0.5;';
        const ch = document.createElement('div');
        ch.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;';
        const cn = document.createElement('span');
        cn.textContent = PAINTING_PHASES[i] + ' (removed)';
        cn.style.cssText = 'font-weight:600;font-size:13px;color:#9ca3af;';
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button'; restoreBtn.textContent = 'Restore';
        restoreBtn.style.cssText = 'padding:3px 10px;border:1px solid #6ee7b7;border-radius:4px;background:white;color:#059669;font-size:11px;cursor:pointer;';
        restoreBtn.onclick = () => { _deletedPaintingPhaseIds.delete(pid); _renderPaintingPhaseTable(); _updatePaintingCrewCalcs(); };
        ch.appendChild(cn); ch.appendChild(restoreBtn);
        collapsed.appendChild(ch); container.appendChild(collapsed);
        return;
      }

      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;';
      const nameEl = document.createElement('span');
      nameEl.textContent = PAINTING_PHASES[i];
      nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#374151;';

      const addBtns = document.createElement('div');
      addBtns.style.cssText = 'display:flex;gap:6px;';

      const mkAddBtn = (label, role, color, bg, border, defaultRate) => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = label;
        btn.style.cssText = `padding:3px 8px;border:1px solid ${border};border-radius:4px;background:${bg};color:${color};font-size:11px;cursor:pointer;`;
        btn.onclick = () => {
          _paintingPhaseCrews[pid].push({ role, rate: defaultRate, hours: 8, days: 1, _uid: Math.random().toString(36).slice(2) });
          if (!_paintingExpectedDaysManual) _refreshPaintingDays();
          _renderPaintingPhaseTable();
          _updatePaintingCrewCalcs();
        };
        return btn;
      };
      addBtns.appendChild(mkAddBtn('+ Foreman',   'foreman',   '#16a34a', '#f0fdf4', '#86efac', _rate('foremanRateCents')));
      addBtns.appendChild(mkAddBtn('+ Assistant', 'assistant', '#d97706', '#fffbeb', '#fcd34d', _rate('assistantRateCents')));
      addBtns.appendChild(mkAddBtn('+ Painter',   'painter',   '#dc2626', '#fef2f2', '#fca5a5', _rate('painterRateCents')));
      addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', _rate('projectManagerRateCents')));

      const delPhaseBtn = document.createElement('button');
      delPhaseBtn.type = 'button'; delPhaseBtn.textContent = 'Delete Phase';
      delPhaseBtn.style.cssText = 'padding:3px 8px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:11px;cursor:pointer;margin-left:8px;';
      delPhaseBtn.onclick = () => { _deletedPaintingPhaseIds.add(pid); _renderPaintingPhaseTable(); _updatePaintingCrewCalcs(); };

      const leftGroup = document.createElement('div');
      leftGroup.style.cssText = 'display:flex;align-items:center;';
      leftGroup.appendChild(nameEl); leftGroup.appendChild(delPhaseBtn);
      header.appendChild(leftGroup); header.appendChild(addBtns);
      section.appendChild(header);

      const crew = _paintingPhaseCrews[pid] || [];
      if (crew.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No crew — add a role above';
        empty.style.cssText = 'padding:12px;text-align:center;color:#9ca3af;font-size:12px;';
        section.appendChild(empty);
      } else {
        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        const thead = table.createTHead();
        const hrow = thead.insertRow();
        ['Role', 'Name', 'Rate', 'Hrs', 'Days', 'Pay', ''].forEach((h, hi) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${hi >= 4 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
          hrow.appendChild(th);
        });
        const roleOrder = { foreman: 0, assistant: 1, painter: 2, project_manager: 3 };
        const sortedCrew = [...crew].sort((a, b) => (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1));
        const tbody = table.createTBody();
        const roleLabels = { foreman: 'Foreman', assistant: 'Assistant', painter: 'Painter', project_manager: 'Project Manager' };
        const roleColors = {
          foreman:   'background:#f0fdf4;color:#16a34a;',
          assistant: 'background:#fffbeb;color:#d97706;',
          painter:   'background:#fef2f2;color:#dc2626;',
          project_manager: 'background:#f5f3ff;color:#7c3aed;',
        };
        sortedCrew.forEach(member => {
          const tr = tbody.insertRow();
          tr.style.cssText = 'border-top:1px solid #f3f4f6;';

          const roleTd = tr.insertCell(); roleTd.style.cssText = 'padding:5px 10px;';
          const badge = document.createElement('span');
          badge.textContent = roleLabels[member.role] || member.role;
          badge.style.cssText = `padding:2px 7px;border-radius:10px;${roleColors[member.role] || 'background:#f3f4f6;color:#374151;'};font-size:11px;font-weight:500;`;
          roleTd.appendChild(badge);

          const nameTd = tr.insertCell(); nameTd.style.cssText = 'padding:4px 10px;';
          const nameInput = document.createElement('input');
          nameInput.type = 'text'; nameInput.placeholder = 'Name'; nameInput.value = member.name || '';
          nameInput.style.cssText = iStyle + 'width:100px;';
          nameInput.addEventListener('input', () => { member.name = nameInput.value.trim(); });
          nameTd.appendChild(nameInput);

          const rateTd = tr.insertCell(); rateTd.style.cssText = 'padding:4px 10px;';
          const rateWrap = document.createElement('div'); rateWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const rateInput = document.createElement('input');
          rateInput.type = 'number'; rateInput.min = '0'; rateInput.step = '0.01'; rateInput.value = member.rate;
          rateInput.style.cssText = iStyle + 'width:64px;';
          rateInput.addEventListener('input', () => { member.rate = parseFloat(rateInput.value) || 0; _updatePaintingCrewCalcs(); });
          const rateLabel = document.createElement('span'); rateLabel.textContent = '$/hr'; rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
          rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel);
          rateTd.appendChild(rateWrap);

          const hoursTd = tr.insertCell(); hoursTd.style.cssText = 'padding:4px 10px;';
          const hoursWrap = document.createElement('div'); hoursWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
          const hoursInput = document.createElement('input');
          hoursInput.type = 'number'; hoursInput.min = '0'; hoursInput.max = '24'; hoursInput.step = '0.5'; hoursInput.value = member.hours ?? 8;
          hoursInput.style.cssText = iStyle + 'width:44px;';
          hoursInput.addEventListener('input', () => { member.hours = parseFloat(hoursInput.value) || 0; _updatePaintingCrewCalcs(); });
          const hoursLabel = document.createElement('span'); hoursLabel.textContent = 'hrs'; hoursLabel.style.cssText = 'font-size:11px;color:#6b7280;';
          hoursWrap.appendChild(hoursInput); hoursWrap.appendChild(hoursLabel);
          hoursTd.appendChild(hoursWrap);

          const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
          const daysInput = document.createElement('input');
          daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
          daysInput.style.cssText = iStyle + 'width:56px;';
          daysInput.addEventListener('input', () => { member.days = parseFloat(daysInput.value) || 0; _updatePaintingCrewCalcs(); });
          daysTd.appendChild(daysInput);

          const payTd = tr.insertCell();
          payTd.id = `pcrew_pay_${member._uid}`;
          payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
          payTd.textContent = fmt$((member.rate||0)*(member.hours??8)*(member.days||0));

          const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
          const delBtn = document.createElement('button');
          delBtn.type = 'button'; delBtn.textContent = '×';
          delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
          delBtn.onclick = () => {
            const idx = _paintingPhaseCrews[pid].indexOf(member);
            if (idx !== -1) {
              _paintingPhaseCrews[pid].splice(idx, 1);
              if (!_paintingExpectedDaysManual) _refreshPaintingDays();
              _renderPaintingPhaseTable();
              _updatePaintingCrewCalcs();
            }
          };
          delTd.appendChild(delBtn);
        });
        table.appendChild(tbody);
        section.appendChild(_scrollX(table));
      }

      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;gap:16px;padding:6px 12px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;flex-wrap:wrap;';
      [
        ['Foreman Pay',   `pphase_foreman_${pid}`],
        ['Assistant Pay', `pphase_assistant_${pid}`],
        ['Painter Pay',   `pphase_painter_${pid}`],
        ['PM Pay',        `pphase_pm_${pid}`],
        ['Labor',         `pphase_labor_${pid}`],
        ['Subtotal',      `pphase_subtotal_${pid}`],
      ].forEach(([label, id]) => {
        const span = document.createElement('span');
        span.innerHTML = `${label}: <strong id="${id}" style="color:#374151;">$0.00</strong>`;
        footer.appendChild(span);
      });
      section.appendChild(footer);

      const matRow = document.createElement('div');
      matRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;border-top:1px solid #f3f4f6;font-size:12px;';
      const matLabel = document.createElement('label');
      matLabel.textContent = 'Materials ($):';
      matLabel.style.cssText = 'color:#6b7280;white-space:nowrap;';
      const matInput = document.createElement('input');
      matInput.type = 'number'; matInput.min = '0'; matInput.step = '0.01';
      matInput.dataset.paintingPhaseMaterialInput = 'true';
      const savedMatFallback = Number.isFinite(parseFloat(document.getElementById('paintingMaterialsInput')?.value))
        ? parseFloat(document.getElementById('paintingMaterialsInput').value)
        : (Number.isFinite(parseFloat(_paintingPhaseMaterials[pid])) ? parseFloat(_paintingPhaseMaterials[pid]) : 0);
      matInput.value = savedMatFallback;
      matInput.style.cssText = 'border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:12px;width:120px;outline:none;';
      matInput.addEventListener('input', () => {
        _paintingPhaseMaterials[pid] = parseFloat(matInput.value) || 0;
        const materialsInput = document.getElementById('paintingMaterialsInput');
        if (materialsInput) {
          materialsInput.value = matInput.value;
          _paintingMaterialsManual = true;
        }
        _syncPaintingMaterialsFromInput();
        _updatePaintingCrewCalcs();
      });
      matRow.appendChild(matLabel); matRow.appendChild(matInput);
      section.appendChild(matRow);

      container.appendChild(section);
    });

    ['paintingOverheadInput', 'paintingProfitInput', 'paintingTaxInput', 'paintingCommissionInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updatePaintingCrewCalcs);
    });

    _updatePaintingCrewCalcs();
  }

  function _setEstimatorTab(activeTab) {
    const analysisPanel = document.getElementById('analysisCard');
    const paintingPanel = document.getElementById('paintingCard');
    const tabAnalysis   = document.getElementById('tabAnalysisBtn');
    const tabPainting   = document.getElementById('tabPaintingBtn');
    if (!analysisPanel || !paintingPanel) return;

    const activeStyle   = 'px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2';
    const inactiveStyle = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2';

    analysisPanel.style.display = activeTab === 'analysis' ? 'block' : 'none';
    paintingPanel.style.display = activeTab === 'painting' ? 'block' : 'none';
    if (tabAnalysis) tabAnalysis.className = activeTab === 'analysis' ? activeStyle : inactiveStyle;
    if (tabPainting) tabPainting.className = activeTab === 'painting' ? activeStyle : inactiveStyle;

  }

  // Mirrors _setEstimatorTab above, for the Change Orders / Schedule of
  // Values tab card (see #changeOrderSovTabCard in page.tsx). This is the
  // ONLY thing that should ever set #changeOrderCard/#sovCard's own
  // display now that they're tab panels rather than independent cards —
  // renderSovCard/showChangeOrderCard just populate content and leave
  // display alone, same as showAnalysisCard/showPaintingCard already do
  // for their panels.
  function _setChangeOrderSovTab(activeTab) {
    const coPanel  = document.getElementById('changeOrderCard');
    const sovPanel = document.getElementById('sovCard');
    const tabCO    = document.getElementById('tabChangeOrdersBtn');
    const tabSov   = document.getElementById('tabSovBtn');
    if (!coPanel || !sovPanel) return;

    const activeStyle   = 'px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2';
    const inactiveStyle = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2';

    coPanel.style.display  = activeTab === 'changeOrders' ? 'block' : 'none';
    sovPanel.style.display = activeTab === 'sov' ? 'block' : 'none';
    if (tabCO) tabCO.className = activeTab === 'changeOrders' ? activeStyle : inactiveStyle;
    if (tabSov) tabSov.className = activeTab === 'sov' ? activeStyle : inactiveStyle;
  }

  // Mirrors _setEstimatorTab/_setChangeOrderSovTab above, for the
  // Scope/Comments tab card (see #scopeCommentsTabCard in page.tsx).
  // Scope/Comments has no data of its own to (re)fetch on tab switch —
  // the fields are just relocated pieces of the Cleaning/Painting forms,
  // so switching tabs here is purely a display toggle, same as
  // _setEstimatorTab.
  function _setScopeCommentsTab(activeTab) {
    const cleaningPanel = document.getElementById('scopeCommentsCleaningPanel');
    const paintingPanel = document.getElementById('scopeCommentsPaintingPanel');
    const tabCleaning    = document.getElementById('tabScopeCleaningBtn');
    const tabPainting    = document.getElementById('tabScopePaintingBtn');
    if (!cleaningPanel || !paintingPanel) return;

    const activeStyle   = 'px-4 py-2 text-sm font-medium border-b-2 border-green-600 text-green-600 mr-2';
    const inactiveStyle = 'px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 mr-2';

    cleaningPanel.style.display = activeTab === 'cleaning' ? 'block' : 'none';
    paintingPanel.style.display = activeTab === 'painting' ? 'block' : 'none';
    if (tabCleaning) tabCleaning.className = activeTab === 'cleaning' ? activeStyle : inactiveStyle;
    if (tabPainting) tabPainting.className = activeTab === 'painting' ? activeStyle : inactiveStyle;
  }

  function _getAnalysisAreaValue(projData) {
    if (_analysisAreaManual && _analysisAreaManualValue != null && _analysisAreaManualValue !== '') {
      const parsed = parseFloat(_analysisAreaManualValue);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      return _analysisAreaManualValue;
    }
    if (projData?.total_area != null && projData.total_area !== '') {
      const parsed = parseFloat(projData.total_area);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
      return projData.total_area;
    }
    return _pdfMetadataSummary?.totalArea ?? null;
  }

  function _getAnalysisDisplayArea(projData) {
    return _getAnalysisAreaValue(projData);
  }

  function showAnalysisCard(projData) {
    const card = document.getElementById('analysisCard');
    if (!card) return;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    const resolvedAddress = [projData.address, _pdfMetadataSummary?.address].find((value) => normalizeTextLine(value)) || '';
    const resolvedArea = _getAnalysisDisplayArea(projData);
    const resolvedName = _pdfMetadataSummary?.projectName || projData.name || '';

    const breakdownDiv = document.getElementById('analysisViewBreakdown');
    let displayLaborTotal = 0;
    const mobilizationsView = (projData.mobilizations != null && projData.mobilizations !== '' ? parseFloat(projData.mobilizations) : (projData.expected_days != null && projData.expected_days !== '' ? parseFloat(projData.expected_days) * 2 : 0)) || 0;
    const convertedDistanceView = _convertDistanceToMiles(projData?.driving_info?.distance || '');
    const gasCost = (() => {
      const savedGas = projData.gasoline != null && projData.gasoline !== '' ? parseFloat(projData.gasoline) : null;
      if (savedGas != null) return savedGas;
      return _getDistanceDerivedGasoline(convertedDistanceView || '', mobilizationsView);
    })();
    const driveHoursView = _parseDurationToHours(projData?.driving_info?.duration || '');
    const foremanRateView = (() => {
      const bd = projData.labor_breakdown;
      if (bd?.phases) {
        for (const p of bd.phases) {
          const f = (p.crew || []).find(m => m.role === 'foreman');
          if (f) return f.rate || _rate('foremanRateCents');
        }
      }
      return _rate('foremanRateCents');
    })();
    const driverCostView = driveHoursView > 0 ? (mobilizationsView * 2 * driveHoursView * foremanRateView) : 0;
    const tollCostView = (projData.toll_cost != null && projData.toll_cost !== '' ? parseFloat(projData.toll_cost) : 0) || 0;
    const totalTransport = gasCost + tollCostView;
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
        ['Phase', 'Persons', 'Days', 'Cleaners Pay', 'Foreman Pay', 'Labor', 'Materials', 'Labor'].forEach((h, i) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${i <= 2 ? 'left' : 'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;font-size:11px;white-space:nowrap;`;
          hrow.appendChild(th);
        });
        const tbody = table.createTBody();
        let totLaborCost = 0, totSubtotal = 0, totOh = 0, totPft = 0, totComm = 0;
        for (const p of bd.phases) {
          const c = _calcPhase(p, rates);
          totLaborCost += c.laborCost; displayLaborTotal += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
          totPft += c.pft; totComm += c.comm;
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
        breakdownDiv.appendChild(_scrollX(table));

        const totalPhaseMaterials = bd.phases.reduce((sum, p) => sum + (parseFloat(p.materials) || 0), 0);
        const savedMaterials = Number.isFinite(parseFloat(bd.materials)) ? parseFloat(bd.materials) : totalPhaseMaterials;
        const subtotalWithDriver = totSubtotal + driverCostView;
        const markupBase = subtotalWithDriver + savedMaterials;
        const totPftSummary = _calcProfitAmount(subtotalWithDriver, savedMaterials, (bd.profit_pct || 0) / 100);
        const totOhSummary = markupBase * ((bd.overhead_pct || 0) / 100);
        const totCommSummary = markupBase * ((bd.commission_pct || 0) / 100);
        const taxBase = subtotalWithDriver + savedMaterials + totalTransport + totOhSummary + totPftSummary + totCommSummary;
        const totTax = taxBase * ((bd.tax_pct || 0) / 100);
        const totFinal = taxBase + totTax;
        const pricingDiv = document.createElement('div');
        pricingDiv.style.cssText = 'margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;';
        [
          [`Labor`, subtotalWithDriver],
          [`Materials`, savedMaterials],
          [`Overhead (${bd.overhead_pct || 0}%)`, totOhSummary],
          [`Profit (${bd.profit_pct || 0}%)`, totPftSummary],
          [`Tax (${bd.tax_pct || 0}%)`, totTax],
          [`Commission (${bd.commission_pct || 0}%)`, totCommSummary],
          [`Final Price`, totFinal],
        ].forEach(([label, val], i) => {
          const isLast = i === 6;
          const item = document.createElement('div');
          item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#16a34a' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
          pricingDiv.appendChild(item);
        });
        breakdownDiv.appendChild(pricingDiv);
      }
    }

    setText('analysisViewAddress', resolvedAddress || '');
    const DEFAULT_OFFICE = _estimatorSettings.officeAddress;
    setText('analysisViewStartAddress', projData.start_address || DEFAULT_OFFICE);
    const laborTotal = displayLaborTotal + driverCostView;
    const lps = (laborTotal > 0 && resolvedArea) ? (laborTotal / resolvedArea) : null;
    setText('analysisViewLabor', fmt$(laborTotal));
    setText('analysisViewTotalArea', fmtSF(resolvedArea));
    setText('analysisViewQuote', fmt$(projData.quote));
    setText('analysisViewLaborPerSF', lps != null ? `$${lps.toFixed(4)}/SF` : '—');
    setText('analysisViewGasoline', gasCost != null ? fmt$(gasCost) : '—');
    const di = projData.driving_info;
    setText('detailTollCost', totalTransport > 0 ? fmt$(totalTransport) : '—');
    setText('analysisViewExpectedDays', projData.expected_days != null ? `${projData.expected_days} days` : '—');

    const totalAreaInput = document.getElementById('analysisTotalAreaInput');
    if (totalAreaInput) totalAreaInput.value = resolvedArea ?? '';

    const addressInput = document.getElementById('analysisAddressInput');
    if (addressInput) addressInput.value = resolvedAddress;

    if (resolvedName && activeProjectId) {
      const loadedNameEl = document.getElementById('loadedProjectName');
      const editNameEl = document.getElementById('editProjectNameInput');
      if (loadedNameEl) loadedNameEl.textContent = resolvedName;
      if (editNameEl) editNameEl.value = resolvedName;
    }

    renderExtractedMeasurements(_pdfMetadataSummary);

    document.getElementById('analysisView').style.display = 'block';
    document.getElementById('analysisEditForm').style.display = 'none';
    document.getElementById('editAnalysisBtn').style.display = '';
    const tabCard = document.getElementById('estimatorTabCard');
    if (tabCard) tabCard.style.display = 'block';
    _setEstimatorTab('analysis');

    const changeOrderSovTabCard = document.getElementById('changeOrderSovTabCard');
    if (changeOrderSovTabCard) changeOrderSovTabCard.style.display = 'block';
    _setChangeOrderSovTab('changeOrders');
    showChangeOrderCard(projData);
    renderSovCard();

    const scopeCommentsTabCard = document.getElementById('scopeCommentsTabCard');
    if (scopeCommentsTabCard) scopeCommentsTabCard.style.display = 'block';
    _setScopeCommentsTab('cleaning');
    // Scope/Comments now lives outside analysisEditForm, in its own
    // always-visible section — so unlike before, it can't rely on
    // showAnalysisEditForm's setVal calls to populate it, since that only
    // runs once the user clicks into Cleaning's edit mode. Populate it
    // here too, at load time, so it isn't just blank until then.
    const cleaningScopeEl = document.getElementById('cleaningScopeInput');
    if (cleaningScopeEl) cleaningScopeEl.value = projData.labor_breakdown?.scope ?? '';
    const cleaningCommentsEl = document.getElementById('cleaningCommentsInput');
    if (cleaningCommentsEl) cleaningCommentsEl.value = projData.labor_breakdown?.comments ?? '';
    // Same reasoning for Painting's half of the section — showPaintingCard
    // (which would otherwise set these) doesn't run until the user visits
    // the Painting tab at least once, but this section is visible
    // immediately, so populate its fields straight from projData here too.
    const paintingScopeEl = document.getElementById('paintingScopeInput');
    if (paintingScopeEl) paintingScopeEl.value = projData.painting_breakdown?.scope ?? '';
    const paintingCommentsEl = document.getElementById('paintingCommentsInput');
    if (paintingCommentsEl) paintingCommentsEl.value = projData.painting_breakdown?.comments ?? '';
  }


  function showPaintingCard(projData) {
    const card = document.getElementById('paintingCard');
    if (!card) return;
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const DEFAULT_OFFICE = _estimatorSettings.officeAddress;

    const bd = projData.painting_breakdown;
    const resolvedArea = bd?.total_area ?? projData.total_area;
    const resolvedAddress = bd?.address || projData.address || '';

    // Build effective phases: from saved bd, or auto-generate from area
    let effectivePhases = Array.isArray(bd?.phases) && bd.phases.length > 0 ? bd.phases : null;
    const fallbackSavedMaterials = Number.isFinite(parseFloat(bd?.materials)) ? parseFloat(bd.materials) : null;
    let effectiveRates = {
      overhead: (bd?.overhead_pct || 0) / 100,
      profit:   (bd?.profit_pct   || 30) / 100,
      tax:      (bd?.tax_pct      || 6)  / 100,
      commission: (bd?.commission_pct || 5) / 100,
    };
    let isAutoGenerated = false;
    if (!effectivePhases && resolvedArea > 0) {
      const uid = () => Math.random().toString(36).slice(2);
      const days = Math.ceil(resolvedArea / 5000) || 1;
      effectivePhases = [
        { name: 'Phase 1', crew: [{ role: 'foreman', rate: _rate('foremanRateCents'), hours: 8, days, _uid: uid() }, { role: 'painter', rate: _rate('painterRateCents'), hours: 8, days, _uid: uid() }, { role: 'painter', rate: _rate('painterRateCents'), hours: 8, days, _uid: uid() }] },
        { name: 'Phase 2', crew: [{ role: 'painter', rate: _rate('painterRateCents'), hours: 8, days, _uid: uid() }, { role: 'assistant', rate: _rate('assistantRateCents'), hours: 8, days, _uid: uid() }] },
      ];
      isAutoGenerated = true;
    }

    const areaDerived = (!bd?.phases && resolvedArea > 0) ? _getPaintingAreaDerivedValues(resolvedArea) : null;

    const breakdownDiv = document.getElementById('paintingViewBreakdown');
    const expectedDaysView = (bd?.expected_days != null && bd?.expected_days !== '')
      ? parseFloat(bd.expected_days)
      : (projData.expected_days != null && projData.expected_days !== ''
        ? parseFloat(projData.expected_days)
        : 0);
    const mobilizationsView = (bd?.mobilizations != null && bd?.mobilizations !== '')
      ? parseFloat(bd.mobilizations)
      : ((projData.mobilizations != null && projData.mobilizations !== '')
        ? parseFloat(projData.mobilizations)
        : (expectedDaysView > 0 ? expectedDaysView * 2 : 0));
    const convertedDistance = _convertDistanceToMiles(projData?.driving_info?.distance || '');
    const gasCost = (() => {
      const savedGas = (bd?.gasoline != null && bd?.gasoline !== '')
        ? parseFloat(bd.gasoline)
        : (projData.gasoline != null && projData.gasoline !== '' ? parseFloat(projData.gasoline) : null);
      if (savedGas != null) return savedGas;
      return _getDistanceDerivedGasoline(convertedDistance || '', mobilizationsView);
    })();
    const driveHoursView = _parseDurationToHours(projData?.driving_info?.duration || '');
    const foremanRateView = (() => {
      if (bd?.phases) {
        for (const p of bd.phases) {
          const f = (p.crew || []).find(m => m.role === 'foreman');
          if (f) return f.rate || _rate('foremanRateCents');
        }
      }
      return _rate('foremanRateCents');
    })();
    const driverCostView = (bd?.driver_cost != null && bd?.driver_cost !== '')
      ? parseFloat(bd.driver_cost)
      : ((projData.driver_cost != null && projData.driver_cost !== '')
        ? parseFloat(projData.driver_cost)
        : (driveHoursView > 0 ? mobilizationsView * 2 * driveHoursView * foremanRateView : 0));
    const tollCostView = (bd?.toll_cost != null && bd?.toll_cost !== '')
      ? parseFloat(bd.toll_cost)
      : ((projData.toll_cost != null && projData.toll_cost !== '') ? parseFloat(projData.toll_cost) : 0) || 0;
    const totalTransport = gasCost + tollCostView;
    if (breakdownDiv) {
      breakdownDiv.innerHTML = '';
      if (effectivePhases && effectivePhases.length > 0) {
        if (isAutoGenerated) {
          const notice = document.createElement('div');
          notice.textContent = 'Auto-generated — click Edit to customize and save';
          notice.style.cssText = 'font-size:11px;color:#9ca3af;margin-bottom:6px;font-style:italic;';
          breakdownDiv.appendChild(notice);
        }

        const table = document.createElement('table');
        table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
        const thead = table.createTHead();
        const hrow = thead.insertRow();
        ['Phase', 'Days', 'Foreman Pay', 'Assistant Pay', 'Painter Pay', 'Labor', 'Labor'].forEach((h, i) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${i <= 1 ? 'left' : 'right'};padding:4px 8px;color:#6b7280;font-weight:500;background:#f9fafb;font-size:11px;white-space:nowrap;`;
          hrow.appendChild(th);
        });
        const tbody = table.createTBody();
        let totLaborCost = 0, totSubtotal = 0, totOh = 0, totPft = 0, totComm = 0;
        for (const p of effectivePhases) {
          const c = _calcPhase(p, effectiveRates);
          totLaborCost += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
          totPft += c.pft; totComm += c.comm;
          const crew = p.crew || [];
          const days = crew.length > 0 ? Math.max(...crew.map(m => m.days || 0)) : 0;
          const tr = tbody.insertRow();
          tr.style.cssText = 'border-top:1px solid #f3f4f6;';
          [
            { v: p.name, a: 'left' }, { v: days, a: 'left' },
            { v: fmt$(c.foremanPay), a: 'right' }, { v: fmt$(c.assistantPay), a: 'right' },
            { v: fmt$(c.painterPay), a: 'right' },
            { v: fmt$(c.laborCost), a: 'right' }, { v: fmt$(c.subtotal), a: 'right' },
          ].forEach(({ v, a }) => {
            const td = tr.insertCell();
            td.textContent = v;
            td.style.cssText = `padding:5px 8px;text-align:${a};color:#374151;white-space:nowrap;`;
          });
        }
        breakdownDiv.appendChild(_scrollX(table));

        const phaseMaterials = effectivePhases.reduce((sum, p) => sum + (parseFloat(p.materials) || 0), 0);
        const savedMaterials = Number.isFinite(parseFloat(bd?.materials))
          ? parseFloat(bd.materials)
          : (phaseMaterials > 0 ? phaseMaterials : (areaDerived?.materials ?? 0));
        const subtotalWithDriver = totSubtotal + driverCostView;
        const overheadPct = bd?.overhead_pct || 0;
        const profitPct   = bd?.profit_pct   || 30;
        const taxPct      = bd?.tax_pct      || 6;
        const commPct     = bd?.commission_pct || 5;
        const taxBase = subtotalWithDriver + savedMaterials + totalTransport + totOh + totPft + totComm;
        const totTax = taxBase * (taxPct / 100);
        const totFinal = bd?.final_price != null
          ? parseFloat(bd.final_price)
          : (bd?.phases ? taxBase + totTax : areaDerived?.finalSubtotal ?? (taxBase + totTax));
        const pricingDiv = document.createElement('div');
        pricingDiv.style.cssText = 'margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;';
        [
          [`Labor`, subtotalWithDriver],
          [`Materials`, savedMaterials],
          [`Overhead (${overheadPct}%)`, totOh],
          [`Profit (${profitPct}%)`, totPft],
          [`Tax (${taxPct}%)`, totTax],
          [`Commission (${commPct}%)`, totComm],
          [`Final Price`, totFinal],
        ].forEach(([label, val], i) => {
          const isLast = i === 6;
          const item = document.createElement('div');
          item.innerHTML = `<div style="color:#6b7280;font-size:10px;text-transform:uppercase;margin-bottom:2px;">${label}</div><div style="color:${isLast ? '#16a34a' : '#111827'};font-weight:${isLast ? '700' : '600'};">${fmt$(val)}</div>`;
          pricingDiv.appendChild(item);
        });
        breakdownDiv.appendChild(pricingDiv);
      }
    }

    setText('paintingViewAddress', resolvedAddress);
    setText('paintingViewStartAddress', projData.start_address || DEFAULT_OFFICE);
    setText('paintingViewExpectedDays', bd?.expected_days != null ? `${bd.expected_days} days` : (projData.expected_days != null ? `${projData.expected_days} days` : '—'));

    const zeroRates = { overhead: 0, profit: 0, tax: 0, commission: 0 };
    const labor = effectivePhases
      ? effectivePhases.reduce((sum, p) => sum + _calcPhase(p, zeroRates).laborCost, 0)
      : null;
    setText('paintingViewLabor', labor != null ? fmt$(labor) : '—');
    setText('paintingViewTotalArea', resolvedArea ? fmtSF(resolvedArea) : '—');

    let totSubtotal = 0, totOh = 0, totPft = 0, totComm = 0;
    if (effectivePhases) {
      for (const p of effectivePhases) {
        const c = _calcPhase(p, effectiveRates);
        totSubtotal += c.subtotal; totOh += c.oh; totPft += c.pft; totComm += c.comm;
      }
    }
    const phaseMaterialSum = effectivePhases
      ? effectivePhases.reduce((sum, p) => sum + (parseFloat(p.materials) || 0), 0)
      : 0;
    const paintingLaborTotal = effectivePhases
      ? effectivePhases.reduce((sum, p) => sum + _calcPhase(p, zeroRates).laborCost, 0) + driverCostView
      : null;
    const savedMaterials = fallbackSavedMaterials != null
      ? fallbackSavedMaterials
      : (phaseMaterialSum > 0 ? phaseMaterialSum : (areaDerived?.materials ?? 0));
    const subtotalWithDriver = totSubtotal + driverCostView;
    const quoteBase = subtotalWithDriver + savedMaterials + totalTransport + totOh + totPft + totComm;
    const quote = bd?.final_price != null
      ? parseFloat(bd.final_price)
      : (bd?.phases ? quoteBase + (quoteBase * ((bd?.tax_pct || 0) / 100)) : areaDerived?.finalSubtotal ?? (quoteBase + (quoteBase * ((bd?.tax_pct || 0) / 100))));
    setText('paintingViewQuote', fmt$(quote));

    const lps = (paintingLaborTotal != null && resolvedArea) ? (paintingLaborTotal / resolvedArea) : null;
    setText('paintingViewLabor', paintingLaborTotal != null ? fmt$(paintingLaborTotal) : '—');
    setText('paintingViewLaborPerSF', lps != null ? `$${lps.toFixed(4)}/SF` : '—');

    const di = projData.driving_info;
    setText('paintingDetailDistance', _convertDistanceToMiles(di?.distance || '—'));
    setText('paintingDetailDuration', di?.duration || '—');
    setText('paintingDetailTollCost', totalTransport > 0 ? fmt$(totalTransport) : '—');
    setText('paintingViewGasoline', gasCost != null ? fmt$(gasCost) : '—');

    // Initialize edit state from saved painting_breakdown
    _paintingPhaseCrews = { phase1: [], phase2: [] };
    _paintingPhaseMaterials = { phase1: 0, phase2: 0 };
    _paintingMaterialsManual = false;
    _deletedPaintingPhaseIds = new Set();
    const savedMainMaterials = Number.isFinite(parseFloat(bd?.materials)) ? parseFloat(bd.materials) : 0;
    if (bd?.phases) {
      const savedPids = new Set();
      for (const p of bd.phases) {
        const pid = PAINTING_PHASE_NAME_TO_ID[p.name] || PAINTING_PHASE_NAME_TO_ID[p.name?.trim()];
        if (!pid) continue;
        savedPids.add(pid);
        _paintingPhaseCrews[pid] = (p.crew || []).map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) }));
        const phaseSavedMaterials = parseFloat(p.materials);
        _paintingPhaseMaterials[pid] = Number.isFinite(phaseSavedMaterials)
          ? phaseSavedMaterials
          : savedMainMaterials;
      }
      for (const pid of PAINTING_PHASE_IDS) {
        if (!savedPids.has(pid)) _deletedPaintingPhaseIds.add(pid);
      }
    }

    document.getElementById('paintingView').style.display = 'block';
    document.getElementById('paintingEditForm').style.display = 'none';
  }

  function showAnalysisEditForm() {
    if (!_loadedProjectData) return;
    const bd = _loadedProjectData.labor_breakdown;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    const phaseMap = { 'Rough Cleaning': 'rough', 'Final Cleaning': 'final', 'Touch Up Cleaning': 'touchup' };

    // Reset then restore crew from saved data
    _phaseCrews = { rough: [], final: [], touchup: [] };
    _phaseMaterials = { rough: 0, final: 0, touchup: 0 };
    _deletedPhaseIds = new Set();

    if (bd) {
      setVal('cleanerRateInput', bd.cleaner_rate ?? _rate('cleanerRateCents'));
      setVal('foremanRateInput', bd.foreman_rate ?? _rate('foremanRateCents'));
      setVal('overheadInput', bd.overhead_pct ?? 0);
      setVal('profitInput', bd.profit_pct ?? 30);
      setVal('taxInput', bd.tax_pct ?? 6);
      setVal('commissionInput', bd.commission_pct ?? 10);
      const savedBuildingType = bd.building_type ?? 'Commercial';
      const buildingTypeEl = document.getElementById('buildingTypeSelect');
      if (buildingTypeEl) {
        const normalizedValue = [
          'Commercial',
          'Retail',
          'Multifamily',
          'School / Institutional',
          'Medical / Healthcare',
          'Warehouse',
          'Industrial / Manufacturing',
          'High-Rise / Large Commercial',
        ].includes(savedBuildingType)
          ? savedBuildingType
          : 'Commercial';
        buildingTypeEl.value = normalizedValue;
      }
    }

    if (bd && bd.phases) {
      const savedPids = new Set();
      for (const p of bd.phases) {
        const pid = phaseMap[p.name];
        if (!pid) continue;
        savedPids.add(pid);
        _phaseMaterials[pid] = p.materials || 0;
        if (p.crew && p.crew.length > 0) {
          _phaseCrews[pid] = p.crew.map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) }));
        } else {
          // Convert old format (persons/days + global rates) to crew
          const cr = bd.cleaner_rate || _rate('cleanerRateCents');
          const fr = bd.foreman_rate || _rate('foremanRateCents');
          const days = p.days || 1;
          for (let k = 0; k < (p.persons || 1); k++) _phaseCrews[pid].push({ role: 'cleaner', rate: cr, days, _uid: Math.random().toString(36).slice(2) });
          _phaseCrews[pid].push({ role: 'foreman', rate: fr, days, _uid: Math.random().toString(36).slice(2) });
        }
      }
      // Restore previously deleted phases
      for (const pid of ['rough', 'final', 'touchup']) {
        if (!savedPids.has(pid)) _deletedPhaseIds.add(pid);
      }
    } else {
      const totalArea = _pdfMetadataSummary?.totalArea ?? _loadedProjectData.total_area;
      if (totalArea) {
        _autoGeneratePhases(totalArea);
      } else {
        ['rough', 'final', 'touchup'].forEach(pid => {
          _phaseCrews[pid] = [{ role: 'cleaner', rate: _rate('cleanerRateCents'), days: 2, _uid: Math.random().toString(36).slice(2) }, { role: 'foreman', rate: _rate('foremanRateCents'), days: 2, _uid: Math.random().toString(36).slice(2) }];
        });
      }
    }
    _phasesLocked = true;

    _renderPhaseTable();

    const regenPhasesBtn = document.getElementById('regenPhasesBtn');
    if (regenPhasesBtn) regenPhasesBtn.onclick = () => {
      const area = parseFloat(document.getElementById('analysisTotalAreaInput')?.value) || 0;
      if (!area) { toast('Please set Total Area first.', 'error'); return; }
      _autoGeneratePhases(area);
      _phasesLocked = true;
      _renderPhaseTable();
      _updateCrewCalcs();
    };

    // Reset expected days manual override state
    _expectedDaysManual = !!_loadedProjectData.expected_days;
    const daysInput = document.getElementById('expectedDaysInput');
    const modifyBtn = document.getElementById('expectedDaysModifyBtn');
    const resetBtn = document.getElementById('expectedDaysResetBtn');
    if (daysInput) {
      daysInput.readOnly = !_expectedDaysManual;
      daysInput.className = _expectedDaysManual
        ? 'w-32 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400'
        : 'w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none';
      daysInput.addEventListener('input', () => {
        if (daysInput.readOnly) return;
        _syncAnalysisMobilizations();
        _updateTransportCosts();
      });
    }
    if (modifyBtn) modifyBtn.style.display = _expectedDaysManual ? 'none' : '';
    if (resetBtn) resetBtn.style.display = _expectedDaysManual ? '' : 'none';

    if (modifyBtn) modifyBtn.onclick = () => {
      _expectedDaysManual = true;
      if (daysInput) { daysInput.readOnly = false; daysInput.className = 'w-32 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400'; daysInput.focus(); }
      modifyBtn.style.display = 'none';
      if (resetBtn) resetBtn.style.display = '';
    };
    if (resetBtn) resetBtn.onclick = () => {
      _expectedDaysManual = false;
      if (daysInput) { daysInput.readOnly = true; daysInput.className = 'w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none'; }
      resetBtn.style.display = 'none';
      if (modifyBtn) modifyBtn.style.display = '';
      _updateCrewCalcs();
    };

    const autoTotalArea = _pdfMetadataSummary?.totalArea ?? null;
    const totalAreaInput = document.getElementById('analysisTotalAreaInput');
    const totalAreaModifyBtn = document.getElementById('totalAreaModifyBtn');
    const totalAreaResetBtn = document.getElementById('totalAreaResetBtn');
    const persistedAreaValue = _loadedProjectData?.total_area;
    const manualAreaValue = _analysisAreaManual && _analysisAreaManualValue != null && _analysisAreaManualValue !== ''
      ? _analysisAreaManualValue
      : null;
    const initialAreaValue = manualAreaValue ?? (persistedAreaValue != null && persistedAreaValue !== '' ? persistedAreaValue : (autoTotalArea ?? _loadedProjectData?.total_area));
    setVal('analysisTotalAreaInput', initialAreaValue);
    if (totalAreaInput) {
      totalAreaInput.readOnly = true;
      totalAreaInput.className = 'w-40 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none';
    }
    if (totalAreaModifyBtn) totalAreaModifyBtn.style.display = '';
    if (totalAreaResetBtn) totalAreaResetBtn.style.display = 'none';
    const _regenPhasesFromAreaInput = () => {
      const area = parseFloat(totalAreaInput?.value) || 0;
      if (area > 0) { _autoGeneratePhases(area); _phasesLocked = true; _renderPhaseTable(); _updateCrewCalcs(); }
    };
    const _syncMaterialsFromArea = () => {
      const materialsInput = document.getElementById('materialsInput');
      if (!materialsInput || _analysisMaterialsManual) return;
      const derived = _getCleaningMaterialsDerivedValue(totalAreaInput?.value);
      materialsInput.value = derived.toFixed(2);
      _updateCrewCalcs();
    };
    if (totalAreaInput) {
      totalAreaInput.addEventListener('input', () => {
        _analysisAreaManual = true;
        _analysisAreaManualValue = totalAreaInput.value;
        _syncMaterialsFromArea();
      });
      totalAreaInput.addEventListener('change', () => {
        _regenPhasesFromAreaInput();
        _syncMaterialsFromArea();
      });
    }
    if (totalAreaModifyBtn) totalAreaModifyBtn.onclick = () => {
      if (totalAreaInput) { totalAreaInput.readOnly = false; totalAreaInput.className = 'w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-green-400'; totalAreaInput.focus(); }
      totalAreaModifyBtn.style.display = 'none';
      if (totalAreaResetBtn) totalAreaResetBtn.style.display = autoTotalArea != null ? '' : 'none';
    };
    if (totalAreaResetBtn) totalAreaResetBtn.onclick = () => {
      if (totalAreaInput) { totalAreaInput.readOnly = true; totalAreaInput.className = 'w-40 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none'; }
      _analysisAreaManual = false;
      _analysisAreaManualValue = null;
      setVal('analysisTotalAreaInput', autoTotalArea ?? _loadedProjectData.total_area);
      totalAreaResetBtn.style.display = 'none';
      if (totalAreaModifyBtn) totalAreaModifyBtn.style.display = '';
      _regenPhasesFromAreaInput();
    };
    setVal('analysisAddressInput', (_loadedProjectData.address || _pdfMetadataSummary?.address || '').toString());
    setVal('tollCostInput', _loadedProjectData.toll_cost);
    setVal('expectedDaysInput', _loadedProjectData.expected_days);
    setVal('marginInput', _loadedProjectData.margin);
    const savedMaterials = _loadedProjectData.labor_breakdown?.materials;
    const materialsInput = document.getElementById('materialsInput');
    if (materialsInput) {
      if (savedMaterials != null && savedMaterials !== '') {
        _analysisMaterialsManual = true;
        materialsInput.value = savedMaterials;
      } else {
        _analysisMaterialsManual = false;
        materialsInput.value = _getCleaningMaterialsDerivedValue(initialAreaValue).toFixed(2);
      }
      materialsInput.oninput = () => {
        _analysisMaterialsManual = true;
        _updateCrewCalcs();
      };
    }
    ['roughAreaPerPersonInput', 'finalAreaPerPersonInput', 'touchupAreaPerPersonInput'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const update = () => {
        // allow auto expected-days to recompute when area-per-person rates change
        _expectedDaysManual = false;
        _refreshCleaningDays();
        _renderPhaseTable();
        _updateCrewCalcs();
        _updateTransportCosts();
      };
      el.addEventListener('input', update);
      el.addEventListener('change', update);
    });
    const mobilizationsInput = document.getElementById('mobilizationsInput');
    if (mobilizationsInput) {
      const expectedDays = parseFloat(document.getElementById('expectedDaysInput')?.value) || 0;
      const savedMobilizations = _loadedProjectData?.mobilizations;
      const hasSavedMobilizations = savedMobilizations != null && savedMobilizations !== '';
      const derivedMobilizations = hasSavedMobilizations
        ? parseFloat(savedMobilizations)
        : (expectedDays > 0 ? expectedDays * 2 : null);
      mobilizationsInput.value = derivedMobilizations != null ? derivedMobilizations.toFixed(0) : '';
      mobilizationsInput.dataset.manual = hasSavedMobilizations ? 'true' : 'false';
      mobilizationsInput.addEventListener('input', () => {
        mobilizationsInput.dataset.manual = 'true';
        _updateTransportCosts();
      });
    }
    const buildingTypeSelect = document.getElementById('buildingTypeSelect');
    if (buildingTypeSelect) {
      const handleBuildingTypeChange = () => {
        if (typeof _updateCrewCalcs === 'function') _updateCrewCalcs();
      };
      buildingTypeSelect.oninput = handleBuildingTypeChange;
      buildingTypeSelect.onchange = handleBuildingTypeChange;
    }
    const driverCostInput = document.getElementById('driverCostDisplay');
    if (driverCostInput) {
      const savedDriverCost = _loadedProjectData?.driver_cost;
      if (savedDriverCost != null && savedDriverCost !== '') {
        driverCostInput.dataset.manual = 'true';
        driverCostInput.value = parseFloat(savedDriverCost).toFixed(2);
      } else {
        driverCostInput.dataset.manual = 'false';
      }
      driverCostInput.addEventListener('input', () => {
        driverCostInput.dataset.manual = 'true';
        _updateTransportCosts();
      });
    }
    const gasolineInput = document.getElementById('gasolineInput');
    if (gasolineInput) {
      const savedGasoline = _loadedProjectData?.gasoline;
      const convertedDistance2 = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
      const derivedGasoline = _getDistanceDerivedGasoline(convertedDistance2 || '', mobilizationsInput?.value || 0);
      if (savedGasoline != null && savedGasoline !== '') {
        gasolineInput.dataset.manual = 'true';
        gasolineInput.value = parseFloat(savedGasoline).toFixed(2);
      } else {
        gasolineInput.dataset.manual = 'false';
        gasolineInput.value = derivedGasoline > 0 ? derivedGasoline.toFixed(2) : '';
      }
      gasolineInput.addEventListener('input', () => {
        gasolineInput.dataset.manual = 'true';
        _updateTransportCosts();
      });
    }
    const costPerMileInput = document.getElementById('costPerMileInput');
    if (costPerMileInput) {
      const savedCostPerMile = _loadedProjectData?.cost_per_mile;
      const restoredCostPerMile = restoreCostPerMileValue(activeProjectId, 'analysis');
      const initialCostPerMile = savedCostPerMile != null && savedCostPerMile !== ''
        ? savedCostPerMile
        : (restoredCostPerMile != null && restoredCostPerMile !== '' ? restoredCostPerMile : null);
      if (initialCostPerMile != null && initialCostPerMile !== '') {
        costPerMileInput.dataset.manual = 'true';
        costPerMileInput.value = parseFloat(initialCostPerMile).toFixed(2);
      } else {
        costPerMileInput.dataset.manual = 'false';
        costPerMileInput.value = '';
      }
      costPerMileInput.addEventListener('input', () => {
        costPerMileInput.dataset.manual = 'true';
        _updateTransportCosts();
      });
    }
    setVal('cleaningScopeInput', _loadedProjectData.labor_breakdown?.scope ?? '');
    setVal('cleaningCommentsInput', _loadedProjectData.labor_breakdown?.comments ?? '');
    _updateCrewCalcs();


    // ZIP manual lookup button
    const taxZipLookupBtn = document.getElementById('taxZipLookupBtn');
    if (taxZipLookupBtn) taxZipLookupBtn.onclick = async () => {
      const zip = document.getElementById('taxZipInput')?.value?.trim();
      if (!zip || zip.length !== 5) { toast('Enter a valid 5-digit ZIP', 'error'); return; }
      try {
        const r = await fetch(`${API_BASE}/api/projects/tax-rate?zip=${zip}`);
        const data = r.ok ? await r.json() : null;
        if (data?.combined_rate != null) {
          setVal('taxInput', parseFloat(data.combined_rate).toFixed(3));
          _updateCrewCalcs();
        } else {
          toast('Could not find tax rate for this ZIP', 'error');
        }
      } catch { toast('Lookup failed', 'error'); }
    };

    // Auto-fill tax rate from ZIP (TaxJar) or fallback to state hardcode
    if (!bd?.tax_pct) {
      const addr = _pdfMetadataSummary?.address || _loadedProjectData.address || '';
      const zipMatch = addr.match(/\b(\d{5})\b/);
      if (zipMatch) {
        fetch(`${API_BASE}/api/projects/tax-rate?zip=${zipMatch[1]}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.combined_rate != null) {
              setVal('taxInput', parseFloat(data.combined_rate).toFixed(3));
            } else {
              const fallback = _inferStateTaxRate(addr);
              if (fallback != null) setVal('taxInput', fallback);
            }
          })
          .catch(() => {
            const fallback = _inferStateTaxRate(addr);
            if (fallback != null) setVal('taxInput', fallback);
          });
      } else {
        const fallback = _inferStateTaxRate(addr);
        if (fallback != null) setVal('taxInput', fallback);
      }
    }

    const di = _loadedProjectData.driving_info || {};
    const setEditText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setEditText('editDriveDistance', _convertDistanceToMiles(di.distance));
    setEditText('editDriveTime', di.duration);

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

    _updateTransportCosts();
    ['gasolineInput', 'tollCostInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updateTransportCosts);
    });
  }

  document.getElementById('tabAnalysisBtn')?.addEventListener('click', () => _setEstimatorTab('analysis'));
  document.getElementById('tabPaintingBtn')?.addEventListener('click', () => {
    _setEstimatorTab('painting');
    if (_loadedProjectData) {
      showPaintingCard(_loadedProjectData);
    }
  });

  // Change Orders doesn't re-fetch on click (unlike Painting above) —
  // it's already populated eagerly alongside Analysis (see
  // showChangeOrderCard in showAnalysisCard), and re-running it here
  // would stomp any in-progress edits made before hitting "Save All"
  // with whatever was last saved. SOV re-renders on every visit since
  // renderSovCard reads from live in-memory state rather than resetting
  // it, so refreshing it is always safe and keeps it current.
  document.getElementById('tabChangeOrdersBtn')?.addEventListener('click', () => _setChangeOrderSovTab('changeOrders'));
  document.getElementById('tabSovBtn')?.addEventListener('click', () => {
    _setChangeOrderSovTab('sov');
    renderSovCard();
  });

  document.getElementById('tabScopeCleaningBtn')?.addEventListener('click', () => _setScopeCommentsTab('cleaning'));
  document.getElementById('tabScopePaintingBtn')?.addEventListener('click', () => _setScopeCommentsTab('painting'));

  // Scope/Comments' Save/Cancel just forward to that trade's real
  // button (see the comment on #scopeCommentsTabCard in page.tsx for
  // why) — #saveAnalysisBtn/#savePaintingBtn and their cancel
  // counterparts already gather/reset every field for that trade by id,
  // regardless of where in the DOM those fields actually render.
  document.getElementById('scopeCleaningSaveBtn')?.addEventListener('click', () => document.getElementById('saveAnalysisBtn')?.click());
  document.getElementById('scopeCleaningCancelBtn')?.addEventListener('click', () => document.getElementById('cancelAnalysisBtn')?.click());
  document.getElementById('scopePaintingSaveBtn')?.addEventListener('click', () => document.getElementById('savePaintingBtn')?.click());
  document.getElementById('scopePaintingCancelBtn')?.addEventListener('click', () => document.getElementById('cancelPaintingBtn')?.click());


  const editAnalysisBtn = document.getElementById('editAnalysisBtn');
  if (editAnalysisBtn) editAnalysisBtn.addEventListener('click', () => {
    window.__analysisDirty = true;
    showAnalysisEditForm();
  });

  const editPaintingBtn = document.getElementById('editPaintingBtn');
  if (editPaintingBtn) editPaintingBtn.addEventListener('click', () => {
    document.getElementById('paintingView').style.display = 'none';
    document.getElementById('paintingEditForm').style.display = 'block';
    // Pre-fill form inputs from saved painting_breakdown
    const bd = _loadedProjectData?.painting_breakdown;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    const resolveMaterialOption = (savedKey, savedValue, mapping, fallback) => {
      if (savedKey != null && savedKey !== '') return savedKey;
      if (savedValue != null && savedValue !== '') return _getPaintingMaterialOptionKey(mapping, savedValue, fallback);
      return fallback;
    };
    _paintingPhaseCrews = { phase1: [], phase2: [] };
    _paintingPhaseMaterials = { phase1: 0, phase2: 0 };
    const editSavedMainMaterials = Number.isFinite(parseFloat(bd?.materials)) ? parseFloat(bd.materials) : 0;
    if (bd) {
      setVal('paintingOverheadInput', bd.overhead_pct ?? 0);
      setVal('paintingProfitInput', bd.profit_pct ?? 30);
      setVal('paintingTaxInput', bd.tax_pct ?? 6);
      setVal('paintingCommissionInput', bd.commission_pct ?? 5);
      setVal('paintingMarginInput', bd.margin ?? 0);
      setVal('paintingTollCostInput', bd.toll_cost ?? 0);
      setVal('paintingTotalAreaInput', bd.total_area ?? '');
      setVal('paintingAddressInput', bd.address ?? '');
      setVal('paintingScopeInput', bd.scope ?? '');
      setVal('paintingCommentsInput', bd.comments ?? '');
      setVal('paintingBuildingTypeSelect', bd.building_type ?? 'Office / Commercial');
      setVal('paintingCoatsSelect', bd.paint_coats ?? 2);
      setVal('paintingSurfaceConditionSelect', resolveMaterialOption(bd.paint_surface_condition_key, bd.paint_surface_condition, PAINTING_SURFACE_MULTIPLIERS, 'smooth'));
      setVal('paintingPaintQualitySelect', resolveMaterialOption(bd.paint_quality_key, bd.paint_quality, PAINTING_PRICE_PER_GALLON, 'standard'));
      setVal('paintingFinishTypeSelect', resolveMaterialOption(bd.paint_finish_key, bd.paint_finish_multiplier, PAINTING_FINISH_MULTIPLIERS, 'flat'));
      setVal('paintingColorDepthSelect', resolveMaterialOption(bd.paint_color_key, bd.paint_color_multiplier, PAINTING_COLOR_MULTIPLIERS, 'white_light'));
      setVal('paintingPrimerTypeSelect', resolveMaterialOption(bd.primer_type_key, bd.primer_type, PAINTING_PRIMER_PRICE_PER_GALLON, 'none'));
      if (bd.phases) {
        for (const p of bd.phases) {
          const pid = PAINTING_PHASE_NAME_TO_ID[p.name] || PAINTING_PHASE_NAME_TO_ID[p.name?.trim()];
          if (pid) {
            const phaseSavedMaterials = parseFloat(p.materials);
            _paintingPhaseMaterials[pid] = Number.isFinite(phaseSavedMaterials)
              ? phaseSavedMaterials
              : editSavedMainMaterials;
            _paintingPhaseCrews[pid] = (p.crew || []).map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) }));
          }
        }
      }
      if (bd.expected_days != null) {
        setVal('paintingExpectedDaysInput', bd.expected_days);
        _paintingExpectedDaysManual = true;
      } else {
        _paintingExpectedDaysManual = false;
      }
      setVal('paintingPrimerAreaPerPersonInput', bd.primer_area_per_person ?? PAINTING_PRIMER_SF_PER_PERSON_DAY);
      setVal('paintingInteriorAreaPerPersonInput', bd.interior_area_per_person ?? PAINTING_INTERIOR_SF_PER_PERSON_DAY);
    }
    const areaInput = document.getElementById('paintingTotalAreaInput');
    const materialsInput = document.getElementById('paintingMaterialsInput');
    const daysInput = document.getElementById('paintingExpectedDaysInput');
    const primerRateInput = document.getElementById('paintingPrimerAreaPerPersonInput');
    const interiorRateInput = document.getElementById('paintingInteriorAreaPerPersonInput');
    const openAreaDerived = _getPaintingAreaDerivedValues(areaInput?.value || 0);
    _paintingMaterialsManual = bd?.materials_manual === true;
    const paintingAreaValue = _loadedProjectData?.total_area ?? bd?.total_area;
    if (areaInput) {
      if (paintingAreaValue != null && paintingAreaValue !== '') {
        setVal('paintingTotalAreaInput', paintingAreaValue);
      }
      if (materialsInput) {
        materialsInput.value = bd?.materials != null ? Number(bd.materials).toFixed(2) : openAreaDerived.materials.toFixed(2);
      }
      areaInput.oninput = () => {
        const derived = _getPaintingAreaDerivedValues(areaInput.value);
        if (materialsInput && !_paintingMaterialsManual) materialsInput.value = derived.materials.toFixed(2);
        _updatePaintingMaterialsCostDisplays();
        _updatePaintingCrewCalcs();
      };
    }
    if (materialsInput) {
      materialsInput.oninput = () => {
        _paintingMaterialsManual = true;
        _updatePaintingCrewCalcs();
      };
    }
    const paintingBuildingTypeSelect = document.getElementById('paintingBuildingTypeSelect');
    if (paintingBuildingTypeSelect) {
      const handlePaintingBuildingTypeChange = () => {
        _paintingMaterialsManual = false;
        _updatePaintingMaterialsCostDisplays();
        _updatePaintingCrewCalcs();
      };
      paintingBuildingTypeSelect.oninput = handlePaintingBuildingTypeChange;
      paintingBuildingTypeSelect.onchange = handlePaintingBuildingTypeChange;
    }
    if (primerRateInput) {
      const _primerChanged = () => { _paintingExpectedDaysManual = false; _refreshPaintingDays(); };
      primerRateInput.addEventListener('input', _primerChanged);
      primerRateInput.addEventListener('change', _primerChanged);
    }
    _ensurePaintingMaterialsListeners();
    _updatePaintingMaterialsCostDisplays();

    // Ensure primer-specific selects always trigger recalculation (catch late-mounted elements)
    ['paintingPrimerRequiredSelect', 'paintingPrimerTypeSelect', 'paintingPrimerCoatsSelect', 'paintingPrimerApplicationMethodSelect']
      .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const h = () => { _updatePaintingMaterialsCostDisplays(); _updatePaintingCrewCalcs(); };
        el.addEventListener('input', h);
        el.addEventListener('change', h);
      });
    if (interiorRateInput) {
      const _interiorChanged = () => { _paintingExpectedDaysManual = false; _refreshPaintingDays(); };
      interiorRateInput.addEventListener('input', _interiorChanged);
      interiorRateInput.addEventListener('change', _interiorChanged);
    }
    const mobilizationsInput = document.getElementById('paintingMobilizationsInput');
    if (mobilizationsInput) {
      const expectedDays = parseFloat(document.getElementById('paintingExpectedDaysInput')?.value) || 0;
      const savedMobilizations = bd?.mobilizations;
      const derivedMobilizations = (savedMobilizations != null && savedMobilizations !== '')
        ? parseFloat(savedMobilizations)
        : (expectedDays > 0 ? expectedDays * 2 : null);
      mobilizationsInput.value = derivedMobilizations != null ? derivedMobilizations.toFixed(0) : '';
      mobilizationsInput.dataset.manual = (savedMobilizations != null && savedMobilizations !== '') ? 'true' : 'false';
      mobilizationsInput.addEventListener('input', () => {
        mobilizationsInput.dataset.manual = 'true';
        _updatePaintingTransportCosts();
      });
    }
    if (PAINTING_PHASE_IDS.every(pid => !_paintingPhaseCrews[pid] || _paintingPhaseCrews[pid].length === 0)) {
      const autoArea = parseFloat(paintingAreaValue || areaInput?.value) || 0;
      if (autoArea > 0) {
        _autoGeneratePaintingPhases(autoArea);
      }
    }
    if (!_paintingExpectedDaysManual) {
      const area = parseFloat(areaInput?.value) || 0;
      if (area > 0) {
        _refreshPaintingDays();
      }
    }
    if (areaInput) {
      areaInput.addEventListener('input', () => {
        const area = parseFloat(areaInput.value) || 0;
        if (area > 0) {
          _refreshPaintingDays();
        }
      });
    }
    const driverCostInput = document.getElementById('paintingDriverCostDisplay');
    if (driverCostInput) {
      const savedDriverCost = bd?.driver_cost;
      if (savedDriverCost != null && savedDriverCost !== '') {
        driverCostInput.dataset.manual = 'true';
        driverCostInput.value = parseFloat(savedDriverCost).toFixed(2);
      } else {
        driverCostInput.dataset.manual = 'false';
      }
      driverCostInput.addEventListener('input', () => {
        driverCostInput.dataset.manual = 'true';
        _updatePaintingTransportCosts();
      });
    }
    const gasolineInput = document.getElementById('paintingGasolineInput');
    if (gasolineInput) {
      const savedGasoline = bd?.gasoline;
      const convertedDistance2 = _convertDistanceToMiles(_loadedProjectData?.driving_info?.distance || '');
      const derivedGasoline = _getDistanceDerivedGasoline(convertedDistance2 || '', mobilizationsInput?.value || 0);
      if (savedGasoline != null && savedGasoline !== '') {
        gasolineInput.dataset.manual = 'true';
        gasolineInput.value = parseFloat(savedGasoline).toFixed(2);
      } else {
        gasolineInput.dataset.manual = 'false';
        gasolineInput.value = derivedGasoline > 0 ? derivedGasoline.toFixed(2) : '';
      }
      gasolineInput.addEventListener('input', () => {
        gasolineInput.dataset.manual = 'true';
        _updatePaintingTransportCosts();
      });
    }
    const costPerMileInput = document.getElementById('paintingCostPerMileInput');
    if (costPerMileInput) {
      const savedCostPerMile = bd?.cost_per_mile;
      const restoredCostPerMile = restoreCostPerMileValue(activeProjectId, 'painting');
      const initialCostPerMile = savedCostPerMile != null && savedCostPerMile !== ''
        ? savedCostPerMile
        : (restoredCostPerMile != null && restoredCostPerMile !== '' ? restoredCostPerMile : null);
      if (initialCostPerMile != null && initialCostPerMile !== '') {
        costPerMileInput.dataset.manual = 'true';
        costPerMileInput.value = parseFloat(initialCostPerMile).toFixed(2);
      } else {
        costPerMileInput.dataset.manual = 'false';
        costPerMileInput.value = '';
      }
      costPerMileInput.addEventListener('input', () => {
        costPerMileInput.dataset.manual = 'true';
        _updatePaintingTransportCosts();
      });
    }
    if (daysInput) {
      const handlePaintingDaysInput = () => {
        if (daysInput.readOnly) return;
        _paintingExpectedDaysManual = true;
        if (mobilizationsInput) {
          mobilizationsInput.dataset.manual = 'false';
        }
        _applyPaintingExpectedDaysSplit(daysInput.value);
        _updatePaintingCrewCalcs();
        _syncPaintingMobilizations();
        _updatePaintingTransportCosts();
      };
      daysInput.addEventListener('input', handlePaintingDaysInput);
      daysInput.addEventListener('change', handlePaintingDaysInput);
    }
    // Drive info display
    const di = _loadedProjectData?.driving_info || {};
    const setEditText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setEditText('paintingEditDriveDistance', _convertDistanceToMiles(di.distance));
    setEditText('paintingEditDriveTime', di.duration);
    _paintingPhasesLocked = true;
    _renderPaintingPhaseTable();
    _updatePaintingCrewCalcs();
    ['paintingGasolineInput', 'paintingTollCostInput'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', _updatePaintingTransportCosts);
    });
    document.getElementById('paintingMaterialsInput')?.addEventListener('input', _updatePaintingCrewCalcs);
  });

  const cancelPaintingBtn = document.getElementById('cancelPaintingBtn');
  if (cancelPaintingBtn) cancelPaintingBtn.addEventListener('click', () => {
    if (_loadedProjectData) showPaintingCard(_loadedProjectData);
  });

  const paintingExpectedDaysModifyBtn = document.getElementById('paintingExpectedDaysModifyBtn');
  if (paintingExpectedDaysModifyBtn) paintingExpectedDaysModifyBtn.addEventListener('click', () => {
    _paintingExpectedDaysManual = true;
    const inp = document.getElementById('paintingExpectedDaysInput');
    if (inp) { inp.readOnly = false; inp.classList.remove('bg-gray-50'); inp.focus(); }
    document.getElementById('paintingExpectedDaysModifyBtn').style.display = 'none';
    document.getElementById('paintingExpectedDaysResetBtn').style.display = '';
  });

  const paintingExpectedDaysResetBtn = document.getElementById('paintingExpectedDaysResetBtn');
  if (paintingExpectedDaysResetBtn) paintingExpectedDaysResetBtn.addEventListener('click', () => {
    _paintingExpectedDaysManual = false;
    const inp = document.getElementById('paintingExpectedDaysInput');
    if (inp) { inp.readOnly = true; inp.classList.add('bg-gray-50'); }
    document.getElementById('paintingExpectedDaysModifyBtn').style.display = '';
    document.getElementById('paintingExpectedDaysResetBtn').style.display = 'none';
    _refreshPaintingDays();
    _updatePaintingCrewCalcs();
  });

  const paintingRegenPhasesBtn = document.getElementById('paintingRegenPhasesBtn');
  if (paintingRegenPhasesBtn) paintingRegenPhasesBtn.addEventListener('click', () => {
    const area = parseFloat(document.getElementById('paintingTotalAreaInput')?.value) || 0;
    if (area <= 0) { toast('Enter a Total Area first', 'error'); return; }
    _autoGeneratePaintingPhases(area);
    _paintingExpectedDaysManual = false;
    const derived = _getPaintingAreaDerivedValues(area);
    const materialsInput = document.getElementById('paintingMaterialsInput');
    if (materialsInput && !_paintingMaterialsManual) materialsInput.value = derived.materials.toFixed(2);
    _renderPaintingPhaseTable();
    _updatePaintingCrewCalcs();
  });

  const savePaintingBtn = document.getElementById('savePaintingBtn');
  if (savePaintingBtn) savePaintingBtn.addEventListener('click', async () => {
    if (!activeProjectId) return;
    const rates = _getPaintingRates();
    const totalDaysEl = document.getElementById('paintingExpectedDaysInput');
    if (totalDaysEl && !totalDaysEl.readOnly) {
      _applyPaintingExpectedDaysSplit(totalDaysEl.value);
    }
    const phases = PAINTING_PHASE_IDS.filter(pid => !_deletedPaintingPhaseIds.has(pid)).map((pid, i) => ({
      name: PAINTING_PHASES[i],
      crew: (_paintingPhaseCrews[pid] || []).map(m => ({ ...m })),
      materials: _paintingPhaseMaterials[pid] || 0,
    }));
    const overhead = parseFloat(document.getElementById('paintingOverheadInput')?.value) || 0;
    const profit   = parseFloat(document.getElementById('paintingProfitInput')?.value) || 0;
    const tax      = parseFloat(document.getElementById('paintingTaxInput')?.value) || 0;
    const comm     = parseFloat(document.getElementById('paintingCommissionInput')?.value) || 0;
    const margin   = parseFloat(document.getElementById('paintingMarginInput')?.value) || 0;
    const buildingType = document.getElementById('paintingBuildingTypeSelect')?.value || 'Office / Commercial';
    const gasoline = parseFloat(document.getElementById('paintingGasolineInput')?.value) || 0;
    const tollCost = parseFloat(document.getElementById('paintingTollCostInput')?.value) || 0;
    const mobilizations = parseFloat(document.getElementById('paintingMobilizationsInput')?.value) || 0;
    const driverCost = parseFloat(document.getElementById('paintingDriverCostDisplay')?.value) || 0;
    const costPerMile = parseFloat(document.getElementById('paintingCostPerMileInput')?.value) || 0;
    const totalAreaValue = document.getElementById('paintingTotalAreaInput')?.value;
    const totalArea = totalAreaValue !== '' && Number.isFinite(parseFloat(totalAreaValue))
      ? parseFloat(totalAreaValue)
      : null;
    const primerAreaPerPerson = parseFloat(document.getElementById('paintingPrimerAreaPerPersonInput')?.value) || PAINTING_PRIMER_SF_PER_PERSON_DAY;
    const interiorAreaPerPerson = parseFloat(document.getElementById('paintingInteriorAreaPerPersonInput')?.value) || PAINTING_INTERIOR_SF_PER_PERSON_DAY;
    const paintingExpectedDaysInput = document.getElementById('paintingExpectedDaysInput');
    const expectedDays = paintingExpectedDaysInput && paintingExpectedDaysInput.value !== ''
      ? parseFloat(paintingExpectedDaysInput.value) || null
      : _getPaintingExpectedDaysFromPhases() || null;
    const address = document.getElementById('paintingAddressInput')?.value?.trim() || '';
    const derived = _getPaintingAreaDerivedValues(totalArea);
    const materialsInput = document.getElementById('paintingMaterialsInput');
    const materials = materialsInput && materialsInput.value !== ''
      ? (Number.isFinite(parseFloat(materialsInput.value)) ? parseFloat(materialsInput.value) : derived.materials)
      : derived.materials;
    const scope = document.getElementById('paintingScopeInput')?.value?.trim() || '';
    const comments = document.getElementById('paintingCommentsInput')?.value?.trim() || '';

    const paintRates = _getPaintingRates();
    let paintSubtotal = 0;
    let paintOh = 0;
    let paintPft = 0;
    let paintComm = 0;
    for (const p of phases) {
      const c = _calcPhase(p, paintRates);
      paintSubtotal += c.subtotal;
      paintOh += c.oh;
      paintPft += c.pft;
      paintComm += c.comm;
    }
    const transportCost = gasoline + tollCost;
    const paintTaxBase = paintSubtotal + driverCost + materials + transportCost + paintOh + paintPft + paintComm;
    const paintTax = paintTaxBase * ((tax || 0) / 100);
    const paintFinalPrice = paintTaxBase + paintTax;

    const materialSettings = _getPaintingMaterialSettings();
    const painting_breakdown = {
      phases,
      overhead_pct: overhead,
      profit_pct: profit,
      tax_pct: tax,
      commission_pct: comm,
      margin,
      materials,
      building_type: buildingType,
      building_type_multiplier: _getPaintingBuildingTypeMultiplier(buildingType),
      gasoline,
      toll_cost: tollCost,
      mobilizations,
      driver_cost: driverCost,
      cost_per_mile: costPerMile,
      total_area: totalArea,
      expected_days: expectedDays,
      address,
      scope,
      comments,
      primer_area_per_person: primerAreaPerPerson,
      interior_area_per_person: interiorAreaPerPerson,
      paint_coats: materialSettings.coats,
      paint_surface_condition: materialSettings.surfaceMultiplier,
      paint_surface_condition_key: materialSettings.surface,
      paint_quality: materialSettings.paintPrice,
      paint_quality_key: materialSettings.quality,
      paint_finish_multiplier: materialSettings.finishMultiplier,
      paint_finish_key: materialSettings.finish,
      paint_color_multiplier: materialSettings.colorMultiplier,
      paint_color_key: materialSettings.color,
      primer_type: materialSettings.primerPrice,
      primer_type_key: materialSettings.primer,
      materials_manual: _paintingMaterialsManual,
      subtotal: paintSubtotal,
      overhead: paintOh,
      profit: paintPft,
      tax: paintTax,
      commission: paintComm,
      final_price: paintFinalPrice,
    };

    try {
      const res = await fetch(`${API_BASE}/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ painting_breakdown, total_area: totalArea > 0 ? totalArea : null, gasoline, margin }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      _loadedProjectData = { ..._loadedProjectData, ...updated };
      if (_loadedProjectData) {
        syncLoadedProjectLastEdited(_loadedProjectData);
        _loadedProjectData.total_area = totalArea > 0 ? totalArea : _loadedProjectData.total_area;
        _loadedProjectData.painting_breakdown = {
          ...(_loadedProjectData.painting_breakdown || {}),
          ...painting_breakdown,
          phases,
          total_area: totalArea,
          address,
          comments,
          expected_days: expectedDays,
          cost_per_mile: costPerMile,
          gasoline,
          mobilizations,
          driver_cost: driverCost,
          toll_cost: tollCost,
          final_price: paintFinalPrice,
        };
        _loadedProjectData.gasoline = gasoline;
        _loadedProjectData.mobilizations = mobilizations;
        _loadedProjectData.driver_cost = driverCost;
        _loadedProjectData.toll_cost = tollCost;
        _loadedProjectData.quote = paintFinalPrice;
      }
      persistCostPerMileValue(costPerMile, activeProjectId, 'painting');
      showPaintingCard(_loadedProjectData);
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
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
      const rates = _getRates();
      const phases = _getPhaseInputs();

      const overheadPct = parseFloat(document.getElementById('overheadInput')?.value) || 0;
      const profitPct = parseFloat(document.getElementById('profitInput')?.value) || 0;
      const taxPct = parseFloat(document.getElementById('taxInput')?.value) || 0;
      const buildingType = document.getElementById('buildingTypeSelect')?.value || 'Commercial';
      let totLabor = 0, totSubtotalSave = 0;
      for (const p of phases) {
        const c = _calcPhase(p, rates);
        totLabor += c.laborCost;
        totSubtotalSave += c.subtotal;
      }
      const materialsSave = parseFloat(document.getElementById('materialsInput')?.value) || 0;
      const commPct = parseFloat(document.getElementById('commissionInput')?.value) || 0;
      const gasolineInputValue = document.getElementById('gasolineInput')?.value;
      const gasolineSave = gasolineInputValue !== '' && gasolineInputValue !== undefined ? parseFloat(gasolineInputValue) || 0 : 0;
      const mobilizationsInputValue = document.getElementById('mobilizationsInput')?.value;
      const mobilizationsSave = mobilizationsInputValue !== '' && mobilizationsInputValue !== undefined ? parseFloat(mobilizationsInputValue) || 0 : 0;
      const driverCostInputValue = document.getElementById('driverCostDisplay')?.value;
      const driverCostSave = driverCostInputValue !== '' && driverCostInputValue !== undefined ? parseFloat(driverCostInputValue) || 0 : 0;
      const costPerMileInputValue = document.getElementById('costPerMileInput')?.value;
      const costPerMileSave = costPerMileInputValue !== '' && costPerMileInputValue !== undefined ? parseFloat(costPerMileInputValue) || 0 : 0;
      const subtotalWithDriverSave = totSubtotalSave + driverCostSave;
      const markupBaseSave = subtotalWithDriverSave + materialsSave;
      const ohSave = markupBaseSave * (overheadPct / 100);
      const commSave = markupBaseSave * (commPct / 100);
      const totPftSave = _calcProfitAmount(subtotalWithDriverSave, materialsSave, profitPct / 100);
      const transportCostSave = gasolineSave + (parseFloat(document.getElementById('tollCostInput')?.value) || 0);
      const taxBaseSave = subtotalWithDriverSave + materialsSave + transportCostSave + ohSave + totPftSave + commSave;
      const totTaxSave = taxBaseSave * (taxPct / 100);
      const totFinalPrice = taxBaseSave + totTaxSave;

      const pf = id => parseFloat(document.getElementById(id)?.value) || 0;
      const scope = document.getElementById('cleaningScopeInput')?.value?.trim() || '';
      const comments = document.getElementById('cleaningCommentsInput')?.value?.trim() || '';
      const laborBreakdown = {
        cleaner_rate: rates.cleanerRate,
        foreman_rate: rates.foremanRate,
        overhead_pct: overheadPct,
        profit_pct: profitPct,
        tax_pct: taxPct,
        commission_pct: commPct,
        materials: parseFloat(document.getElementById('materialsInput')?.value) || 0,
        building_type: buildingType,
        building_type_multiplier: _getCleaningBuildingTypeMultiplier(buildingType),
        phases,
        change_orders: _changeOrders.map(co => ({ ...co })),
        scope,
        comments,
      };

      const areaVal = document.getElementById('analysisTotalAreaInput')?.value;
      if (areaVal !== '' && areaVal !== undefined) {
        _analysisAreaManual = true;
        _analysisAreaManualValue = areaVal;
      }
      const addrVal = document.getElementById('analysisAddressInput')?.value?.trim() || '';
      const prevAddr = _loadedProjectData.address || '';
      const tollCostVal = document.getElementById('tollCostInput')?.value;
      const marginVal = document.getElementById('marginInput')?.value;
      const startSel = document.getElementById('startAddressSelect');
      const startCustom = document.getElementById('startAddressInput');
      const startAddrVal = (startSel?.value === 'custom' ? startCustom?.value?.trim() : '') || '';
      const laborTotalSave = totLabor + driverCostSave;
      const body = {
        labor: laborTotalSave > 0 ? laborTotalSave : null,
        labor_breakdown: laborBreakdown,
        quote: totFinalPrice > 0 ? totFinalPrice : null,
        address: addrVal,
        start_address: startAddrVal || null,
      };
      if (areaVal !== '' && areaVal !== undefined) body.total_area = parseFloat(areaVal) ?? null;
      if (gasolineInputValue !== '' && gasolineInputValue !== undefined) body.gasoline = parseFloat(gasolineInputValue) ?? null;
      if (tollCostVal !== '' && tollCostVal !== undefined) body.toll_cost = parseFloat(tollCostVal) ?? null;
      if (mobilizationsInputValue !== '' && mobilizationsInputValue !== undefined) body.mobilizations = parseFloat(mobilizationsInputValue) ?? null;
      if (driverCostInputValue !== '' && driverCostInputValue !== undefined) body.driver_cost = parseFloat(driverCostInputValue) ?? null;
      if (costPerMileInputValue !== '' && costPerMileInputValue !== undefined) body.cost_per_mile = parseFloat(costPerMileInputValue) ?? null;
      const expectedDaysVal = document.getElementById('expectedDaysInput')?.value;
      if (expectedDaysVal !== '' && expectedDaysVal !== undefined) body.expected_days = parseInt(expectedDaysVal) || null;
      if (marginVal !== '' && marginVal !== undefined) body.margin = parseFloat(marginVal) ?? null;

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
        syncLoadedProjectLastEdited(_loadedProjectData);
        _loadedProjectData.labor_breakdown = { ...(_loadedProjectData.labor_breakdown || {}), ...laborBreakdown };
        _loadedProjectData.labor = laborTotalSave;
        _loadedProjectData.quote = totFinalPrice;
        _loadedProjectData.cost_per_mile = costPerMileSave;
        _loadedProjectData.gasoline = gasolineSave;
        _loadedProjectData.mobilizations = mobilizationsSave;
        _loadedProjectData.driver_cost = driverCostSave;
        persistCostPerMileValue(costPerMileSave, activeProjectId, 'analysis');
        if (areaVal !== '' && areaVal !== undefined) {
          _loadedProjectData.total_area = parseFloat(areaVal) ?? _loadedProjectData.total_area;
        }
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

  // Change Order card buttons
  const addCOBtn = document.getElementById('addChangeOrderBtn');
  if (addCOBtn) addCOBtn.addEventListener('click', () => {
    _changeOrders.push({ id: Math.random().toString(36).slice(2), name: `Change Order #${_changeOrders.length + 1}`, crew: [], materials: 0, materials_gc: 0 });
    _renderChangeOrders();
  });

  const saveCOBtn = document.getElementById('saveChangeOrderBtn');
  if (saveCOBtn) saveCOBtn.addEventListener('click', async () => {
    if (!activeProjectId) return;
    const bd = { ...(_loadedProjectData?.labor_breakdown || {}), change_orders: _changeOrders.map(co => ({ ...co })) };
    try {
      saveCOBtn.textContent = 'Saving…'; saveCOBtn.disabled = true;
      const r = await fetch(`${API_BASE}/api/projects/${activeProjectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labor_breakdown: bd }),
      });
      if (!r.ok) throw new Error('Save failed');
      const updated = await r.json();
      _loadedProjectData = { ..._loadedProjectData, ...updated };
      syncLoadedProjectLastEdited(_loadedProjectData);
      toast('Change orders saved', 'info');
    } catch (e) { toast(e.message, 'error'); }
    finally { saveCOBtn.textContent = 'Save All'; saveCOBtn.disabled = false; }
  });

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

  // On narrow (mobile) screens the container is often much narrower than a
  // page rendered at its native scale, so start zoomed out just enough to
  // show the whole page width instead of spilling off the edge. Desktop
  // containers are already wide enough, so this never upscales past 100%.
  async function computeFitZoom(doc, pageNum){
    try {
      if (!pdfContainer || !doc) return 1;
      const page = await doc.getPage(pageNum);
      const vp = page.getViewport({ scale: 1 });
      const availableWidth = pdfContainer.clientWidth;
      if (!availableWidth || !vp.width) return 1;
      const fit = availableWidth / vp.width;
      // No floor here (beyond a sane absolute minimum) — a full-size
      // architectural sheet needs to shrink well past the 0.25 floor used
      // for interactive pinch/wheel zoom (applyZoom) to actually fit a
      // phone-width container. Never upscale past 100% though.
      return Math.max(0.03, Math.min(1, fit));
    } catch (err) {
      return 1;
    }
  }

  async function applyZoom(nextZoom, anchor = null){
    if (!pdfDoc) return;

    _userAdjustedZoom = true;

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

  wireDropdownMenu(detectWallsMenuBtn, $('detectWallsMenuPanel'), async (item) => {
    if (detectWallsMenuBtn.disabled) return;
    // Wall detection has a client-only fallback path (the pixel guesser,
    // wallWorker.js) with no backend call to gate — the vector path is
    // covered by /figures' 402, but this one isn't, so it's checked here
    // instead. Accepted gap: a technically savvy free user could still
    // bypass this specific check via devtools; see
    // estimator-paywall-plan.md §8.
    if (!(await isProCompany())) {
      showPaywallModal('BETA_LOCKED');
      return;
    }
    const forcePixel = item.dataset.detect === 'pixel';
    detectWallsMenuBtn.disabled = true;
    showGlobalLoading(forcePixel ? 'Guessing walls from image…' : 'Finding walls…');
    try {
      await runWallDetection({ forcePixel });
    } finally {
      hideGlobalLoading();
      detectWallsMenuBtn.disabled = false;
    }
  });

  wireDropdownMenu(exportMenuBtn, $('exportMenuPanel'), async (item) => {
    if (exportMenuBtn.disabled) return;
    exportMenuBtn.disabled = true;
    try {
      if (item.dataset.export === 'pdf') {
        // Moved here from the toolbar's Save button, which now just
        // persists the project instead of generating/downloading a file —
        // see exportAllPagesWithAnnotations.
        await exportAllPagesWithAnnotations();
      } else {
        const includeSource = item.dataset.export === 'full';
        await exportPageAnnotations(currentPage, { includeSource });
      }
    } catch (err) {
      console.warn('export failed', err);
      toast('Export failed', 'error');
    } finally {
      exportMenuBtn.disabled = false;
    }
  });

  // ======================================================
  // MOUSE WHEEL ZOOM
  // ======================================================

  if (pdfContainer){

    // A fast trackpad/mouse wheel can fire far more 'wheel' events per
    // second than the (expensive — full PDF re-rasterization) zoom
    // pipeline can keep up with, and unlike pinch-zoom below this had no
    // throttling at all: every single tick used to kick off its own
    // render immediately. Batches ticks to at most one applied zoom per
    // animation frame instead — same net zoom amount for a given amount
    // of scrolling (accumulated as a signed step count and applied in one
    // shot), just far fewer actual re-renders during a fast scroll.
    let wheelZoomStepsPending = 0;
    let wheelRAFPending = false;
    let pendingWheelAnchor = null;

    pdfContainer.addEventListener('wheel', (e)=>{

      if (!pdfDoc) return;

      // prevent zoom while actively dragging a rect, or mid-drag on any
      // other draw tool that still uses one. 'measure' is deliberately
      // left out here -- it's a click-to-place point chain now (no drag),
      // so there's no gesture for a wheel-zoom to interrupt, and blocking
      // zoom for the tool's whole armed duration made it impossible to
      // zoom in/out while tracing a wall outline bigger than one screen.
      try {
        if (overlay && overlay.active && overlay.tool === 'rect') {
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
      if (rect) pendingWheelAnchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      wheelZoomStepsPending += e.deltaY < 0 ? 1 : -1;

      if (wheelRAFPending) return;
      wheelRAFPending = true;
      requestAnimationFrame(async () => {
        wheelRAFPending = false;
        const steps = wheelZoomStepsPending;
        wheelZoomStepsPending = 0;
        if (!steps) return;
        await applyZoom(zoom + steps * 0.1, pendingWheelAnchor);
      });

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

      // do not start panning while measurement tools (or the Select
      // tool's box-select) are active
      if (overlay && overlay.active && (overlay.tool === 'measure' || overlay.tool === 'rect' || overlay.tool === 'select')) return;

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

      // Don't blindly reset to 'grab' here -- this listener fires on every
      // mouseup, including the one that ends drawing a measurement/rect
      // line, not just the one that ends a pan. Stomping the cursor back
      // to 'grab' unconditionally undid the crosshair the draw/measure
      // toggle set, right after finishing the very first line (see
      // isOn ? 'crosshair' : 'grab' below -- same condition, kept in sync).
      const drawModeActive = overlay && overlay.active && (overlay.tool === 'measure' || overlay.tool === 'rect');
      pdfContainer.style.cursor = drawModeActive ? 'crosshair' : 'grab';
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
  // TOUCH: ONE-FINGER PAN + TWO-FINGER PINCH ZOOM
  // ======================================================
  // Mirrors the mouse pan/wheel-zoom behavior above so the PDF is
  // navigable on phones and tablets, where there is no mouse.

  if (pdfContainer){

    let touchMode = null; // 'pan' | 'pinch'
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchAnchor = { x: 0, y: 0 };
    let pinchRAFPending = false;

    const touchDistance = (t0, t1) =>
      Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);

    const touchMidpoint = (t0, t1) => {
      const rect = (pdfWrapper || pdfContainer).getBoundingClientRect();
      return {
        x: (t0.clientX + t1.clientX) / 2 - rect.left,
        y: (t0.clientY + t1.clientY) / 2 - rect.top
      };
    };

    // 'rect' still drags to draw, so touch is fully reserved for it, same
    // as before. 'measure' is a click-to-place point chain now -- a
    // single finger is reserved (so a stray touch near a chain point
    // doesn't nudge the view via panning instead of placing the point),
    // but two-finger pinch-zoom is allowed, same as the wheel handler
    // above -- there's no drag gesture left for it to interrupt.
    const shouldSkipTouch = (e, touchCount) => {
      if (e.target.closest('#toolbar') || e.target.closest('button')) return true;
      if (overlay && overlay.active && overlay.tool === 'rect') return true;
      if (overlay && overlay.active && overlay.tool === 'measure' && touchCount === 1) return true;
      if (overlay && overlay._dragState) return true;
      if (!pdfDoc) return true;
      return false;
    };

    pdfContainer.addEventListener('touchstart', (e)=>{

      if (shouldSkipTouch(e, e.touches.length)) return;

      if (e.touches.length === 1){

        touchMode = 'pan';
        isDragging = true;

        const t = e.touches[0];
        dragStart = {
          x: t.clientX - panOffset.x,
          y: t.clientY - panOffset.y
        };

      } else if (e.touches.length === 2){

        e.preventDefault();

        touchMode = 'pinch';
        isDragging = false;

        pinchStartDist = touchDistance(e.touches[0], e.touches[1]);
        pinchStartZoom = zoom;
        pinchAnchor = touchMidpoint(e.touches[0], e.touches[1]);
      }
    }, { passive: false });

    pdfContainer.addEventListener('touchmove', (e)=>{

      if (!touchMode) return;
      if (overlay && overlay._dragState) return;

      if (touchMode === 'pan' && e.touches.length === 1){

        e.preventDefault();

        const t = e.touches[0];
        panOffset.x = t.clientX - dragStart.x;
        panOffset.y = t.clientY - dragStart.y;

        syncOverlayTransform();

      } else if (touchMode === 'pinch' && e.touches.length === 2){

        e.preventDefault();

        if (!pinchStartDist || pinchRAFPending) return;

        const dist = touchDistance(e.touches[0], e.touches[1]);
        const nextZoom = pinchStartZoom * (dist / pinchStartDist);

        pinchRAFPending = true;
        requestAnimationFrame(async ()=>{
          pinchRAFPending = false;
          await applyZoom(nextZoom, pinchAnchor);
        });
      }
    }, { passive: false });

    const endTouch = (e)=>{

      if (e.touches.length === 0){

        touchMode = null;
        isDragging = false;
        pdfContainer.style.cursor = 'grab';

      } else if (e.touches.length === 1 && touchMode === 'pinch'){

        // Lift one finger out of a pinch: keep panning with the other.
        touchMode = 'pan';
        isDragging = true;

        const t = e.touches[0];
        dragStart = {
          x: t.clientX - panOffset.x,
          y: t.clientY - panOffset.y
        };
      }
    };

    pdfContainer.addEventListener('touchend', endTouch);
    pdfContainer.addEventListener('touchcancel', endTouch);
  }

  // ======================================================
  // KEEP THE PAGE FIT TO ITS BOX WHEN THE BOX RESIZES
  // ======================================================
  // The initial fit-to-width in handleFile() only runs once, right when a
  // file loads. If the box changes size afterward for any reason —
  // rotating a phone, resizing the window, the "Measurements" sidebar
  // opening (taking width away from #pdfPanel) or closing (giving it
  // back) — the already-rendered page never re-fit. Watch the container
  // itself (not just window resize) so any of those cases are covered.
  // Re-fits in BOTH directions (shrink and grow) — it used to only ever
  // shrink, which meant closing the Measurements sidebar freed up width
  // that the page never grew back into, leaving a blank strip where the
  // sidebar had been. Still never fights a zoom level the user picked on
  // purpose (see _userAdjustedZoom).

  if (pdfContainer && typeof ResizeObserver !== 'undefined'){

    let fitResizeTimer = null;

    const fitResizeObserver = new ResizeObserver(()=>{

      if (!pdfDoc || _userAdjustedZoom) return;
      if (mainContent && mainContent.classList.contains('hidden')) return;

      clearTimeout(fitResizeTimer);

      fitResizeTimer = setTimeout(async ()=>{

        const fitZoom = await computeFitZoom(pdfDoc, currentPage);

        // Small epsilon so trivial sub-pixel jitter doesn't re-render in a loop.
        if (Math.abs(fitZoom - zoom) > 0.005){

          zoom = fitZoom;
          await renderPage();
          overlay.resizeToMatchCanvas();
        }
      }, 150);
    });

    fitResizeObserver.observe(pdfContainer);
  }

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

      dropZone.classList.add('border-green-400');
    });

    dropZone.addEventListener('dragleave', ()=>{

      dropZone.classList.remove('border-green-400');
    });

    dropZone.addEventListener('drop', async (e)=>{

      e.preventDefault();

      dropZone.classList.remove('border-green-400');

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

    if (!(await confirmDialog({ title: 'Upload file', message: `Are you sure you want to upload "${file.name}"?`, confirmLabel: 'Upload' }))) return;

    showGlobalLoading('Uploading file…');
    try {
      await handleFile(file);

      const fallbackProjectName = file.name.replace(/\.pdf$/i, '').trim() || file.name;
      const extractedProjectName = fallbackProjectName;
      const extractedAddress = _pdfMetadataSummary?.address || '';
      const extractedArea = _pdfMetadataSummary?.totalArea ?? null;

      // 1. Create project using the uploaded filename as the initial project name
      const projectName = extractedProjectName.trim() || fallbackProjectName;
      console.log('[upload] creating project:', projectName);
      const projectRes = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName })
      });
      if (projectRes.status === 409) {
        const openExisting = await confirmDialog({
          title: 'Project already exists',
          message: `A project named "${projectName}" already exists.\n\nWould you like to open the existing project?`,
          confirmLabel: 'Open existing',
        });
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
            await loadProjectFigureAnalysis(existing.id);
          }
        }
        if (extractedAddress && !normalizeTextLine(freshData.address)) {
          await patchProjectDetails(existing.id, { address: extractedAddress });
          freshData.address = extractedAddress;
        }
        activeProjectId = existing.id;
        restorePageAggregateOverrides(existing.id);
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
      restorePageAggregateOverrides(projectId);
      updateProjectDetails(project);
      console.log('[upload] project created:', projectId);

      const autoPatchPayload = {};
      if (extractedArea != null) {
        autoPatchPayload.total_area = Number(extractedArea);
      }
      if (extractedAddress) {
        autoPatchPayload.address = extractedAddress;
      }
      if (Object.keys(autoPatchPayload).length > 0) {
        await patchProjectDetails(projectId, autoPatchPayload);
      }

      // 2. Upload blueprint
      const formData = new FormData();
      formData.append('file', file);
      console.log('[upload] sending blueprint to backend...');
      const res = await fetch(
        `${API_BASE}/api/projects/${projectId}/blueprint`,
        { method: 'POST', body: formData }
      );
      // Free trial's used up — the proxy already refused this upload
      // server-side (see src/app/api/estimator/proxy/[...path]/route.ts);
      // this just turns that 402 into the paywall modal instead of the
      // generic "Backend upload failed" toast the catch block below would
      // otherwise show.
      if (await handlePaywallResponse(res)) return;
      const data = await res.json();

      console.log('==============================');
      console.log('✅ BACKEND RESPONSE');
      console.log('Saved file:', data.file);
      console.log('PDF Type:', data.type);
      console.log('Result status:', data.status);
      console.log('Result keys:', Object.keys(data.result || data.analysis || {}));
      console.log('FULL RESULT:', data.result || data.analysis || data);
      console.log('==============================');

      let analysis = null;
      if (data.result) {
        analysis = data.result;
      } else if (data.analysis) {
        analysis = data.analysis;
      } else {
        const figures = await fetchProjectFigures(projectId, { retries: 6, delayMs: 1000 });
        if (figures?.status === 'ready' && figures.analysis) {
          analysis = figures.analysis;
        }
      }

      try {
        if (analysis) {
          // Caches for the "Detect Walls" button — doesn't draw anything;
          // the just-uploaded PDF is loaded but no click has happened yet.
          cacheAnalysisResult(analysis);
          refreshWallDetectMethodCaption();
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
    } finally {
      hideGlobalLoading();
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
      if (drawSelectBtn) drawSelectBtn.classList.toggle('active', false);

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
        if (drawSelectBtn) drawSelectBtn.classList.toggle('active', false);

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
        if (drawSelectBtn) drawSelectBtn.classList.toggle('active', false);

        drawIrregBtn.classList.toggle('active', isOn);

        overlay.setActive(isOn);
        overlay.setTool(isOn ? 'irregular' : 'area');

        if (pdfContainer) pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      };
    }

    // Select tool — box-select measurements (see the Select tool comments
    // in CanvasOverlay.js). Mirrors the three tools above exactly: turns
    // the others off, arms/disarms the overlay, same crosshair cursor.
    if (drawSelectBtn) {
      drawSelectBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const isOn = !drawSelectBtn.classList.contains('active');

        if (measureToggle) measureToggle.classList.toggle('active', false);
        if (drawRectBtn) drawRectBtn.classList.toggle('active', false);
        if (drawIrregBtn) drawIrregBtn.classList.toggle('active', false);

        drawSelectBtn.classList.toggle('active', isOn);

        overlay.setActive(isOn);
        overlay.setTool(isOn ? 'select' : 'area');

        if (pdfContainer) pdfContainer.style.cursor = isOn ? 'crosshair' : 'grab';
      };
    }

    // Floating Done/Cancel for an in-progress measure chain or irregular
    // shape (see onChainStateChanged above, which shows/hides #chainActionBar).
    const chainDoneBtn = $('chainDoneBtn');
    if (chainDoneBtn) {
      chainDoneBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.finishActiveChain();
      };
    }

    const chainCancelBtn = $('chainCancelBtn');
    if (chainCancelBtn) {
      chainCancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.cancelActiveChain();
      };
    }

    // Floating trash button for a selected line/measurement (see
    // onSelectionChanged above, which shows/hides #selectionActionBar).
    const selectionDeleteBtn = $('selectionDeleteBtn');
    if (selectionDeleteBtn) {
      selectionDeleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.deleteActiveSelection();
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
      // The sidebar starts visible (no display:none in the markup), but
      // the button's 'active' class only ever got set reactively inside
      // the click handler above -- nothing synced it to that starting
      // state, so the tint didn't show until the first hide-then-show
      // round trip. Derive it from the sidebar's actual current state
      // instead of assuming/hardcoding "starts open", so this stays
      // correct even if that default ever changes.
      const initialSidebar = document.getElementById('measurementSidebar');
      if (initialSidebar) {
        toggleSidebarBtn.classList.toggle('active', initialSidebar.style.display !== 'none');
      }
    }

  if (changeScaleBtn) {
    changeScaleBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const entry = await textPrompt({
        title: 'Change scale',
        message: 'Enter a real-world length (for example: "22 ft 10 in") or a scale expression (for example: "1/16 in = 1 ft").',
      });
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
      window.__saveAnnotations?.();
      toast('Page scale updated', 'success');
    };
  }

  // Reflects whichever state is actually "in charge" of the button right
  // now: the selected measurement(s)' own single/double-sided flag if
  // anything's selected on canvas (one via a plain click, or several via
  // the Select tool's box-select), otherwise the global default new
  // measurements get created with. Called on click (after acting) and
  // from onSelectionChanged (see createCanvasOverlay call) whenever
  // selection changes, so selecting something else updates the button to
  // match it.
  function _syncDoubleSideToggleToSelection() {
    if (!doubleSideToggle) return;
    const selected = overlay.getSelectedLineMeasurements();
    const isDouble = selected.length ? selected.every((m) => m.doubleSided) : overlay.doubleSided;
    doubleSideToggle.classList.toggle('active', isDouble);
    doubleSideToggle.textContent = isDouble ? 'Double sided' : 'Single sided';
    doubleSideToggle.title = selected.length
      ? (selected.length === 1
        ? 'Toggle single/double-sided for the selected measurement'
        : `Toggle single/double-sided for ${selected.length} selected measurements`)
      : 'Toggle single/double-sided measurement';
  }

  if (doubleSideToggle) {
    doubleSideToggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // One or more measurements are selected on canvas — flip *their*
      // flag instead of just the default for new ones. When they're not
      // all in the same state, one click makes them all double-sided
      // (matching everything to the "on" state, same as most bulk
      // toggles) rather than leaving the mixed state ambiguous.
      const selected = overlay.getSelectedLineMeasurements();
      if (selected.length) {
        const allDouble = selected.every((m) => m.doubleSided);
        overlay.setSelectedMeasurementsDoubleSided(!allDouble);
        _syncDoubleSideToggleToSelection();
        return;
      }

      const isDouble = !doubleSideToggle.classList.contains('active');
      overlay.setDoubleSided(isDouble);
      _syncDoubleSideToggleToSelection();
    };
  }

  if (showLabelsToggle) {
    showLabelsToggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOn = !showLabelsToggle.classList.contains('active');
      showLabelsToggle.classList.toggle('active', isOn);
      showLabelsToggle.textContent = isOn ? 'Labels On' : 'Labels Off';
      overlay.setShowLabels(isOn);
    };
  }

  if (dimBackgroundToggle && pdfCanvas) {
    dimBackgroundToggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nextIndex = (Number(dimBackgroundToggle.dataset.dimStep || '0') + 1) % DIM_BACKGROUND_STEPS.length;
      const step = DIM_BACKGROUND_STEPS[nextIndex];
      dimBackgroundToggle.dataset.dimStep = String(nextIndex);
      dimBackgroundToggle.textContent = step.label;
      dimBackgroundToggle.classList.toggle('active', step.key !== 'full');
      pdfCanvas.style.opacity = step.opacity;
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
    // Set by HomeLogoLink.tsx right before navigating, so clicking the logo
    // always lands on a clean home page instead of reopening whatever was
    // last open. Checked here, centrally, rather than by each of this
    // function's two callers (the React effect above, and the unconditional
    // call at the bottom of this script once it finishes loading) — those
    // fire at different, racing times, so whichever read+cleared the flag
    // first would make the other one blind to it.
    if (sessionStorage.getItem('estimator_skip_restore') === '1') {
      sessionStorage.removeItem('estimator_skip_restore');
      return;
    }
    _restoring = true;
    const lastId = sessionStorage.getItem('estimator_last_project_id');
    if (!lastId) { _restoring = false; return; }

    showGlobalLoading('Restoring project…');

    // After Next.js soft navigation, DOM elements are recreated but the JS closure
    // still holds stale references. Reload the page — sessionStorage flag ensures
    // the restore runs correctly after the fresh initApp.
    if (pdfCanvas && !document.contains(pdfCanvas)) {
      window.location.reload();
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/projects/${lastId}`, { cache: 'no-store' });
      if (!res.ok) { sessionStorage.removeItem('estimator_last_project_id'); return; }
      const projData = await res.json();
      const bp = (projData.files || []).find(f => f.file_type === 'blueprint');
      if (!bp) return;
      const resp = await fetch(`${API_BASE}/api/projects/${projData.id}/files/${bp.id}/download`, { redirect: 'follow' });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const fileObj = new File([blob], bp.filename);
      await handleFile(fileObj);
      activeProjectId = projData.id;
      await window.__restoreAnnotations?.(projData.id);
      // Restore page and zoom
      const savedPage = parseInt(sessionStorage.getItem('estimator_last_page') || '1', 10);
      const savedZoom = parseFloat(sessionStorage.getItem('estimator_last_zoom') || '1');
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
      hideGlobalLoading();
    }
  }

  window.__restoreLastProject = restoreLastProject;

  // After soft-nav reload, sessionStorage flag persists — run restore from initApp
  // since useEffect fires before this script finishes loading
  if (sessionStorage.getItem('estimator_last_project_id')) {
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