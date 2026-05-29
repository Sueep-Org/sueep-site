import { toast } from '../toast.js';

export class CanvasOverlay {
  constructor({ wrapperEl, canvasEl, store, onMeasurementsChanged }) {
    this.wrapperEl = wrapperEl;
    this.canvasEl = canvasEl;
    this.store = store;
    this.onMeasurementsChanged = onMeasurementsChanged || null;

    this.overlay = null;
    this.ctx = null;

    this.active = false;
    this.currentPage = 1;

    this.hoverPoly = null;

    // vector line interaction state
    this._hoverLineId = null;
    this._selectedLineIds = new Set();
    this._hoverMeasurementId = null;
    this._selectedMeasurementId = null;

    this._edgeWorker = null;
    this._fillWorker = null;
    this._barrierState = null;

    this.tool = 'area';

    this.zoom = 1;
    this._pxPerPt = 1;
    this.doubleSided = false;
    // drag-to-measure state
    this._isDraggingMeasure = false;
    this._measureStart = null; // {x,y}
    this._measurePreview = null; // {x1,y1,x2,y2}
  }

  attach() {
    const c = document.createElement('canvas');

    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    c.style.pointerEvents = 'none';

    this.wrapperEl.style.position = 'relative';
    this.wrapperEl.appendChild(c);

    this.overlay = c;
    this.ctx = c.getContext('2d');

    this._ensureWorkers();
    this.resizeToMatchCanvas();
    this._bindEvents();
    // prevent default wheel behavior on overlay to avoid zooming while drawing
    this.overlay.addEventListener('wheel', (ev) => {
      if (this._isDraggingMeasure) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      }
    }, { passive: false });
  }

  setActive(active) {
    this.active = active;
    this.overlay.style.pointerEvents = active ? 'auto' : 'none';
  }

  setTool(t) {
    this.tool = t;
    this.hoverPoly = null;
    this.redraw();
  }

  setPanOffset() {}

  setZoomPan({ zoom }) {
    this.zoom = zoom;
  }

  setPdfSpace({ pxPerPt }) {
    this._pxPerPt = pxPerPt;
  }

  setCurrentPage(p) {
    this.currentPage = p;
    this.hoverPoly = null;
    this.redraw();
  }

  setDoubleSided(value) {
    this.doubleSided = Boolean(value);
    this.redraw();
  }

  _ensureWorkers() {
    if (!this._edgeWorker) {
      this._edgeWorker = new Worker(
        new URL('../smartfill/edgeWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._edgeWorker.onmessage = (e) => {
        const d = e.data;

        if (d.type === 'barriers') {
          this._barrierState = {
            dsWidth: d.dsWidth,
            dsHeight: d.dsHeight,
            scale: d.scale,
            barrierMask: new Uint8Array(d.barrierMask),
          };

          this.redraw();
        }
      };
    }

    if (!this._fillWorker) {
      this._fillWorker = new Worker(
        new URL('../smartfill/fillWorker.js', import.meta.url),
        { type: 'module' }
      );

      this._fillWorker.onmessage = (e) => {
        const d = e.data;

        if (d.type === 'preview') {
          this.hoverPoly = d.ok ? d.polygon : null;
          this.redraw();
        }

        if (d.type === 'commit') {
          if (d.ok) {
            const w = this.overlay.width;
            const h = this.overlay.height;

            const norm = d.polygon.map(p => ({
              x: p.x / w,
              y: p.y / h
            }));

            this.store.addPolygon(this.currentPage, {
              points: norm
            });

            // =========================
            // ✅ MEASUREMENT LOGIC
            // =========================

            const areaPx = calculatePolygonArea(d.polygon);
            const areaScaled = applyScale(areaPx, this._pxPerPt);

            const perimeterPx = calculatePerimeter(d.polygon);
            const perimeterScaled = applyScaleLength(perimeterPx, this._pxPerPt);

            toast(
              `Area: ${areaScaled.toFixed(2)} sq units | Perimeter: ${perimeterScaled.toFixed(2)} units`,
              'info'
            );

            this.hoverPoly = null;
            this.redraw();
          } else {
            toast('No room detected', 'error');
          }
        }
      };
    }
  }

  buildBarriersFromCanvas() {
    if (!this._edgeWorker || !this.canvasEl) return;

    const ctx = this.canvasEl.getContext('2d');

    const img = ctx.getImageData(
      0,
      0,
      this.canvasEl.width,
      this.canvasEl.height
    );

    this._edgeWorker.postMessage({
      imageData: img,
      width: this.canvasEl.width,
      height: this.canvasEl.height
    });
  }

  _bindEvents() {
    this.overlay.addEventListener('pointerdown', this._onPointerDown);
    this.overlay.addEventListener('pointermove', this._onPointerMove);
    this.overlay.addEventListener('pointerup', this._onPointerUp);
    this.overlay.addEventListener('click', this._onClick);
    this.overlay.addEventListener('pointercancel', this._onPointerCancel);
  }

  _onPointerMove = (e) => {
    if (!this.active) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // if user is dragging a measure line, update preview and skip hover logic
    if (this.tool === 'measure' && this._isDraggingMeasure && this._measureStart) {
      this._measurePreview = { x1: this._measureStart.x, y1: this._measureStart.y, x2: x, y2: y };
      this.redraw();
      return;
    }

    if (this.tool === 'area') {
      if (!this._barrierState) return;
      this._fillWorker.postMessage({ type: 'preview', seedX: x, seedY: y, ...this._barrierState });
      return;
    }

    const w = this.overlay.width;
    const h = this.overlay.height;

    // measure/tool: hover test nearest vector line
    const lines = this.store.getLines(this.currentPage) || [];
    let nearestLine = null;
    let nearestLineDist = Infinity;

    for (const ln of lines) {
      const a = { x: (ln.x1 || ln.x) * w, y: (ln.y1 || ln.y) * h };
      const b = { x: (ln.x2 || ln.x1) * w, y: (ln.y2 || ln.y1) * h };
      const d = pointToSegmentDistance({ x, y }, a, b);
      if (d < nearestLineDist) { nearestLineDist = d; nearestLine = ln; }
    }

    const measurements = this.store.listMeasurements(this.currentPage) || [];
    let nearestMeasurement = null;
    let nearestMeasurementDist = Infinity;

    for (const m of measurements) {
      if (!m.pts || !m.pts.length) continue;
      for (const seg of m.pts) {
        const a = { x: seg.x1 * w, y: seg.y1 * h };
        const b = { x: seg.x2 * w, y: seg.y2 * h };
        const d = pointToSegmentDistance({ x, y }, a, b);
        if (d < nearestMeasurementDist) {
          nearestMeasurementDist = d;
          nearestMeasurement = m;
        }
      }
    }

    const hoverLineId = (nearestLine && nearestLineDist < Math.max(6, 6 * (this.zoom || 1))) ? (nearestLine.id || nearestLine.__id) : null;
    const hoverMeasurementId = (nearestMeasurement && nearestMeasurementDist < Math.max(8, 8 * (this.zoom || 1))) ? nearestMeasurement.id : null;

    if (hoverLineId !== this._hoverLineId || hoverMeasurementId !== this._hoverMeasurementId) {
      this._hoverLineId = hoverLineId;
      this._hoverMeasurementId = hoverMeasurementId;
      this.redraw();
    }
  };

  _onPointerDown = (e) => {
    if (!this.active) return;
    if (this.tool !== 'measure') return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this._isDraggingMeasure = true;
    this._measureStart = { x, y };
    this._measurePreview = { x1: x, y1: y, x2: x, y2: y };
    try { if (this.overlay.setPointerCapture) this.overlay.setPointerCapture(e.pointerId); } catch (err) {}
    this.redraw();
  };

  _onPointerUp = (e) => {
    if (!this.active) return;
    if (this.tool !== 'measure') return;

    if (!this._isDraggingMeasure || !this._measureStart) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const start = this._measureStart;
    const end = { x, y };

    // reset preview state
    this._isDraggingMeasure = false;
    this._measureStart = null;
    this._measurePreview = null;
    try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}

    const pixelLength = Math.hypot(end.x - start.x, end.y - start.y) || 0;
    if (pixelLength <= 2) { this.redraw(); return; }

    let scaleFactor = this.store.getScale(this.currentPage)?.factor;
    if (!scaleFactor) {
      const entry = window.prompt('Enter page scale for this line (examples: "1/16 in = 1 ft" or "3 ft"). Leave blank to cancel:');
      if (!entry || !entry.trim()) { this.redraw(); return; }

      scaleFactor = computeScaleFactorFromExpression(entry.trim(), pixelLength, this._pxPerPt);
      if (!scaleFactor || !(scaleFactor > 0)) {
        toast('Failed to parse scale expression', 'error');
        this.redraw();
        return;
      }

      this.store.setScale(this.currentPage, { factor: scaleFactor, unit: 'in' });
      toast('Scale saved for this page', 'success');
    }

    // compute the real-world inches for this drawn line
    const realInchesForLine = pixelLength * scaleFactor;

    // store measurement record (normalized coordinates)
    const label = formatInches(realInchesForLine);
    this.store.addMeasurement(this.currentPage, {
      id: `drag-${Date.now()}`,
      inches: realInchesForLine,
      label,
      at: Date.now(),
      doubleSided: this.doubleSided,
      pts: [{ x1: start.x / this.overlay.width, y1: start.y / this.overlay.height, x2: end.x / this.overlay.width, y2: end.y / this.overlay.height }]
    });

    this.onMeasurementsChanged?.();
    toast(`Measured: ${label}`, 'success');

    this.redraw();
  };

  _onPointerCancel = (e) => {
    if (this._isDraggingMeasure) {
      this._isDraggingMeasure = false;
      this._measureStart = null;
      this._measurePreview = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}
      this.redraw();
    }
  };

  

  _onClick = (e) => {
    if (!this.active) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.tool === 'area') {
      if (!this._barrierState) return;
      this._fillWorker.postMessage({ type: 'commit', seedX: x, seedY: y, ...this._barrierState });
      return;
    }

    // measurement / line click behavior
    const lines = this.store.getLines(this.currentPage) || [];
    const w = this.overlay.width;
    const h = this.overlay.height;

    let nearest = null;
    let nearestDist = Infinity;

    for (const ln of lines) {
      const a = { x: (ln.x1 || ln.x) * w, y: (ln.y1 || ln.y) * h };
      const b = { x: (ln.x2 || ln.x1) * w, y: (ln.y2 || ln.y1) * h };
      const d = pointToSegmentDistance({ x, y }, a, b);
      if (d < nearestDist) { nearestDist = d; nearest = ln; }
    }

    const measurements = this.store.listMeasurements(this.currentPage) || [];
    if (measurements.length) {
      let nearestMeasurement = null;
      let nearestMeasurementDist = Infinity;
      let nearestMeasurementSeg = null;

      for (const m of measurements) {
        if (!m.pts) continue;
        for (const seg of m.pts) {
          const a = { x: seg.x1 * w, y: seg.y1 * h };
          const b = { x: seg.x2 * w, y: seg.y2 * h };
          const d = pointToSegmentDistance({ x, y }, a, b);
          if (d < nearestMeasurementDist) {
            nearestMeasurementDist = d;
            nearestMeasurement = m;
            nearestMeasurementSeg = { a, b };
          }
        }
      }

      if (nearestMeasurement && nearestMeasurementDist <= Math.max(10, 10 * (this.zoom || 1))) {
        if (e.altKey) {
          this.store.removeMeasurement(this.currentPage, nearestMeasurement.id);
          this.onMeasurementsChanged?.();
          toast('Measurement removed', 'info');
          this.redraw();
          return;
        }
        this._selectedMeasurementId = nearestMeasurement.id;
        this.redraw();
        return;
      }
    }

    if (!nearest || nearestDist > Math.max(8, 8 * (this.zoom || 1))) return;

    const id = nearest.id || nearest.__id;

    if (e.ctrlKey || e.metaKey) {
      // toggle selection
      if (this._selectedLineIds.has(id)) this._selectedLineIds.delete(id); else this._selectedLineIds.add(id);
      this.redraw();
      return;
    }

    // single-select
    this._selectedLineIds.clear();
    this._selectedLineIds.add(id);

    // calibration prompt: ask user for real-world length (in inches)
    const pixelLength = Math.hypot((nearest.x2 - nearest.x1) * w || 0, (nearest.y2 - nearest.y1) * h || 0) || 0;

    const existingScale = this.store.getScale(this.currentPage);

    let scaleFactor = existingScale?.factor;
    if (!scaleFactor) {
      const entry = window.prompt('Enter page scale for this line (examples: "1/16 in = 1 ft" or "3 ft"). Leave blank to cancel:');
      if (!entry || !entry.trim()) {
        this.redraw();
        return;
      }
      scaleFactor = computeScaleFactorFromExpression(entry.trim(), pixelLength, this._pxPerPt);
      if (!scaleFactor || !(scaleFactor > 0) || pixelLength <= 0) {
        toast('Invalid value or zero-length line', 'error');
        this.redraw();
        return;
      }
      this.store.setScale(this.currentPage, { factor: scaleFactor, unit: 'in' });
      toast('Scale saved for this page', 'success');
    }

    const measuredInches = pixelLength * scaleFactor;
    if (measuredInches !== null) {
      const txt = formatInches(measuredInches);
      toast(`Length: ${txt}`, 'info');
      this.store.addMeasurement(this.currentPage, {
        id: `line-${Date.now()}`,
        inches: measuredInches,
        label: txt,
        at: Date.now(),
        doubleSided: this.doubleSided,
        pts: [{ x1: nearest.x1 || nearest.x, y1: nearest.y1 || nearest.y, x2: nearest.x2 || nearest.x1, y2: nearest.y2 || nearest.y1 }]
      });
      this.onMeasurementsChanged?.();
    } else {
      toast(`Length (px): ${pixelLength.toFixed(1)} px`, 'info');
    }

    this.redraw();
  };

  resizeToMatchCanvas() {
    // match backing store size (pixels)
    this.overlay.width = this.canvasEl.width;
    this.overlay.height = this.canvasEl.height;
    // match CSS size so the overlay covers the visible canvas
    try {
      this.overlay.style.width = `${this.canvasEl.clientWidth}px`;
      this.overlay.style.height = `${this.canvasEl.clientHeight}px`;
    } catch (err) {}
    // ensure overlay is on top and not interfering when inactive
    this.overlay.style.zIndex = 20;
    this.overlay.style.touchAction = 'none';
    this.redraw();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  redraw() {
    if (!this.ctx) return;

    this.clear();

    const w = this.overlay.width;
    const h = this.overlay.height;

    // draw polygons (areas)
    const items = this.store.getPage(this.currentPage) || [];
    for (const it of items) {
      const pts = it.points.map(p => ({ x: p.x * w, y: p.y * h }));
      drawPolygon(this.ctx, pts, true);
    }
    if (this.hoverPoly) drawPolygon(this.ctx, this.hoverPoly, false);

    // draw vector lines
    const lines = this.store.getLines(this.currentPage) || [];
    for (const ln of lines) {
      const a = { x: (ln.x1 || ln.x) * w, y: (ln.y1 || ln.y) * h };
      const b = { x: (ln.x2 || ln.x1) * w, y: (ln.y2 || ln.y1) * h };

      const id = ln.id || ln.__id;
      const isHover = id && this._hoverLineId === id;
      const isSel = id && this._selectedLineIds.has(id);

      drawLine(this.ctx, a, b, { hover: isHover, selected: isSel });

      // draw label for selected
      if (isSel || isHover) {
        const pxLen = Math.hypot(b.x - a.x, b.y - a.y) || 0;
        const scale = this.store.getScale(this.currentPage);
        if (scale && scale.factor) {
          const inches = pxLen * scale.factor;
          const txt = formatInches(inches);
          drawLabel(this.ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, txt);
        } else {
          drawLabel(this.ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, `${pxLen.toFixed(1)} px`);
        }
      }
    }

    // draw saved measurement lines
    const measurements = this.store.listMeasurements(this.currentPage) || [];
    for (const m of measurements) {
      if (!m.pts || !m.pts.length) continue;
      const isHover = this._hoverMeasurementId === m.id;
      const isSelected = this._selectedMeasurementId === m.id;
      for (const seg of m.pts) {
        const a = { x: seg.x1 * w, y: seg.y1 * h };
        const b = { x: seg.x2 * w, y: seg.y2 * h };
        drawMeasurementLine(this.ctx, a, b, { hover: isHover, selected: isSelected });
      }
      const midX = m.pts.length ? ((m.pts[0].x1 + m.pts[0].x2) / 2) * w : w / 2;
      const midY = m.pts.length ? ((m.pts[0].y1 + m.pts[0].y2) / 2) * h : h / 2;
      const labelText = m.label || formatInches(m.inches || 0);
      drawLabel(this.ctx, midX, midY, m.doubleSided ? `${labelText} (double-sided)` : labelText);
    }

    // draw measure mode hint
    if (this.tool === 'measure' && this.active && lines.length > 0) {
      const hasScale = this.store.getScale(this.currentPage)?.factor;
      const hint = hasScale 
        ? 'Click a line to measure'
        : 'Click a line to calibrate scale';
      drawHint(this.ctx, 10, 30, hint);
    }
    // draw measure preview if user is dragging
    if (this.tool === 'measure' && this._measurePreview) {
      const p = this._measurePreview;
      drawPreviewLine(this.ctx, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
      // show pixel length while dragging
      const pxLen = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) || 0;
      const scale = this.store.getScale(this.currentPage);
      const labelTxt = (scale && scale.factor) ? formatInches(pxLen * scale.factor) : `${pxLen.toFixed(1)} px`;
      drawLabel(this.ctx, (p.x1 + p.x2)/2, (p.y1 + p.y2)/2 - 16, labelTxt);
    }
  }
}

// =========================
// DRAW
// =========================

function drawHint(ctx, x, y, txt) {
  ctx.save();
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(200,200,200,0.9)';
  const m = ctx.measureText(txt);
  const padding = 6;
  const w = m.width + padding * 2;
  const h = 20 + padding;
  ctx.fillStyle = 'rgba(50,50,50,0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(200,200,200,0.95)';
  ctx.fillText(txt, x + padding, y + 16);
  ctx.restore();
}

function drawPolygon(ctx, pts, solid) {
  if (!pts.length) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }

  ctx.closePath();

  ctx.fillStyle = solid
    ? 'rgba(255,214,10,0.35)'
    : 'rgba(255,214,10,0.15)';

  ctx.strokeStyle = 'rgba(255,195,0,0.9)';
  ctx.lineWidth = 2;

  ctx.fill();
  ctx.stroke();
}

// =========================
// MEASUREMENT HELPERS
// =========================

function calculatePolygonArea(points) {
  let area = 0;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;

    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}

function calculatePerimeter(points) {
  let total = 0;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;

    const dx = points[i].x - points[j].x;
    const dy = points[i].y - points[j].y;

    total += Math.sqrt(dx * dx + dy * dy);
  }

  return total;
}

function applyScale(areaPx, pxPerPt) {
  const scale = pxPerPt || 1;
  return areaPx / (scale * scale);
}

function applyScaleLength(lengthPx, pxPerPt) {
  const scale = pxPerPt || 1;
  return lengthPx / scale;
}

// =========================
// LINE HELPERS
// =========================

function pointToSegmentDistance(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const projx = a.x + t * vx;
  const projy = a.y + t * vy;
  return Math.hypot(p.x - projx, p.y - projy);
}

function drawLine(ctx, a, b, { hover = false, selected = false } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = selected ? 'rgba(0,200,255,0.95)' : hover ? 'rgba(255,255,0,0.95)' : 'rgba(255,195,0,0.9)';
  ctx.lineWidth = selected ? 4 : hover ? 3 : 2;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawLabel(ctx, x, y, txt) {
  ctx.save();
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(20,20,20,0.95)';
  const padding = 6;
  const m = ctx.measureText(txt);
  const w = m.width + padding * 2;
  const h = 18 + padding;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(txt, x - m.width / 2, y + 6);
  ctx.restore();
}

function formatInches(inches) {
  const total = Number(inches) || 0;
  const feet = Math.floor(total / 12);
  const rem = Math.round((total - feet * 12) * 10) / 10;
  if (feet > 0) return `${feet} ft ${rem}"`;
  return `${rem}"`;
}

// draw a preview (temporary) measurement line
function drawPreviewLine(ctx, a, b) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = 'rgba(0,120,212,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawMeasurementLine(ctx, a, b, { hover = false, selected = false } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = selected ? 'rgba(0,220,120,0.95)' : hover ? 'rgba(120,220,180,0.95)' : 'rgba(0,180,120,0.8)';
  ctx.lineWidth = selected ? 4 : hover ? 3 : 2.5;
  ctx.setLineDash(selected ? [] : [4, 4]);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// parse a simple measurement string into inches (supports fractions and units)
function parseMeasurementToInches(str) {
  if (!str) return null;
  str = String(str).trim().toLowerCase();
  str = str.replace(',', '.');

  // simple value with optional unit, or fraction like 1/16
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
    default: return num; // inches
  }
}

// parse expressions like "1/16 in = 1 ft" or simple measurements
function parseScaleExpression(str) {
  if (!str) return null;
  const parts = str.split('=');
  if (parts.length === 2) {
    // right side is real-world length (e.g., "1 ft")
    const right = parts[1].trim();
    return parseMeasurementToInches(right);
  }
  // fallback: parse whole string as a measurement
  return parseMeasurementToInches(str);
}

// compute inches-per-pixel from a scale expression and PDF space info
function computeScaleFactorFromExpression(str, pixelLength, pxPerPt) {
  if (!str) return null;
  const parts = str.split('=');
  if (parts.length === 2) {
    const left = parts[0].trim();
    const right = parts[1].trim();
    const leftInches = parseMeasurementToInches(left);
    const rightInches = parseMeasurementToInches(right);
    if (!leftInches || !rightInches) return null;
    // if we have PDF space info (pxPerPt) we can compute inches-per-pixel independent of drawn pixel length
    // pixels-per-inch = pxPerPt * 72 (points per inch)
    if (pxPerPt && pxPerPt > 0) {
      const pixelsPerInch = pxPerPt * 72;
      const inchesPerPixelDrawing = 1 / pixelsPerInch;
      // real inches per pixel = (rightInches / leftInches) * inchesPerPixelDrawing
      return (rightInches / leftInches) * inchesPerPixelDrawing;
    }
    // fallback: treat the entered right side as the real-world length for the drawn pixelLength
    return rightInches / pixelLength;
  }
  // no '=' -> parse as a real-world length corresponding to the drawn pixel length
  const realInches = parseMeasurementToInches(str);
  if (!realInches) return null;
  return realInches / pixelLength;
}

// draw a preview (temporary) measurement line
