import { toast } from '../toast.js';

export class CanvasOverlay {
  constructor({ wrapperEl, canvasEl, store }) {
    this.wrapperEl = wrapperEl;
    this.canvasEl = canvasEl;
    this.store = store;

    this.overlay = null;
    this.ctx = null;

    this.active = false;
    this.currentPage = 1;

    this.hoverPoly = null;

    this._edgeWorker = null;
    this._fillWorker = null;
    this._barrierState = null;

    this.tool = 'area';

    this.zoom = 1;
    this._pxPerPt = 1;
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
    this.overlay.addEventListener('pointermove', this._onPointerMove);
    this.overlay.addEventListener('click', this._onClick);
  }

  _onPointerMove = (e) => {
    if (!this.active) return;
    if (!this._barrierState) return;

    const rect = this.overlay.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this._fillWorker.postMessage({
      type: 'preview',
      seedX: x,
      seedY: y,
      ...this._barrierState
    });
  };

  _onClick = (e) => {
    if (!this.active) return;
    if (!this._barrierState) return;

    const rect = this.overlay.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this._fillWorker.postMessage({
      type: 'commit',
      seedX: x,
      seedY: y,
      ...this._barrierState
    });
  };

  resizeToMatchCanvas() {
    this.overlay.width = this.canvasEl.width;
    this.overlay.height = this.canvasEl.height;
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

    const items = this.store.getPage(this.currentPage) || [];

    for (const it of items) {
      const pts = it.points.map(p => ({
        x: p.x * w,
        y: p.y * h
      }));

      drawPolygon(this.ctx, pts, true);
    }

    if (this.hoverPoly) {
      drawPolygon(this.ctx, this.hoverPoly, false);
    }
  }
}

// =========================
// DRAW
// =========================

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