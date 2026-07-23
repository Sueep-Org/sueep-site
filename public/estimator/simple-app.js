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
            await window.__restoreAnnotations?.(project.id);
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
  let savePdfBtn = $('savePdfBtn') || createSavePdfBtn();
  let sovModal = null;
  let _sovRows = [];
  let _pdfMetadataSummary = null;
  let _pageAggregateOverrides = {};
  let _sovUndoStack = [];
  let _sovStateProjectId = null;
  let _activeExtractedMeasurementQuery = '';
  let _extractedMeasurementHighlightCanvas = null;
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
    onMeasurementsChanged: () => { updateMeasurementList(); window.__saveAnnotations?.(); }
  });

  overlay.attach();

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

  // Per-project annotation persistence via API (with localStorage fallback)
  window.__saveAnnotations = async function() {
    if (!activeProjectId) return;
    const json = highlightsStore.serialize();
    try { localStorage.setItem(`annotations_${activeProjectId}`, json); } catch(_) {}
    try {
      await fetch(`${API_BASE}/api/projects/${activeProjectId}/annotations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations: JSON.parse(json) }),
      });
    } catch(_) {}
  };
  window.__restoreAnnotations = async function(projectId) {
    highlightsStore.clearAll();
    try {
      const res = await fetch(`${API_BASE}/api/projects/${projectId}/annotations`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.annotations) {
          highlightsStore.deserialize(JSON.stringify(data.annotations));
          overlay.redraw();
          updateMeasurementList();
          return;
        }
      }
    } catch(_) {}
    const json = localStorage.getItem(`annotations_${projectId}`);
    if (json) highlightsStore.deserialize(json);
    overlay.redraw();
    updateMeasurementList();
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

  function renderExtractedMeasurementRows(container, rows, meta) {
    const list = container.querySelector('[data-extracted-list]');
    if (!list) return;

    const hasQuery = !!_activeExtractedMeasurementQuery;
    const visibleRows = rows.filter((row) => matchesExtractedMeasurementQuery(row, _activeExtractedMeasurementQuery));

    list.innerHTML = `
      <div class="space-y-2">
        ${visibleRows.map((row, index) => `
          <div class="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2" data-extracted-row-index="${index}">
            <div class="mt-1 space-y-1">
              <label class="block text-[10px] uppercase tracking-wide text-gray-400">Description</label>
              <input
                type="text"
                class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-blue-400"
                data-extracted-field="label"
                data-extracted-index="${index}"
                value="${escapeHtml(row.label || '')}"
              />
              <label class="block text-[10px] uppercase tracking-wide text-gray-400">Measurement</label>
              <input
                type="text"
                class="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:border-blue-400"
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

  function renderExtractedMeasurements(meta) {
    const container = document.getElementById('extractedMeasurementsContainer');
    if (!container) return;

    if (!meta || !Array.isArray(meta.extractedMeasurements) || !meta.extractedMeasurements.length) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    const rows = meta.extractedMeasurements;

    if (!container.querySelector('[data-extracted-search-input]')) {
      container.innerHTML = `
        <div class="mb-2">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Extracted measurements</div>
          <div class="text-xs text-gray-500 mt-1">Detected from the uploaded PDF.</div>
        </div>
        <div class="mb-2">
          <input
            type="search"
            data-extracted-search-input
            value="${escapeHtml(_activeExtractedMeasurementQuery)}"
            placeholder="Search extracted measurements or PDF"
            class="w-full rounded border border-gray-200 px-2 py-1 text-[11px] focus:outline-none focus:border-blue-400"
          />
        </div>
        <div class="max-h-48 overflow-y-auto pr-1" data-extracted-list></div>
      `;
    }

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
  }

  function getVectorPayloadLines(pageData = {}) {
    const candidates = [
      pageData.lines,
      pageData.lineData,
      pageData.vectorLines,
      pageData.wallLines,
      pageData.walls,
      pageData.vector,
      pageData.pageLines
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    return [];
  }

  function coerceLineCoordinates(rawLine = {}, pageWidth = 0, pageHeight = 0) {
    const x1 = Number(rawLine.x1 ?? rawLine.x ?? rawLine.startX ?? rawLine.start?.x ?? rawLine.pt1?.x ?? rawLine.points?.[0]?.x ?? 0);
    const y1 = Number(rawLine.y1 ?? rawLine.y ?? rawLine.startY ?? rawLine.start?.y ?? rawLine.pt1?.y ?? rawLine.points?.[0]?.y ?? 0);
    const x2 = Number(rawLine.x2 ?? rawLine.x ?? rawLine.endX ?? rawLine.end?.x ?? rawLine.pt2?.x ?? rawLine.points?.[1]?.x ?? rawLine.points?.[2]?.x ?? 0);
    const y2 = Number(rawLine.y2 ?? rawLine.y ?? rawLine.endY ?? rawLine.end?.y ?? rawLine.pt2?.y ?? rawLine.points?.[1]?.y ?? rawLine.points?.[2]?.y ?? 0);

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

  async function hydrateDetectedWallsFromResult(result) {
    if (!pdfDoc || !result) return;

    const pages = result?.pages || result;
    const pageEntries = Array.isArray(pages)
      ? pages.map((value, idx) => ({ page: idx + 1, data: value }))
      : Object.keys(pages || {}).map((key) => ({ page: Number(key), data: pages[key] }));

    for (const entry of pageEntries) {
      const pageNum = Number(entry.page || 1);
      const pageData = entry.data || {};
      const lines = getVectorPayloadLines(pageData);
      if (!Array.isArray(lines) || !lines.length) continue;

      const pageViewport = await pdfDoc.getPage(pageNum).then((page) => page.getViewport({ scale: zoom })).catch(() => null);
      const pageWidth = pageViewport?.width || pdfCanvas?.width || 0;
      const pageHeight = pageViewport?.height || pdfCanvas?.height || 0;
      const normalized = lines.map((line, idx) => coerceLineCoordinates(line, pageWidth, pageHeight));
      highlightsStore.setLines(pageNum, normalized);
      console.log(`[vector] loaded ${normalized.length} wall lines for page ${pageNum}`);
    }

    overlay.redraw();
    updateVectorLineInfo();
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
    const columns = getSovColumns();
    columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column.label;
      th.style.cssText = 'padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb;color:#111827;white-space:nowrap;';
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
              <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <button type="button" class="mini-btn" data-delete-sov-row="${row.page}" style="padding:2px 6px;min-width:auto;font-size:11px;line-height:1;">×</button>
                  <span>${escapeHtml(row.page)}</span>
                </div>
              </td>
            `;
          case 'description':
            return `
              <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">
                <input type="text" value="${escapeHtml(row.description)}" data-sov-description="${row.page}" style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;color:#111827;background:white;" />
              </td>
            `;
          default:
            return `
              <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;color:#111827;">
                <input type="text" value="${escapeHtml(formatSovCurrency(row[column.key]))}" data-sov-amount="${row.page}" data-sov-key="${column.key}" style="width:110px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;color:#111827;background:white;" />
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
    const visibleRows = rows.filter((row) => hasVisibleSovRow(row));
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
    } finally {
      savePdfBtn.disabled = false;
      savePdfBtn.textContent = originalSaveText;
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
    // Get measurements for the viewed page (not current PDF page)
    const measurements = highlightsStore.listMeasurements(measurementViewPage) || [];
    const scale = getVisibleScaleInfo(measurementViewPage);
    
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
    const aggregateTotals = getPageAggregateTotals(measurementViewPage);
    const pageTotalInches = aggregateTotals.length;
    const pageTotalArea = aggregateTotals.area;

    // All pages totals including area
    const allPageMeasurements = highlightsStore.listMeasurementsAllPages ? highlightsStore.listMeasurementsAllPages() : [];
    const allTotalInches = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.inches) || 0), 0);
    }, 0);
    const allTotalArea = allPageMeasurements.reduce((sum, pageEntry) => {
      return sum + pageEntry.measurements.reduce((pageSum, item) => pageSum + (Number(item.area) || 0), 0);
    }, 0);

    if (measurementPageAggregateInfo) {
      measurementPageAggregateInfo.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>Page ${measurementViewPage} total:</span>
          <input type="number" step="0.01" value="${escapeHtml(pageTotalInches)}" data-aggregate-kind="length" style="width:72px;font-size:11px;padding:2px 4px;" />
          <span>| Area:</span>
          <input type="number" step="0.01" value="${escapeHtml(pageTotalArea)}" data-aggregate-kind="area" style="width:72px;font-size:11px;padding:2px 4px;" />
          <span>sq</span>
        </div>
      `;
      measurementPageAggregateInfo.querySelectorAll('input[data-aggregate-kind]').forEach((input) => {
        input.onchange = () => {
          const parsedValue = Number(input.value);
          if (!Number.isFinite(parsedValue) || parsedValue < 0) {
            toast('Please enter a valid non-negative value', 'error');
            updateMeasurementList();
            return;
          }

          const pageTotalDisplay = measurementPageAggregateInfo?.querySelector('input[data-aggregate-kind="length"]');
          const pageAreaDisplay = measurementPageAggregateInfo?.querySelector('input[data-aggregate-kind="area"]');
          if (input.dataset.aggregateKind === 'length') {
            _pageAggregateOverrides[measurementViewPage] = {
              ...( _pageAggregateOverrides[measurementViewPage] || {}),
              length: parsedValue
            };
            if (pageTotalDisplay) pageTotalDisplay.value = parsedValue;
            if (pageAreaDisplay) pageAreaDisplay.value = pageAreaDisplay.value ?? pageTotalArea;
          } else {
            _pageAggregateOverrides[measurementViewPage] = {
              ...( _pageAggregateOverrides[measurementViewPage] || {}),
              area: parsedValue
            };
            if (pageAreaDisplay) pageAreaDisplay.value = parsedValue;
            if (pageTotalDisplay) pageTotalDisplay.value = pageTotalDisplay.value ?? pageTotalInches;
          }

          updateMeasurementList();
          overlay.redraw();
          toast('Page total updated', 'info');
        };
        input.onkeydown = (event) => {
          if (event.key === 'Enter') input.blur();
        };
      });
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

    sessionStorage.setItem('estimator_last_page', currentPage);
    sessionStorage.setItem('estimator_last_zoom', zoom);

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
    redrawExtractedMeasurementHighlights();

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
    if (projData?.id) sessionStorage.setItem('estimator_last_project_id', projData.id);
    window.__estimatorProjectLoaded = true;

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
    window.__estimatorProjectLoaded = false;
    sessionStorage.removeItem('estimator_last_project_id');
    sessionStorage.removeItem('estimator_last_page');
    sessionStorage.removeItem('estimator_last_zoom');
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
        const di = data.driving_info || {};
        const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
        setText('detailDistance', di.distance);
        setText('detailDuration', di.duration);
        setText('editDriveDistance', di.distance);
        setText('editDriveTime', di.duration);
        if (_loadedProjectData) _loadedProjectData.driving_info = di;
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
  let _deletedPhaseIds = new Set();
  let _expectedDaysManual = false;
  let _phasesLocked = true;

  function _autoGeneratePhases(totalArea) {
    const area = parseFloat(totalArea) || 0;
    if (area <= 0) return;
    const uid = () => Math.random().toString(36).slice(2);
    const roughDays = Math.ceil(area / 9000);
    const finalDays = Math.ceil(area / 7500);
    const touchupDays = Math.ceil(area / 6000);
    _phaseCrews.rough = [
      { role: 'cleaner', rate: 22, days: roughDays, _uid: uid() },
      { role: 'cleaner', rate: 22, days: roughDays, _uid: uid() },
      { role: 'cleaner', rate: 22, days: roughDays, _uid: uid() },
      { role: 'foreman', rate: 220, days: roughDays, _uid: uid() },
    ];
    _phaseCrews.final = [
      { role: 'cleaner', rate: 22, days: finalDays, _uid: uid() },
      { role: 'cleaner', rate: 22, days: finalDays, _uid: uid() },
      { role: 'cleaner', rate: 22, days: finalDays, _uid: uid() },
      { role: 'foreman', rate: 220, days: finalDays, _uid: uid() },
    ];
    _phaseCrews.touchup = [
      { role: 'cleaner', rate: 22, days: touchupDays, _uid: uid() },
      { role: 'foreman', rate: 220, days: touchupDays, _uid: uid() },
    ];
    _deletedPhaseIds = new Set();
  }

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
    return PHASE_IDS
      .filter(pid => !_deletedPhaseIds.has(pid))
      .map((pid, i) => {
        const actualIdx = PHASE_IDS.indexOf(pid);
        return {
          name: PHASES[actualIdx],
          crew: (_phaseCrews[pid] || []).map(m => ({ ...m })),
          persons: (_phaseCrews[pid] || []).filter(m => m.role === 'cleaner').length,
          days: Math.max(0, ...(_phaseCrews[pid] || []).map(m => m.days || 0), 0),
        };
      });
  }

  function _updateCrewCalcs() {
    const rates = _getRates();
    const overheadPct = parseFloat(document.getElementById('overheadInput')?.value) || 0;
    const profitPct = parseFloat(document.getElementById('profitInput')?.value) || 0;
    const taxPct = parseFloat(document.getElementById('taxInput')?.value) || 0;
    const commPct = parseFloat(document.getElementById('commissionInput')?.value) || 0;

    let totLabor = 0, totSubtotal = 0, totOh = 0, totPft = 0, totPrice = 0, totTaxes = 0, totComm = 0, totFinal = 0;

    PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach((pid) => {
      const crew = _phaseCrews[pid] || [];
      const c = _calcPhase({ crew }, rates);
      totLabor += c.laborCost; totSubtotal += c.subtotal; totOh += c.oh;
      totPft += c.pft; totPrice += c.price; totTaxes += c.taxes; totComm += c.comm; totFinal += c.finalPrice;

      crew.forEach((m) => {
        const pay = m.role === 'cleaner' ? (m.rate||0)*(m.days||0)*8 : (m.rate||0)*(m.days||0);
        const el = document.getElementById(`crew_pay_${m._uid}`);
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
  }

  const _updateCalcCells = _updateCrewCalcs;

  function _renderPhaseTable() {
    const container = document.getElementById('phaseTableContainer');
    if (!container) return;
    container.innerHTML = '';

    if (_phasesLocked) {
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:8px;';
      const editBtn = document.createElement('button');
      editBtn.type = 'button'; editBtn.textContent = 'Edit Phases';
      editBtn.style.cssText = 'padding:4px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;color:#374151;font-size:12px;cursor:pointer;';
      editBtn.onclick = () => { _phasesLocked = false; _renderPhaseTable(); };
      bar.appendChild(editBtn);
      container.appendChild(bar);

      const rates = _getRates();
      PHASE_IDS.filter(pid => !_deletedPhaseIds.has(pid)).forEach((pid, i) => {
        const actualIdx = PHASE_IDS.indexOf(pid);
        const crew = _phaseCrews[pid] || [];
        const c = _calcPhase({ crew }, rates);
        const days = crew.length > 0 ? Math.max(...crew.map(m => m.days || 0)) : 0;
        const cleaners = crew.filter(m => m.role === 'cleaner').length;
        const foremen = crew.filter(m => m.role === 'foreman').length;
        const pms = crew.filter(m => m.role === 'project_manager').length;

        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;';
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;';
        const nameEl = document.createElement('span');
        nameEl.textContent = PHASES[actualIdx];
        nameEl.style.cssText = 'font-weight:600;font-size:13px;color:#374151;';
        const summary = document.createElement('span');
        const parts = [];
        if (cleaners) parts.push(`${cleaners} Cleaner${cleaners > 1 ? 's' : ''}`);
        if (foremen) parts.push(`${foremen} Foreman`);
        if (pms) parts.push(`${pms} PM`);
        summary.textContent = `${parts.join(', ')} · ${days} day${days !== 1 ? 's' : ''} · Labor: ${fmt$(c.laborCost)}`;
        summary.style.cssText = 'font-size:12px;color:#6b7280;';
        header.appendChild(nameEl); header.appendChild(summary);
        section.appendChild(header);
        container.appendChild(section);
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
          _phaseCrews[pid].push({ role, rate: defaultRate, days: 1, _uid: Math.random().toString(36).slice(2) });
          _renderPhaseTable();
        };
        return btn;
      };
      addBtns.appendChild(mkAddBtn('+ Cleaner', 'cleaner', '#2563eb', '#eff6ff', '#93c5fd', parseFloat(document.getElementById('cleanerRateInput')?.value) || 22));
      addBtns.appendChild(mkAddBtn('+ Foreman', 'foreman', '#16a34a', '#f0fdf4', '#86efac', parseFloat(document.getElementById('foremanRateInput')?.value) || 220));
      addBtns.appendChild(mkAddBtn('+ Project Manager', 'project_manager', '#7c3aed', '#f5f3ff', '#c4b5fd', 300));

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
        ['Role', 'Name', 'Rate', 'Days', 'Pay', ''].forEach((h, hi) => {
          const th = document.createElement('th');
          th.textContent = h;
          th.style.cssText = `text-align:${hi >= 3 ? 'right' : 'left'};padding:5px 10px;color:#6b7280;font-weight:500;background:#fafafa;font-size:11px;border-bottom:1px solid #e5e7eb;`;
          hrow.appendChild(th);
        });
        const roleOrder = { cleaner: 0, foreman: 1, project_manager: 2 };
        const sortedCrew = [...crew].sort((a, b) => (roleOrder[a.role] ?? 1) - (roleOrder[b.role] ?? 1));
        const tbody = table.createTBody();
        sortedCrew.forEach((member, idx) => {
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
          rateLabel.textContent = '$/day';
          rateLabel.style.cssText = 'font-size:11px;color:#6b7280;white-space:nowrap;';
          rateWrap.appendChild(rateInput); rateWrap.appendChild(rateLabel);
          rateTd.appendChild(rateWrap);

          const daysTd = tr.insertCell(); daysTd.style.cssText = 'padding:4px 10px;text-align:right;';
          const daysInput = document.createElement('input');
          daysInput.type = 'number'; daysInput.min = '0'; daysInput.step = '0.5'; daysInput.value = member.days;
          daysInput.style.cssText = iStyle + 'width:56px;';
          daysInput.addEventListener('input', () => { member.days = parseFloat(daysInput.value) || 0; _updateCrewCalcs(); });
          daysTd.appendChild(daysInput);

          const payTd = tr.insertCell();
          payTd.id = `crew_pay_${member._uid || idx}`;
          payTd.style.cssText = 'padding:5px 10px;text-align:right;color:#374151;font-weight:500;white-space:nowrap;';
          const pay = member.role === 'cleaner' ? (member.rate||0)*(member.days||0)*8 : (member.rate||0)*(member.days||0);
          payTd.textContent = fmt$(pay);

          const delTd = tr.insertCell(); delTd.style.cssText = 'padding:4px 8px;text-align:right;';
          const delBtn = document.createElement('button');
          delBtn.type = 'button'; delBtn.textContent = '\u00d7';
          delBtn.style.cssText = 'padding:2px 6px;border:1px solid #fca5a5;border-radius:4px;background:white;color:#ef4444;font-size:13px;cursor:pointer;line-height:1;';
          delBtn.onclick = () => { const realIdx = _phaseCrews[pid].indexOf(member); if (realIdx !== -1) _phaseCrews[pid].splice(realIdx, 1); _renderPhaseTable(); };
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

    const resolvedAddress = [projData.address, _pdfMetadataSummary?.address].find((value) => normalizeTextLine(value)) || '';
    const resolvedArea = _pdfMetadataSummary?.totalArea ?? projData.total_area;
    const resolvedName = _pdfMetadataSummary?.projectName || projData.name || '';

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

    setText('analysisViewAddress', resolvedAddress || '');
    const DEFAULT_OFFICE = '2 Bala Plaza, Bala Cynwyd, PA 19004';
    setText('analysisViewStartAddress', projData.start_address || DEFAULT_OFFICE);
    const lps = (projData.labor != null && resolvedArea) ? (projData.labor / resolvedArea) : null;
    setText('analysisViewLabor', fmt$(projData.labor));
    setText('analysisViewTotalArea', fmtSF(resolvedArea));
    setText('analysisViewQuote', fmt$(projData.quote));
    setText('analysisViewLaborPerSF', lps != null ? `$${lps.toFixed(4)}/SF` : '—');
    setText('analysisViewGasoline', projData.gasoline != null ? fmt$(projData.gasoline) : '—');
    setText('analysisViewMargin', projData.margin != null ? fmt$(projData.margin) : '—');
    setText('detailTollCost', projData.toll_cost != null ? fmt$(projData.toll_cost) : '—');
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
    _deletedPhaseIds = new Set();

    if (bd && bd.phases) {
      setVal('cleanerRateInput', bd.cleaner_rate ?? 22);
      setVal('foremanRateInput', bd.foreman_rate ?? 220);
      setVal('overheadInput', bd.overhead_pct ?? 10);
      setVal('profitInput', bd.profit_pct ?? 25);
      setVal('taxInput', bd.tax_pct ?? 6);
      setVal('commissionInput', bd.commission_pct ?? 10);

      const savedPids = new Set();
      for (const p of bd.phases) {
        const pid = phaseMap[p.name];
        if (!pid) continue;
        savedPids.add(pid);
        if (p.crew && p.crew.length > 0) {
          _phaseCrews[pid] = p.crew.map(m => ({ ...m, _uid: m._uid || Math.random().toString(36).slice(2) }));
        } else {
          // Convert old format (persons/days + global rates) to crew
          const cr = bd.cleaner_rate || 22;
          const fr = bd.foreman_rate || 220;
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
          _phaseCrews[pid] = [{ role: 'cleaner', rate: 22, days: 2, _uid: Math.random().toString(36).slice(2) }, { role: 'foreman', rate: 220, days: 2, _uid: Math.random().toString(36).slice(2) }];
        });
      }
    }
    _phasesLocked = true;

    _renderPhaseTable();

    const regenPhasesBtn = document.getElementById('regenPhasesBtn');
    if (regenPhasesBtn) regenPhasesBtn.onclick = () => {
      const area = parseFloat(document.getElementById('analysisTotalAreaInput')?.value) || 0;
      if (!area) { alert('Please set Total Area first.'); return; }
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
        ? 'w-32 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400'
        : 'w-32 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none';
    }
    if (modifyBtn) modifyBtn.style.display = _expectedDaysManual ? 'none' : '';
    if (resetBtn) resetBtn.style.display = _expectedDaysManual ? '' : 'none';

    if (modifyBtn) modifyBtn.onclick = () => {
      _expectedDaysManual = true;
      if (daysInput) { daysInput.readOnly = false; daysInput.className = 'w-32 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400'; daysInput.focus(); }
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
    setVal('analysisTotalAreaInput', autoTotalArea ?? _loadedProjectData.total_area);
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
    if (totalAreaInput) totalAreaInput.addEventListener('change', _regenPhasesFromAreaInput);
    if (totalAreaModifyBtn) totalAreaModifyBtn.onclick = () => {
      if (totalAreaInput) { totalAreaInput.readOnly = false; totalAreaInput.className = 'w-40 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-400'; totalAreaInput.focus(); }
      totalAreaModifyBtn.style.display = 'none';
      if (totalAreaResetBtn) totalAreaResetBtn.style.display = autoTotalArea != null ? '' : 'none';
    };
    if (totalAreaResetBtn) totalAreaResetBtn.onclick = () => {
      if (totalAreaInput) { totalAreaInput.readOnly = true; totalAreaInput.className = 'w-40 border border-gray-200 rounded px-3 py-1.5 text-sm bg-gray-50 text-gray-700 focus:outline-none'; }
      setVal('analysisTotalAreaInput', autoTotalArea ?? _loadedProjectData.total_area);
      totalAreaResetBtn.style.display = 'none';
      if (totalAreaModifyBtn) totalAreaModifyBtn.style.display = '';
      _regenPhasesFromAreaInput();
    };
    setVal('analysisAddressInput', (_loadedProjectData.address || _pdfMetadataSummary?.address || '').toString());
    setVal('gasolineInput', _loadedProjectData.gasoline);
    setVal('tollCostInput', _loadedProjectData.toll_cost);
    setVal('expectedDaysInput', _loadedProjectData.expected_days);
    setVal('marginInput', _loadedProjectData.margin);

    const di = _loadedProjectData.driving_info || {};
    const setEditText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '—'; };
    setEditText('editDriveDistance', di.distance);
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
      const tollCostVal = document.getElementById('tollCostInput')?.value;
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
      if (areaVal !== '' && areaVal !== undefined) body.total_area = parseFloat(areaVal) ?? null;
      if (gasolineVal !== '' && gasolineVal !== undefined) body.gasoline = parseFloat(gasolineVal) ?? null;
      if (tollCostVal !== '' && tollCostVal !== undefined) body.toll_cost = parseFloat(tollCostVal) ?? null;
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
        if (extractedAddress && !normalizeTextLine(freshData.address)) {
          await patchProjectDetails(existing.id, { address: extractedAddress });
          freshData.address = extractedAddress;
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
        await hydrateDetectedWallsFromResult(pages || data.result);
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
    const lastId = sessionStorage.getItem('estimator_last_project_id');
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