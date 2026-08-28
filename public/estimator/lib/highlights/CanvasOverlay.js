import { toast } from '../toast.js';
import { textPrompt } from '../textPrompt.js';

const MEASUREMENT_SNAP_ANGLE = Math.PI / 18;

function snapMeasurementEndpoint(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx));

  if (angle <= MEASUREMENT_SNAP_ANGLE) return { x: end.x, y: start.y };
  if (Math.abs(Math.PI / 2 - angle) <= MEASUREMENT_SNAP_ANGLE) return { x: start.x, y: end.y };
  return end;
}

export class CanvasOverlay {
  constructor({ wrapperEl, canvasEl, store, onMeasurementsChanged, onLineMeasurementCreated, onLineMeasurementRemoved, onSelectionChanged }) {
    this.wrapperEl = wrapperEl;
    this.canvasEl = canvasEl;
    this.store = store;
    this.onMeasurementsChanged = onMeasurementsChanged || null;
    this.onLineMeasurementCreated = onLineMeasurementCreated || null;
    this.onLineMeasurementRemoved = onLineMeasurementRemoved || null;
    // Fired whenever the selected measurement/polygon changes — see
    // _notifySelectionChangeIfNeeded, called from redraw() rather than at
    // every individual place selection gets set (_onPointerDown,
    // _pasteMeasurement, _onContextMenu, ...), since all of those already
    // call redraw() right after changing it.
    this.onSelectionChanged = onSelectionChanged || null;
    this._lastNotifiedSelectionKey = null;

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
    this._selectedPolygonId = null;
    // Box-select (Select tool) state — a separate multi-item selection
    // set for measurements, alongside the single _selectedMeasurementId
    // above (left untouched by everything below; every existing
    // click-to-select/drag/delete path still only ever uses that one).
    // Bulk actions (delete, group-drag, single/double-sided toggle) check
    // this set first and fall back to _selectedMeasurementId so a lone
    // click-selected measurement still works the same as before.
    this._selectedMeasurementIds = new Set();
    this._marqueeStart = null; // {x,y} — box-select drag start
    this._marqueePreview = null; // {x1,y1,x2,y2} — box-select drag in progress
    this._groupDragState = null; // dragging every box-selected measurement together

    this._edgeWorker = null;
    this._fillWorker = null;
    this._barrierState = null;

    this.tool = 'area';

    this.zoom = 1;
    this._pxPerPt = 1;
    this.doubleSided = false;
    // Length/area labels ("17 ft", "42 sq") drawn next to every
    // measurement/line — on by default, but they sit right on top of the
    // linework they're labeling, which gets in the way while actively
    // tracing more lines nearby. See setShowLabels below.
    this.showLabels = true;
    // drag-to-measure state
    this._isDraggingMeasure = false;
    this._measureStart = null; // {x,y}
    this._measurePreview = null; // {x1,y1,x2,y2}
    this._pendingPolygonPoints = [];
    this._irregularPreview = null;
    this._copiedMeasurement = null;
    this._lastPointerPosition = null;
    this._dragState = null;
    this._shapeUndoStack = [];
    this._suppressNextClick = false;
    this._lastClickedCopyTarget = null;
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
      if (this._isDraggingMeasure || (this.tool === 'irregular' && this.active && this._pendingPolygonPoints.length > 0)) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      }
    }, { passive: false });
  }

  setActive(active) {
    this.active = active;
    // Always keep pointer events on so users can select/copy/drag existing shapes
    // even when no drawing tool is active
    this.overlay.style.pointerEvents = 'auto';
    if (!active) {
      this._pendingPolygonPoints = [];
      this._irregularPreview = null;
      this._measurePreview = null;
      this._isDraggingMeasure = false;
      this._measureStart = null;
    }
  }

  setTool(t) {
    this.tool = t;
    this.hoverPoly = null;
    this._measurePreview = null;
    this._pendingPolygonPoints = [];
    this._irregularPreview = null;
    this._isDraggingMeasure = false;
    this._measureStart = null;
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
    this._measurePreview = null;
    this._irregularPreview = null;
    this._isDraggingMeasure = false;
    this._measureStart = null;
    this._hoverLineId = null;
    this._hoverMeasurementId = null;
    this._selectedMeasurementId = null;
    this._selectedPolygonId = null;
    this._selectedLineIds.clear();
    this.redraw();
  }

  _syncShapeUndoButton() {
    const btn = document.getElementById('undoShapeBtn');
    if (btn) {
      btn.disabled = !this._shapeUndoStack.length;
    }
  }

  _pushShapeUndo(entry) {
    if (!entry) return;
    this._shapeUndoStack.push(entry);
    this._syncShapeUndoButton();
  }

  undoLastShapeAction() {
    const action = this._shapeUndoStack.pop();
    if (!action) {
      this._syncShapeUndoButton();
      return false;
    }

    const page = action.page ?? this.currentPage;

    if (action.type === 'add') {
      if (action.measurementId) {
        this.store.removeMeasurement(page, action.measurementId);
      }
      if (action.polygonId) {
        this.store.removePolygon(page, action.polygonId);
      }
    } else if (action.type === 'move') {
      const applyPoints = (points, snapshotPoints) => {
        if (!Array.isArray(snapshotPoints)) return;
        if (!points) return;
        const clone = snapshotPoints.map((point) => ({ ...point }));
        if (Array.isArray(points)) {
          points.splice(0, points.length, ...clone);
        }
      };

      const restoreMeasurement = (measurement, snapshot) => {
        if (!measurement) return;
        if (Array.isArray(snapshot.pts)) {
          measurement.pts = snapshot.pts.map((seg) => ({ ...seg }));
        }
        if (Array.isArray(snapshot.shapePoints)) {
          measurement.shapePoints = snapshot.shapePoints.map((point) => ({ ...point }));
        }
        if (Array.isArray(snapshot.polygonPoints)) {
          measurement.polygonPoints = snapshot.polygonPoints.map((point) => ({ ...point }));
        }
      };

      const restorePolygon = (polygon, snapshot) => {
        if (!polygon) return;
        const points = Array.isArray(snapshot.points)
          ? snapshot.points
          : (Array.isArray(snapshot.shapePoints) ? snapshot.shapePoints : (Array.isArray(snapshot.polygonPoints) ? snapshot.polygonPoints : []));
        applyPoints(polygon.points, points);
      };

      if (action.targetType === 'line' && action.itemRef) {
        const snapshot = action.beforeSnapshot || {};
        action.itemRef.x1 = snapshot.x1 ?? action.itemRef.x1 ?? action.itemRef.x ?? 0;
        action.itemRef.y1 = snapshot.y1 ?? action.itemRef.y1 ?? action.itemRef.y ?? 0;
        action.itemRef.x2 = snapshot.x2 ?? action.itemRef.x2 ?? action.itemRef.x1 ?? action.itemRef.x ?? 0;
        action.itemRef.y2 = snapshot.y2 ?? action.itemRef.y2 ?? action.itemRef.y1 ?? action.itemRef.y ?? 0;
      } else if (action.targetType === 'polygon' && action.itemRef) {
        restorePolygon(action.itemRef, action.beforeSnapshot || {});
        const measurement = (this.store.listMeasurements(page) || []).find((entry) => entry.id === action.itemRef.measurementId || entry.id === action.itemRef.id || entry.polygonId === action.itemRef.id);
        restoreMeasurement(measurement, action.beforeSnapshot || {});
      } else if (action.targetType === 'measurement' && action.itemRef) {
        const measurement = action.itemRef;
        restoreMeasurement(measurement, action.beforeSnapshot || {});
        const polygons = this.store.getPage(page) || [];
        const polygon = polygons.find((entry) => entry.measurementId === measurement.id || entry.id === measurement.id || entry.id === (measurement.polygonId || measurement.id));
        restorePolygon(polygon, action.beforeSnapshot || {});
      }
    }

    this._syncShapeUndoButton();
    this.onMeasurementsChanged?.();
    this.redraw();
    return true;
  }

  renderToContext(ctx, { width = this.overlay?.width || this.canvasEl?.width || 0, height = this.overlay?.height || this.canvasEl?.height || 0 } = {}) {
    if (!ctx) return;

    const w = width;
    const h = height;

    const items = this.store.getPage(this.currentPage) || [];
    for (const it of items) {
      const pts = (it.points || []).map(p => ({ x: p.x * w, y: p.y * h }));
      const isSelected = this._selectedPolygonId &&
        (it.id === this._selectedPolygonId || it.measurementId === this._selectedPolygonId);
      drawPolygon(ctx, pts, true, { selected: !!isSelected });
    }
    if (this.hoverPoly) drawPolygon(ctx, this.hoverPoly, false);

    const lines = this.store.getLines(this.currentPage) || [];
    for (const ln of lines) {
      const a = { x: (ln.x1 || ln.x) * w, y: (ln.y1 || ln.y) * h };
      const b = { x: (ln.x2 || ln.x1) * w, y: (ln.y2 || ln.y1) * h };

      const id = ln.id || ln.__id;
      const isHover = id && this._hoverLineId === id;
      const isSel = id && this._selectedLineIds.has(id);

      drawLine(ctx, a, b, { hover: isHover, selected: isSel });

      if ((isSel || isHover) && this.showLabels) {
        const pxLen = Math.hypot(b.x - a.x, b.y - a.y) || 0;
        const scale = this.store.getScale(this.currentPage);
        if (scale && scale.factor) {
          const inches = (pxLen / (this._pxPerPt || 1)) * scale.factor;
          const txt = formatInches(inches);
          drawLabel(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, txt, this.zoom);
        } else {
          drawLabel(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, `${((pxLen / this._pxPerPt) / 72).toFixed(2)} in`, this.zoom);
        }
      }
    }

    const measurements = this.store.listMeasurements(this.currentPage) || [];
    for (const m of measurements) {
      if (!m.pts || !m.pts.length) continue;

      const isAreaMeasurement = m.area != null || m.areaLabel != null || m.areaPx != null || m.shapeType === 'polygon' ||
        (Array.isArray(m.shapePoints) && m.shapePoints.length >= 3) ||
        (Array.isArray(m.polygonPoints) && m.polygonPoints.length >= 3);
      if (isAreaMeasurement) {
        const polygons = this.store.getPage(this.currentPage) || [];
        const targetPolygonId = m.polygonId || m.id;
        const polygon = polygons.find(item =>
          item.id === m.id ||
          item.id === targetPolygonId ||
          item.measurementId === m.id ||
          item.measurementId === targetPolygonId
        ) || polygons.find(item =>
          (Array.isArray(item.points) && Array.isArray(m.shapePoints) && samePoints(item.points, m.shapePoints)) ||
          (Array.isArray(item.points) && Array.isArray(m.polygonPoints) && samePoints(item.points, m.polygonPoints))
        ) || null;
        const points = Array.isArray(polygon?.points) && polygon.points.length
          ? polygon.points
          : (Array.isArray(m.shapePoints) && m.shapePoints.length
            ? m.shapePoints
            : (Array.isArray(m.polygonPoints) && m.polygonPoints.length
              ? m.polygonPoints
              : []));
        const pts = points.map(p => ({ x: p.x * w, y: p.y * h }));
        if (pts.length >= 3) {
          const centroid = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
          const midX = centroid.x / pts.length;
          const midY = centroid.y / pts.length;
          if (this.showLabels) drawLabel(ctx, midX, midY, m.areaLabel || `${(m.area || 0).toFixed(2)} sq`, this.zoom);
        }
        continue;
      }

      const isHover = this._hoverMeasurementId === m.id;
      const isSelected = this._selectedMeasurementId === m.id || this._selectedMeasurementIds.has(m.id);
      for (const seg of m.pts) {
        const a = { x: seg.x1 * w, y: seg.y1 * h };
        const b = { x: seg.x2 * w, y: seg.y2 * h };
        drawMeasurementLine(ctx, a, b, { hover: isHover, selected: isSelected, doubleSided: !!m.doubleSided });
      }
      if (this.showLabels) {
        const midX = m.pts.length ? ((m.pts[0].x1 + m.pts[0].x2) / 2) * w : w / 2;
        const midY = m.pts.length ? ((m.pts[0].y1 + m.pts[0].y2) / 2) * h : h / 2;
        const labelText = m.label || formatInches(m.inches || 0);
        drawLabel(ctx, midX, midY, m.doubleSided ? `${labelText} (double-sided)` : labelText, this.zoom);
      }
    }

    if (this.tool === 'measure' && this.active && lines.length > 0) {
      const hasScale = this.store.getScale(this.currentPage)?.factor;
      const hint = hasScale
        ? 'Click a line to measure'
        : 'Click a line to calibrate scale';
      drawHint(ctx, 10, 30, hint);
    }
    if (this._measurePreview) {
      const p = this._measurePreview;
      if (this.tool === 'measure') {
        drawPreviewLine(ctx, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 }, { doubleSided: this.doubleSided });
        if (this.showLabels) {
          const pxLen = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) || 0;
          const scale = this.store.getScale(this.currentPage);
          const labelTxt = (scale && scale.factor) ? formatInches((pxLen / (this._pxPerPt || 1)) * scale.factor) : `${((pxLen / this._pxPerPt) / 72).toFixed(2)} in`;
          drawLabel(ctx, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2 - 16 * this.zoom, labelTxt, this.zoom);
        }
      }
      if (this.tool === 'rect') {
        drawPreviewRect(ctx, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
        if (this.showLabels) {
          const pxW = Math.abs(p.x2 - p.x1);
          const pxH = Math.abs(p.y2 - p.y1);
          const pxArea = pxW * pxH;
          const scale = this.store.getScale(this.currentPage);
          const areaScaled = applyScale(pxArea, this._pxPerPt, scale?.factor);
          drawLabel(ctx, (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2 - 16 * this.zoom, `${areaScaled.toFixed(2)} sq`, this.zoom);
        }
      }
    }

    if (this._marqueePreview) {
      const p = this._marqueePreview;
      drawMarqueeSelection(ctx, { x: p.x1, y: p.y1 }, { x: p.x2, y: p.y2 });
    }

    if (this.tool === 'irregular' && this._pendingPolygonPoints.length > 0) {
      drawIrregularPath(ctx, this._pendingPolygonPoints, this._irregularPreview);
    }
  }

  setDoubleSided(value) {
    this.doubleSided = Boolean(value);
    this.redraw();
  }

  setShowLabels(value) {
    this.showLabels = Boolean(value);
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
              id: makeStableId('area'),
              points: norm
            });

            // =========================
            // ✅ MEASUREMENT LOGIC
            // =========================

            const areaPx = calculatePolygonArea(d.polygon);
            const scale = this.store.getScale(this.currentPage);
            const areaScaled = applyScale(areaPx, this._pxPerPt, scale?.factor);

            const perimeterPx = calculatePerimeter(d.polygon);
            const perimeterScaled = applyScaleLength(perimeterPx, this._pxPerPt);

            toast(
              `Area: ${areaScaled.toFixed(2)} sq | Perimeter: ${perimeterScaled.toFixed(2)} units`,
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
    this.overlay.addEventListener('dblclick', this._onDoubleClick);
    this.overlay.addEventListener('pointercancel', this._onPointerCancel);
    this.overlay.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onWindowKeyDown);
  }

  _cloneMeasurement(measurement, { offsetX = 0, offsetY = 0, assignNewId = true } = {}) {
    if (!measurement) return null;

    const clone = JSON.parse(JSON.stringify(measurement));
    const clamp = (value) => Math.min(1, Math.max(0, value));

    if (assignNewId) {
      clone.id = `${clone.id || 'measurement'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    clone.at = Date.now();

    if (Array.isArray(clone.pts)) {
      clone.pts = clone.pts.map((seg) => ({
        ...seg,
        x1: clamp((seg.x1 || 0) + offsetX),
        y1: clamp((seg.y1 || 0) + offsetY),
        x2: clamp((seg.x2 || 0) + offsetX),
        y2: clamp((seg.y2 || 0) + offsetY)
      }));
    }

    if (Array.isArray(clone.shapePoints)) {
      clone.shapePoints = clone.shapePoints.map((point) => ({
        ...point,
        x: clamp((point.x || 0) + offsetX),
        y: clamp((point.y || 0) + offsetY)
      }));
    }

    if (Array.isArray(clone.polygonPoints)) {
      clone.polygonPoints = clone.polygonPoints.map((point) => ({
        ...point,
        x: clamp((point.x || 0) + offsetX),
        y: clamp((point.y || 0) + offsetY)
      }));
    }

    return clone;
  }

  _isAreaMeasurement(measurement) {
    return Boolean(
      measurement?.area != null ||
      measurement?.areaLabel != null ||
      measurement?.areaPx != null ||
      measurement?.shapeType === 'polygon' ||
      (Array.isArray(measurement?.shapePoints) && measurement.shapePoints.length >= 3) ||
      (Array.isArray(measurement?.polygonPoints) && measurement.polygonPoints.length >= 3)
    );
  }

  // Whether a measurement "touches" a box-select rect, in pixel space —
  // line measurements only (see the Select tool in _onPointerUp). Area
  // measurements are deliberately left out of box-select for now: it's
  // scoped to lines, which is what single/double-sided (the other new
  // bulk action) applies to anyway, and it keeps this from having to
  // also teach the polygon-selection rendering path (driven by
  // _selectedPolygonId, not this) about a multi-select set.
  _measurementIntersectsRect(measurement, box, w, h) {
    if (this._isAreaMeasurement(measurement) || !Array.isArray(measurement.pts)) return false;
    return measurement.pts.some((seg) => segmentIntersectsRect(
      { x: (seg.x1 || 0) * w, y: (seg.y1 || 0) * h },
      { x: (seg.x2 || 0) * w, y: (seg.y2 || 0) * h },
      box
    ));
  }

  _storeMeasurement(measurement, { select = true } = {}) {
    if (!measurement) return null;

    this.store.addMeasurement(this.currentPage, measurement);

    if (this._isAreaMeasurement(measurement)) {
      const points = Array.isArray(measurement.shapePoints) && measurement.shapePoints.length
        ? measurement.shapePoints
        : (Array.isArray(measurement.polygonPoints) && measurement.polygonPoints.length
          ? measurement.polygonPoints
          : []);
      this.store.addPolygon(this.currentPage, {
        points,
        measurementId: measurement.id,
        id: measurement.id
      });
    }

    if (select) {
      this._selectedMeasurementId = measurement.id;
    }

    return measurement;
  }

  // Find the measurement linked to a polygon (for copy/paste of rect/irreg shapes)
  _findLinkedMeasurement(polygon) {
    const measurements = this.store.listMeasurements(this.currentPage) || [];
    return measurements.find(m =>
      m.id === polygon.measurementId ||
      m.id === polygon.id ||
      m.polygonId === polygon.id
    ) || null;
  }

  _pasteMeasurement() {
    const source = this._copiedMeasurement || this._lastClickedCopyTarget || (this._selectedMeasurementId
      ? { type: 'measurement', value: (this.store.listMeasurements(this.currentPage) || []).find((entry) => entry.id === this._selectedMeasurementId) }
      : null);
    if (!source || !source.value) {
      toast('Nothing to paste — select or right-click a shape first', 'info');
      return;
    }

    const OFF = 0.03;

    // Paste a vector line (from RulerOverlay)
    if (source.type === 'line') {
      const line = JSON.parse(JSON.stringify(source.value));
      const lineId = line.id || line.__id || 'line';
      line.id = `${lineId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (line.__id != null) delete line.__id;
      line.x1 = Math.min(1, Math.max(0, (line.x1 || 0) + OFF));
      line.y1 = Math.min(1, Math.max(0, (line.y1 || 0) + OFF));
      line.x2 = Math.min(1, Math.max(0, (line.x2 || 0) + OFF));
      line.y2 = Math.min(1, Math.max(0, (line.y2 || 0) + OFF));
      this.store.getLines(this.currentPage).push(line);
      this.redraw();
      this.onMeasurementsChanged?.();
      toast('Line pasted', 'info');
      return;
    }

    // Paste a polygon (rect or irreg) — also copy its linked measurement
    if (source.type === 'polygon') {
      const linkedMeasurement = this._findLinkedMeasurement(source.value);
      if (linkedMeasurement) {
        // Clone the measurement (which also re-creates the polygon via _storeMeasurement)
        const cloned = this._cloneMeasurement(linkedMeasurement, { offsetX: OFF, offsetY: OFF });
        this._storeMeasurement(cloned);
        this._selectedMeasurementId = cloned.id;
        this._selectedPolygonId = cloned.id;
        this.redraw();
        this.onMeasurementsChanged?.();
        toast('Shape pasted', 'info');
      } else {
        // Orphan polygon with no measurement — just clone the visual shape
        const polygon = JSON.parse(JSON.stringify(source.value));
        polygon.id = `${polygon.id || 'polygon'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (Array.isArray(polygon.points)) {
          polygon.points = polygon.points.map((p) => ({
            ...p,
            x: Math.min(1, Math.max(0, (p.x || 0) + OFF)),
            y: Math.min(1, Math.max(0, (p.y || 0) + OFF))
          }));
        }
        this.store.addPolygon(this.currentPage, polygon);
        this._selectedPolygonId = polygon.id;
        this.redraw();
        this.onMeasurementsChanged?.();
        toast('Shape pasted', 'info');
      }
      return;
    }

    // Paste a measurement (line measurement, rect area, or irreg area)
    const cloned = this._cloneMeasurement(source.value, { offsetX: OFF, offsetY: OFF });
    this._storeMeasurement(cloned);
    this._selectedMeasurementId = cloned.id;
    this.redraw();
    this.onMeasurementsChanged?.();
    toast('Measurement pasted', 'info');
  }

  _onContextMenu = (event) => {
    if (!this.overlay) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const target = this._findCopyTargetAtPoint(x, y) || this._getSelectedCopyTarget();

    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    this._copiedMeasurement = target;
    this._lastClickedCopyTarget = target;
    if (target.type === 'measurement') {
      this._selectedMeasurementId = target.value.id;
      this._selectedPolygonId = null;
    } else if (target.type === 'polygon') {
      this._selectedPolygonId = target.value.id || target.value.measurementId || null;
      this._selectedMeasurementId = null;
    }
    this.redraw();
    toast(target.type === 'line' ? 'Line copied' : 'Measurement copied', 'info');
  };

  _onWindowKeyDown = (event) => {
    if (!this.overlay) return;

    const target = event.target;
    const tagName = target?.tagName?.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') return;

    const isCopy = (event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'c';
    const isPaste = (event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'v';
    // Alt+click deletes one detected line/measurement at a time (see
    // _onClick); this is the equivalent for however many are currently
    // selected — lines multi-selected via Ctrl/Cmd+click, or measurements
    // selected (one via a plain click, or several via the Select tool's
    // box-select) — so a whole batch can be cleared in one go.
    const hasSelectedMeasurements = this._selectedMeasurementIds.size > 0 || Boolean(this._selectedMeasurementId);
    const isDelete = (event.key === 'Delete' || event.key === 'Backspace') &&
      (this._selectedLineIds.size > 0 || hasSelectedMeasurements);
    if (!isCopy && !isPaste && !isDelete) return;

    event.preventDefault();
    event.stopPropagation();

    if (isDelete) {
      let removedLines = 0;
      let removedMeasurements = 0;

      if (this._selectedLineIds.size > 0) {
        removedLines = this._selectedLineIds.size;
        for (const id of this._selectedLineIds) this.store.removeLine(this.currentPage, id);
        this._selectedLineIds.clear();
      }

      if (hasSelectedMeasurements) {
        const ids = this._selectedMeasurementIds.size > 0
          ? Array.from(this._selectedMeasurementIds)
          : [this._selectedMeasurementId];
        const measurements = this.store.listMeasurements(this.currentPage) || [];
        for (const id of ids) {
          const measurement = measurements.find((entry) => entry.id === id);
          if (!measurement) continue;
          this.onLineMeasurementRemoved?.(measurement);
          this.store.removeMeasurement(this.currentPage, id);
          removedMeasurements += 1;
        }
        this._selectedMeasurementId = null;
        this._selectedMeasurementIds = new Set();
        this._selectedPolygonId = null;
      }

      this.onMeasurementsChanged?.();

      const parts = [];
      if (removedLines) parts.push(`${removedLines} line${removedLines === 1 ? '' : 's'}`);
      if (removedMeasurements) parts.push(`${removedMeasurements} measurement${removedMeasurements === 1 ? '' : 's'}`);
      if (parts.length) toast(`${parts.join(' and ')} removed`, 'info');

      this.redraw();
      return;
    }

    if (isCopy) {
      // Find shape at current pointer position first, then fall back to selected
      const target = (this._lastPointerPosition
        ? this._findCopyTargetAtPoint(this._lastPointerPosition.x, this._lastPointerPosition.y)
        : null) || this._getSelectedCopyTarget();
      if (target) {
        this._copiedMeasurement = target;
        this._lastClickedCopyTarget = target;
        toast(target.type === 'line' ? 'Line copied' : 'Shape copied', 'info');
      } else {
        toast('Hover over a shape and press Cmd+C to copy', 'info');
      }
      return;
    }

    if (isPaste) {
      this._pasteMeasurement();
    }
  };

  _getSelectedCopyTarget() {
    // Check selected polygon first (rect / irreg)
    if (this._selectedPolygonId) {
      const polygon = (this.store.getPage(this.currentPage) || []).find(
        (p) => p.id === this._selectedPolygonId || p.measurementId === this._selectedPolygonId
      );
      if (polygon) return { type: 'polygon', value: polygon };
    }

    // Check selected measurement (line measurement)
    const selectedMeasurement = this._selectedMeasurementId
      ? (this.store.listMeasurements(this.currentPage) || []).find((entry) => entry.id === this._selectedMeasurementId)
      : null;
    if (selectedMeasurement) {
      return { type: 'measurement', value: selectedMeasurement };
    }

    // Check selected vector line
    const selectedLineId = this._selectedLineIds.size ? Array.from(this._selectedLineIds)[0] : null;
    if (selectedLineId) {
      const line = (this.store.getLines(this.currentPage) || []).find((entry) => (entry.id || entry.__id) === selectedLineId);
      if (line) return { type: 'line', value: line };
    }

    return null;
  }

  // `strict`: pass true while a draw tool (measure/rect) is armed and the
  // caller is about to start a brand-new line/shape. Without it, starting a
  // new line within the normal (generous) hit radius of an existing one
  // always grabbed the existing line instead of drawing -- the "can't draw
  // close to an existing line" bug. Dragging still works fine at the normal
  // radius any time a draw tool isn't actively armed (the common case for
  // repositioning something you already drew).
  _findCopyTargetAtPoint(x, y, strict = false) {
    const polygon = this._findPolygonAtPoint(x, y);
    if (polygon) {
      const linkedMeasurement = this._findLinkedMeasurement(polygon);
      if (linkedMeasurement) {
        return { type: 'measurement', value: linkedMeasurement };
      }
      // polygon found but no linked measurement — fall through to measurement-based detection
    }

    const measurement = this._findMeasurementAtPoint(x, y);
    if (measurement) {
      return { type: 'measurement', value: measurement };
    }

    // If polygon was found but had no linked measurement, return it as-is
    if (polygon) {
      return { type: 'polygon', value: polygon };
    }

    const w = this.overlay?.width || 0;
    const h = this.overlay?.height || 0;
    if (!w || !h) return null;

    const lines = this.store.getLines(this.currentPage) || [];
    let nearestLine = null;
    let nearestLineDist = Infinity;

    for (const line of lines) {
      const a = { x: (line.x1 || line.x) * w, y: (line.y1 || line.y) * h };
      const b = { x: (line.x2 || line.x1) * w, y: (line.y2 || line.y1) * h };
      const d = pointToSegmentDistance({ x, y }, a, b);
      if (d < nearestLineDist) {
        nearestLineDist = d;
        nearestLine = line;
      }
    }

    const hitThreshold = strict
      ? Math.max(5, 5 * (this.zoom || 1))
      : Math.max(14, 14 * (this.zoom || 1));
    return nearestLine && nearestLineDist <= hitThreshold ? { type: 'line', value: nearestLine } : null;
  }

  _captureDragSnapshot(item, type) {
    if (type === 'line') {
      return {
        x1: item.x1 ?? item.x ?? 0,
        y1: item.y1 ?? item.y ?? 0,
        x2: item.x2 ?? item.x1 ?? item.x ?? 0,
        y2: item.y2 ?? item.y1 ?? item.y ?? 0
      };
    }

    if (type === 'polygon') {
      const points = Array.isArray(item.points) ? item.points.map((point) => ({ ...point })) : [];
      return {
        points,
        shapePoints: points.map((point) => ({ ...point })),
        polygonPoints: points.map((point) => ({ ...point }))
      };
    }

    if (type === 'measurement') {
      return {
        pts: Array.isArray(item.pts) ? item.pts.map((seg) => ({ ...seg })) : [],
        shapePoints: Array.isArray(item.shapePoints) ? item.shapePoints.map((point) => ({ ...point })) : [],
        polygonPoints: Array.isArray(item.polygonPoints) ? item.polygonPoints.map((point) => ({ ...point })) : []
      };
    }

    return null;
  }

  _updateDragTarget(deltaX, deltaY) {
    if (!this._dragState) return;

    const clamp = (value) => Math.min(1, Math.max(0, value));
    const { type, item, initialSnapshot } = this._dragState;

    const applyToPoints = (points) => points.map((point) => ({
      ...point,
      x: clamp((point.x || 0) + deltaX),
      y: clamp((point.y || 0) + deltaY)
    }));

    if (type === 'line') {
      item.x1 = clamp((initialSnapshot.x1 || 0) + deltaX);
      item.y1 = clamp((initialSnapshot.y1 || 0) + deltaY);
      item.x2 = clamp((initialSnapshot.x2 || 0) + deltaX);
      item.y2 = clamp((initialSnapshot.y2 || 0) + deltaY);
      this.redraw();
      return;
    }

    if (type === 'polygon') {
      if (Array.isArray(item.points)) {
        item.points = applyToPoints(initialSnapshot.points || []);
      }

      const measurement = (this.store.listMeasurements(this.currentPage) || []).find((entry) => entry.id === item.measurementId || entry.id === item.id || entry.polygonId === item.id || entry.id === (item.measurementId || item.id));
      if (measurement) {
        if (Array.isArray(measurement.shapePoints)) {
          measurement.shapePoints = applyToPoints(initialSnapshot.points || []);
        }
        if (Array.isArray(measurement.polygonPoints)) {
          measurement.polygonPoints = applyToPoints(initialSnapshot.points || []);
        }
      }

      this.redraw();
      return;
    }

    if (type === 'measurement') {
      this._applyMeasurementDragDelta(item, initialSnapshot, deltaX, deltaY);
      this.redraw();
    }
  }

  // Pulled out of _updateDragTarget's 'measurement' branch so the group
  // drag path below (multiple box-selected measurements moved together)
  // can apply the exact same per-measurement math without duplicating it.
  // Doesn't redraw itself — callers decide when (the group path redraws
  // once after moving everything, not once per item).
  _applyMeasurementDragDelta(measurement, initialSnapshot, deltaX, deltaY) {
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const applyToPoints = (points) => points.map((point) => ({
      ...point,
      x: clamp((point.x || 0) + deltaX),
      y: clamp((point.y || 0) + deltaY)
    }));

    if (Array.isArray(measurement.pts)) {
      measurement.pts = (initialSnapshot.pts || []).map((seg) => ({
        ...seg,
        x1: clamp((seg.x1 || 0) + deltaX),
        y1: clamp((seg.y1 || 0) + deltaY),
        x2: clamp((seg.x2 || 0) + deltaX),
        y2: clamp((seg.y2 || 0) + deltaY)
      }));
    }

    if (Array.isArray(measurement.shapePoints)) {
      measurement.shapePoints = applyToPoints(initialSnapshot.shapePoints || []);
    }

    if (Array.isArray(measurement.polygonPoints)) {
      measurement.polygonPoints = applyToPoints(initialSnapshot.polygonPoints || []);
    }

    const polygons = this.store.getPage(this.currentPage) || [];
    const polygon = polygons.find((entry) => entry.measurementId === measurement.id || entry.id === measurement.id || entry.id === (measurement.polygonId || measurement.id));
    if (polygon && Array.isArray(polygon.points)) {
      polygon.points = applyToPoints(initialSnapshot.shapePoints || initialSnapshot.polygonPoints || []);
    }
  }

  _onPointerMove = (e) => {

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this._lastPointerPosition = { x, y };

    if (this._groupDragState && this._groupDragState.startPoint) {
      const startPoint = this._groupDragState.startPoint;
      const dx = (x - startPoint.x) / Math.max(1, this.overlay.width || 1);
      const dy = (y - startPoint.y) / Math.max(1, this.overlay.height || 1);
      this._groupDragState.lastPoint = { x, y };
      for (const entry of this._groupDragState.items) {
        this._applyMeasurementDragDelta(entry.measurement, entry.initialSnapshot, dx, dy);
      }
      this.redraw();
      return;
    }

    if (this._dragState && this._dragState.startPoint) {
      const startPoint = this._dragState.startPoint;
      const dx = (x - startPoint.x) / Math.max(1, this.overlay.width || 1);
      const dy = (y - startPoint.y) / Math.max(1, this.overlay.height || 1);
      this._dragState.lastPoint = { x, y };
      this._updateDragTarget(dx, dy);
      return;
    }

    // Drawing-specific hover logic — only when a drawing tool is active
    if (this.active) {
      if (this.tool === 'select' && this._marqueeStart) {
        this._marqueePreview = { x1: this._marqueeStart.x, y1: this._marqueeStart.y, x2: x, y2: y };
        this.redraw();
        return;
      }

      if ((this.tool === 'measure' || this.tool === 'rect') && this._isDraggingMeasure && this._measureStart) {
        const end = this.tool === 'measure'
          ? snapMeasurementEndpoint(this._measureStart, { x, y })
          : { x, y };
        this._measurePreview = { x1: this._measureStart.x, y1: this._measureStart.y, x2: end.x, y2: end.y };
        this.redraw();
        return;
      }

      if (this.tool === 'irregular' && this._pendingPolygonPoints.length > 0) {
        this._irregularPreview = { x1: this._pendingPolygonPoints[this._pendingPolygonPoints.length - 1].x, y1: this._pendingPolygonPoints[this._pendingPolygonPoints.length - 1].y, x2: x, y2: y };
        this.redraw();
        return;
      }

      if (this.tool === 'area') {
        if (!this._barrierState) return;
        this._fillWorker.postMessage({ type: 'preview', seedX: x, seedY: y, ...this._barrierState });
        return;
      }
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

    // Show move cursor when hovering over a draggable shape
    const isAddingIrregPoints = this.tool === 'irregular' && this._pendingPolygonPoints.length > 0;
    if (!isAddingIrregPoints) {
      const hoverTarget = this._findCopyTargetAtPoint(x, y);
      this.overlay.style.cursor = hoverTarget ? 'move' : '';
    }
  };

  _onPointerDown = (e) => {
    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    this._lastPointerPosition = { x, y };

    // In irregular mode while actively adding points, never intercept for drag
    const isAddingIrregPoints = this.tool === 'irregular' && this._pendingPolygonPoints.length > 0;

    // Always allow drag/select on existing shapes, regardless of drawing
    // mode -- but use the tighter (strict) hit radius while a draw tool is
    // armed, so starting a new line/rect close to an existing one draws
    // instead of grabbing it. Normal (generous) radius otherwise, so
    // repositioning something you already drew stays easy.
    const drawToolArmed = this.active && (this.tool === 'measure' || this.tool === 'rect');
    if (!isAddingIrregPoints) {
      const target = this._findCopyTargetAtPoint(x, y, drawToolArmed);
      if (target) {
        e.preventDefault();
        e.stopPropagation();

        // Clicked on a measurement that's part of an active box-selection
        // (see the Select tool below) — drag the whole group together
        // instead of collapsing the selection down to just this one item.
        if (
          target.type === 'measurement' &&
          this._selectedMeasurementIds.size > 1 &&
          this._selectedMeasurementIds.has(target.value.id)
        ) {
          const measurements = this.store.listMeasurements(this.currentPage) || [];
          this._groupDragState = {
            startPoint: { x, y },
            lastPoint: { x, y },
            items: Array.from(this._selectedMeasurementIds)
              .map((id) => measurements.find((entry) => entry.id === id))
              .filter(Boolean)
              .map((measurement) => ({
                measurement,
                initialSnapshot: this._captureDragSnapshot(measurement, 'measurement')
              }))
          };
          this._suppressNextClick = true;
          try { if (this.overlay.setPointerCapture) this.overlay.setPointerCapture(e.pointerId); } catch (err) {}
          this.redraw();
          return;
        }

        this._copiedMeasurement = target;
        this._lastClickedCopyTarget = target;
        this._dragState = {
          type: target.type,
          item: target.value,
          startPoint: { x, y },
          lastPoint: { x, y },
          initialSnapshot: this._captureDragSnapshot(target.value, target.type)
        };
        this._suppressNextClick = true;
        this._selectedMeasurementId = target.type === 'measurement' ? target.value.id : null;
        if (target.type === 'polygon') {
          this._selectedPolygonId = target.value.id || target.value.measurementId || null;
        } else if (target.type === 'measurement' && this._isAreaMeasurement(target.value)) {
          this._selectedPolygonId = target.value.id;
        } else {
          this._selectedPolygonId = null;
        }
        if (target.type === 'line') {
          const lineId = target.value.id || target.value.__id;
          if (lineId) this._selectedLineIds = new Set([lineId]);
        }
        try { if (this.overlay.setPointerCapture) this.overlay.setPointerCapture(e.pointerId); } catch (err) {}
        this.redraw();
        return;
      }
    }

    // Not clicking on a shape — clear selection
    if (this._selectedPolygonId || this._selectedMeasurementId || this._selectedLineIds?.size || this._selectedMeasurementIds.size) {
      this._selectedPolygonId = null;
      this._selectedMeasurementId = null;
      this._selectedLineIds = new Set();
      this._selectedMeasurementIds = new Set();
      this.redraw();
    }

    // Box-select: dragging empty canvas while the Select tool is armed
    // draws a marquee instead of starting a shape (panning is disabled
    // for this tool too — see the mousedown guard in simple-app.js).
    if (this.active && this.tool === 'select') {
      this._marqueeStart = { x, y };
      this._marqueePreview = { x1: x, y1: y, x2: x, y2: y };
      try { if (this.overlay.setPointerCapture) this.overlay.setPointerCapture(e.pointerId); } catch (err) {}
      this.redraw();
      return;
    }

    // Start drawing (only if drawing mode is active)
    if (!this.active) return;
    if (this.tool !== 'measure' && this.tool !== 'rect') return;

    this._isDraggingMeasure = true;
    this._measureStart = { x, y };
    this._measurePreview = { x1: x, y1: y, x2: x, y2: y };
    try { if (this.overlay.setPointerCapture) this.overlay.setPointerCapture(e.pointerId); } catch (err) {}
    this.redraw();
  };

  _onPointerUp = async (e) => {
    // Always handle drag end regardless of drawing mode
    if (this._dragState) {
      const dragState = this._dragState;
      const moved = Boolean(dragState.lastPoint && dragState.startPoint) && (
        Math.abs((dragState.lastPoint.x || 0) - (dragState.startPoint.x || 0)) > 0.5 ||
        Math.abs((dragState.lastPoint.y || 0) - (dragState.startPoint.y || 0)) > 0.5
      );
      if (moved && (dragState.type === 'line' || dragState.type === 'polygon' || dragState.type === 'measurement')) {
        this._pushShapeUndo({
          type: 'move',
          page: this.currentPage,
          targetType: dragState.type,
          itemRef: dragState.item,
          beforeSnapshot: dragState.initialSnapshot
        });
      }
      this._dragState = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}
      this.onMeasurementsChanged?.();
      this.redraw();
      return;
    }

    // Finishing a group drag (multiple box-selected measurements moved
    // together) — also handled regardless of drawing mode, same as the
    // single-item _dragState above.
    if (this._groupDragState) {
      const groupDragState = this._groupDragState;
      const moved = Boolean(groupDragState.lastPoint && groupDragState.startPoint) && (
        Math.abs((groupDragState.lastPoint.x || 0) - (groupDragState.startPoint.x || 0)) > 0.5 ||
        Math.abs((groupDragState.lastPoint.y || 0) - (groupDragState.startPoint.y || 0)) > 0.5
      );
      if (moved) {
        // One undo entry per item rather than teaching undoLastShapeAction
        // a new "group move" action type — reuses it exactly as-is. The
        // tradeoff: Undo has to be pressed once per item to fully revert
        // one group move, instead of once for the whole group.
        for (const entry of groupDragState.items) {
          this._pushShapeUndo({
            type: 'move',
            page: this.currentPage,
            targetType: 'measurement',
            itemRef: entry.measurement,
            beforeSnapshot: entry.initialSnapshot
          });
        }
      }
      this._groupDragState = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}
      this.onMeasurementsChanged?.();
      this.redraw();
      return;
    }

    // Finishing a box-select drag — same "regardless of drawing mode"
    // treatment, since it needs to run even though the checks below this
    // point gate everything on tool === 'measure'/'rect'.
    if (this._marqueeStart) {
      const upRect = this.overlay.getBoundingClientRect();
      const upX = e.clientX - upRect.left;
      const upY = e.clientY - upRect.top;

      const box = {
        x1: Math.min(this._marqueeStart.x, upX),
        y1: Math.min(this._marqueeStart.y, upY),
        x2: Math.max(this._marqueeStart.x, upX),
        y2: Math.max(this._marqueeStart.y, upY)
      };
      // A few pixels of accidental drag (vs. a real box) just clears the
      // selection, same as a plain click on empty canvas already does
      // above.
      const isRealDrag = (box.x2 - box.x1) > 3 || (box.y2 - box.y1) > 3;

      this._marqueeStart = null;
      this._marqueePreview = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}

      if (isRealDrag) {
        const w = this.overlay.width;
        const h = this.overlay.height;
        const measurements = this.store.listMeasurements(this.currentPage) || [];
        const matched = new Set();
        for (const m of measurements) {
          if (this._measurementIntersectsRect(m, box, w, h)) matched.add(m.id);
        }
        this._selectedMeasurementIds = matched;
        this._selectedMeasurementId = null;
        if (matched.size) {
          toast(`${matched.size} measurement${matched.size === 1 ? '' : 's'} selected`, 'info');
        }
      }

      this.redraw();
      return;
    }

    if (!this.active) return;
    if ((this.tool !== 'measure' && this.tool !== 'rect')) return;

    if (!this._isDraggingMeasure || !this._measureStart) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const start = this._measureStart;
    const end = this.tool === 'measure'
      ? snapMeasurementEndpoint(start, { x, y })
      : { x, y };

    // reset preview state
    this._isDraggingMeasure = false;
    this._measureStart = null;
    this._measurePreview = null;
    try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}

    if (this.tool === 'measure') {
      const pixelLength = Math.hypot(end.x - start.x, end.y - start.y) || 0;
      if (pixelLength <= 2) { this.redraw(); return; }

      let scaleFactor = this.store.getScale(this.currentPage)?.factor;
      if (!scaleFactor) {
        const entry = await textPrompt({
          title: 'Set page scale',
          message: 'Examples: "1/16 in = 1 ft" or "3 ft". Leave blank to measure in raw inches.',
        });
        if (entry && entry.trim()) {
          const parsed = computeScaleFactorFromExpression(entry.trim(), pixelLength, this._pxPerPt);
          if (!parsed || !(parsed > 0)) {
            toast('Could not parse scale — saving in raw inches', 'info');
          } else {
            scaleFactor = parsed;
            this.store.setScale(this.currentPage, { factor: scaleFactor, unit: 'in' });
            toast('Scale saved for this page', 'success');
          }
        }
      }

      // compute the real-world inches for this drawn line in a zoom-independent way
      const pageLengthPoints = toPagePoints(pixelLength, this._pxPerPt);
      const rawInches = pageLengthPoints / 72;
      let realInchesForLine = scaleFactor ? (pageLengthPoints * scaleFactor) : rawInches;
      if (this.doubleSided) {
        realInchesForLine *= 2;
      }

      // store measurement record (normalized coordinates)
      const label = formatInches(realInchesForLine);
      const measurementId = `drag-${Date.now()}`;
      const measurement = {
        id: measurementId,
        inches: realInchesForLine,
        label,
        at: Date.now(),
        doubleSided: this.doubleSided,
        pts: [{ x1: start.x / this.overlay.width, y1: start.y / this.overlay.height, x2: end.x / this.overlay.width, y2: end.y / this.overlay.height }]
      };
      this.onLineMeasurementCreated?.(measurement);
      this.store.addMeasurement(this.currentPage, measurement);

      this._pushShapeUndo({
        type: 'add',
        page: this.currentPage,
        measurementId,
        polygonId: null
      });
      this.onMeasurementsChanged?.();
      toast(`Measured: ${label}`, 'success');

      this.redraw();
      return;
    }

    if (this.tool === 'rect') {
      const pixelWidth = Math.abs(end.x - start.x);
      const pixelHeight = Math.abs(end.y - start.y);
      const pixelArea = pixelWidth * pixelHeight;
      if (pixelArea <= 4) { this.redraw(); return; }

      // convert area from pixels to a zoom-independent page-area value, then apply scale if present
      const scale = this.store.getScale(this.currentPage);
      const areaScaled = applyScale(pixelArea, this._pxPerPt, scale?.factor);

      // normalized rectangle polygon
      const left = Math.min(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const right = Math.max(start.x, end.x);
      const bottom = Math.max(start.y, end.y);

      const norm = [
        { x: left / this.overlay.width, y: top / this.overlay.height },
        { x: right / this.overlay.width, y: top / this.overlay.height },
        { x: right / this.overlay.width, y: bottom / this.overlay.height },
        { x: left / this.overlay.width, y: bottom / this.overlay.height }
      ];

      const measurementId = makeStableId('rect');

      // save polygon for visualization and tie it to the measurement so it can be removed together
      this.store.addPolygon(this.currentPage, { points: norm, measurementId });

      // save area measurement record
      this.store.addMeasurement(this.currentPage, {
        id: measurementId,
        area: areaScaled,
        areaPx: pixelArea,
        areaLabel: `${areaScaled.toFixed(2)} sq`,
        at: Date.now(),
        shapeType: 'polygon',
        shapePoints: norm,
        polygonPoints: norm,
        pts: [{ x1: left / this.overlay.width, y1: top / this.overlay.height, x2: right / this.overlay.width, y2: bottom / this.overlay.height }]
      });

      this._pushShapeUndo({
        type: 'add',
        page: this.currentPage,
        measurementId,
        polygonId: measurementId
      });
      this.onMeasurementsChanged?.();
      toast(`Area: ${areaScaled.toFixed(2)} sq`, 'success');

      this.redraw();
      return;
    }
  };

  _onPointerCancel = (e) => {
    if (this._dragState) {
      this._dragState = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}
      this.redraw();
      return;
    }

    if (this._isDraggingMeasure) {
      this._isDraggingMeasure = false;
      this._measureStart = null;
      this._measurePreview = null;
      try { if (this.overlay.releasePointerCapture) this.overlay.releasePointerCapture(e.pointerId); } catch (err) {}
      this.redraw();
    }
  };

  _findPolygonAtPoint(x, y) {
    const w = this.overlay?.width || 0;
    const h = this.overlay?.height || 0;
    if (!w || !h) return null;

    const polygons = this.store.getPage(this.currentPage) || [];
    if (!polygons.length) return null;

    const hitThreshold = Math.max(12, 12 * (this.zoom || 1));

    // Collect all candidates; prefer interior hits, then smallest area (most specific shape wins)
    const interiorHits = [];
    const edgeHits = [];

    for (const polygon of polygons) {
      // Skip unlinked polygons (legacy smart fill with no id/measurementId) — can't be selected
      if (!polygon.id && !polygon.measurementId) continue;
      const points = Array.isArray(polygon.points) ? polygon.points : [];
      if (points.length < 2) continue;
      const screenPoints = points.map((p) => ({ x: p.x * w, y: p.y * h }));

      if (screenPoints.length >= 3 && pointInPolygon({ x, y }, screenPoints)) {
        // Compute approximate area so smaller shapes win when overlapping
        let area = 0;
        for (let i = 0, j = screenPoints.length - 1; i < screenPoints.length; j = i++) {
          area += (screenPoints[j].x + screenPoints[i].x) * (screenPoints[j].y - screenPoints[i].y);
        }
        interiorHits.push({ polygon, area: Math.abs(area) });
        continue;
      }

      for (let i = 0; i < screenPoints.length; i++) {
        const a = screenPoints[i];
        const b = screenPoints[(i + 1) % screenPoints.length];
        const d = pointToSegmentDistance({ x, y }, a, b);
        if (d <= hitThreshold) {
          edgeHits.push({ polygon, dist: d });
          break;
        }
      }
    }

    if (interiorHits.length) {
      // Prefer linked (rect/irreg) over unlinked (smart fill)
      // Among linked: deprioritize the currently-selected shape so clicking on overlapping shapes cycles to others
      // Then sort by smallest area (most specific shape wins)
      interiorHits.sort((a, b) => {
        const aLinked = a.polygon.measurementId ? 0 : 1;
        const bLinked = b.polygon.measurementId ? 0 : 1;
        if (aLinked !== bLinked) return aLinked - bLinked;
        const aSelected = (a.polygon.id === this._selectedPolygonId || a.polygon.measurementId === this._selectedPolygonId) ? 1 : 0;
        const bSelected = (b.polygon.id === this._selectedPolygonId || b.polygon.measurementId === this._selectedPolygonId) ? 1 : 0;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.area - b.area;
      });
      return interiorHits[0].polygon;
    }
    if (edgeHits.length) {
      edgeHits.sort((a, b) => a.dist - b.dist);
      return edgeHits[0].polygon;
    }
    return null;
  }

  _findMeasurementAtPoint(x, y) {
    const w = this.overlay?.width || 0;
    const h = this.overlay?.height || 0;
    if (!w || !h) return null;

    const measurements = this.store.listMeasurements(this.currentPage) || [];
    if (!measurements.length) return null;

    let nearestLineMeasurement = null;
    let nearestLineMeasurementDist = Infinity;
    let nearestAreaMeasurement = null;
    let nearestAreaMeasurementDist = Infinity;

    const getSegmentsForMeasurement = (m) => {
      const polygonPoints = Array.isArray(m.shapePoints) && m.shapePoints.length
        ? m.shapePoints
        : (Array.isArray(m.polygonPoints) && m.polygonPoints.length ? m.polygonPoints : null);

      if (polygonPoints && polygonPoints.length >= 2) {
        const points = polygonPoints.map(point => ({ x: point.x * w, y: point.y * h }));
        return points.map((point, index) => {
          const nextPoint = points[(index + 1) % points.length];
          return { a: point, b: nextPoint };
        });
      }

      return (Array.isArray(m.pts) ? m.pts : []).map(seg => ({
        a: { x: seg.x1 * w, y: seg.y1 * h },
        b: { x: seg.x2 * w, y: seg.y2 * h }
      }));
    };

    // Interior hits: area measurements where the point is inside the polygon
    const areaInteriorHits = [];

    for (const m of measurements) {
      const isAreaMeasurement = m.area != null || m.areaLabel != null || m.areaPx != null || m.shapeType === 'polygon' ||
        (Array.isArray(m.shapePoints) && m.shapePoints.length >= 3) ||
        (Array.isArray(m.polygonPoints) && m.polygonPoints.length >= 3);

      if (isAreaMeasurement) {
        const polygonPoints = Array.isArray(m.shapePoints) && m.shapePoints.length >= 3
          ? m.shapePoints
          : (Array.isArray(m.polygonPoints) && m.polygonPoints.length >= 3 ? m.polygonPoints : null);
        if (polygonPoints) {
          const screenPts = polygonPoints.map(p => ({ x: p.x * w, y: p.y * h }));
          if (pointInPolygon({ x, y }, screenPts)) {
            let area = 0;
            for (let i = 0, j = screenPts.length - 1; i < screenPts.length; j = i++) {
              area += (screenPts[j].x + screenPts[i].x) * (screenPts[j].y - screenPts[i].y);
            }
            areaInteriorHits.push({ m, area: Math.abs(area) });
            continue;
          }
        }
      }

      const segments = getSegmentsForMeasurement(m);
      for (const seg of segments) {
        const d = pointToSegmentDistance({ x, y }, seg.a, seg.b);

        if (isAreaMeasurement) {
          if (d < nearestAreaMeasurementDist) {
            nearestAreaMeasurementDist = d;
            nearestAreaMeasurement = m;
          }
        } else if (d < nearestLineMeasurementDist) {
          nearestLineMeasurementDist = d;
          nearestLineMeasurement = m;
        }
      }
    }

    // Interior hits take priority over edge hits; prefer non-selected + smallest area
    if (areaInteriorHits.length) {
      areaInteriorHits.sort((a, b) => {
        const aSelected = (a.m.id === this._selectedMeasurementId || a.m.id === this._selectedPolygonId) ? 1 : 0;
        const bSelected = (b.m.id === this._selectedMeasurementId || b.m.id === this._selectedPolygonId) ? 1 : 0;
        if (aSelected !== bSelected) return aSelected - bSelected;
        return a.area - b.area;
      });
      return areaInteriorHits[0].m;
    }

    const hitThreshold = Math.max(12, 12 * (this.zoom || 1));
    return nearestLineMeasurement && nearestLineMeasurementDist <= hitThreshold
      ? nearestLineMeasurement
      : (nearestAreaMeasurement && nearestAreaMeasurementDist <= hitThreshold ? nearestAreaMeasurement : null);
  }

  _onDoubleClick = (e) => {

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const targetMeasurement = this._findMeasurementAtPoint(x, y);
    if (targetMeasurement) {
      this.onLineMeasurementRemoved?.(targetMeasurement);
      this.store.removeMeasurement(this.currentPage, targetMeasurement.id);
      this.onMeasurementsChanged?.();
      toast('Measurement removed', 'info');
      this.redraw();
      return;
    }

    if (this.tool === 'irregular' && this._pendingPolygonPoints.length >= 3) {
      this._finalizeIrregularPolygon();
    }
  };

  _finalizeIrregularPolygon = () => {
    if (this._pendingPolygonPoints.length < 3) {
      this._pendingPolygonPoints = [];
      this._irregularPreview = null;
      this.redraw();
      return;
    }

    const points = this._pendingPolygonPoints.map(p => ({ x: p.x, y: p.y }));
    const pathPoints = points.length > 1 ? points : points;
    const closedPoints = pathPoints.length > 1 ? [...pathPoints, pathPoints[0]] : [...points, points[0]];
    const pixelArea = calculateFilledAreaPixels(closedPoints);
    if (pixelArea <= 4) {
      this._pendingPolygonPoints = [];
      this._irregularPreview = null;
      this.redraw();
      return;
    }

    const scale = this.store.getScale(this.currentPage);
    const areaScaled = applyScale(pixelArea, this._pxPerPt, scale?.factor);
    const norm = pathPoints.map(point => ({ x: point.x / this.overlay.width, y: point.y / this.overlay.height }));
    const measurementId = makeStableId('irreg');

    this.store.addPolygon(this.currentPage, { points: norm, measurementId });
    this.store.addMeasurement(this.currentPage, {
      id: measurementId,
      area: areaScaled,
      areaPx: pixelArea,
      areaLabel: `${areaScaled.toFixed(2)} sq`,
      at: Date.now(),
      shapeType: 'polygon',
      shapePoints: norm,
      polygonPoints: norm,
      pts: pathPoints.map((point, index) => ({ x1: point.x / this.overlay.width, y1: point.y / this.overlay.height, x2: (index < pathPoints.length - 1 ? pathPoints[index + 1] : pathPoints[0]).x / this.overlay.width, y2: (index < pathPoints.length - 1 ? pathPoints[index + 1] : pathPoints[0]).y / this.overlay.height }))
    });

    this._pushShapeUndo({
      type: 'add',
      page: this.currentPage,
      measurementId,
      polygonId: measurementId
    });
    this.onMeasurementsChanged?.();
    toast(`Area: ${areaScaled.toFixed(2)} sq`, 'success');

    this._pendingPolygonPoints = [];
    this._irregularPreview = null;
    this.redraw();
  };

  _onClick = async (e) => {
    if (this._suppressNextClick) {
      this._suppressNextClick = false;
      return;
    }
    // Drawing tool clicks handled below; selection works in any mode
    if (!this.active) return;

    const rect = this.overlay.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.tool === 'area') {
      if (!this._barrierState) return;
      this._fillWorker.postMessage({ type: 'commit', seedX: x, seedY: y, ...this._barrierState });
      return;
    }

    if (this.tool === 'irregular') {
      if (this._pendingPolygonPoints.length === 0) {
        this._pendingPolygonPoints = [{ x, y }];
        this._irregularPreview = null;
        this.redraw();
        return;
      }

      const firstPoint = this._pendingPolygonPoints[0];
      const closeDistance = Math.hypot(x - firstPoint.x, y - firstPoint.y);
      if (this._pendingPolygonPoints.length >= 3 && closeDistance <= 10) {
        this._finalizeIrregularPolygon();
        return;
      }

      this._pendingPolygonPoints.push({ x, y });
      this._irregularPreview = null;
      this.redraw();
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
      let nearestLineMeasurement = null;
      let nearestLineMeasurementDist = Infinity;
      let nearestAreaMeasurement = null;
      let nearestAreaMeasurementDist = Infinity;

      for (const m of measurements) {
        if (!m.pts || !m.pts.length) continue;

        const isAreaMeasurement = m.area != null || m.areaLabel;
        for (const seg of m.pts) {
          const a = { x: seg.x1 * w, y: seg.y1 * h };
          const b = { x: seg.x2 * w, y: seg.y2 * h };
          const d = pointToSegmentDistance({ x, y }, a, b);
          if (isAreaMeasurement) {
            if (d < nearestAreaMeasurementDist) {
              nearestAreaMeasurementDist = d;
              nearestAreaMeasurement = m;
            }
          } else if (d < nearestLineMeasurementDist) {
            nearestLineMeasurementDist = d;
            nearestLineMeasurement = m;
          }
        }
      }

      const deleteThreshold = Math.max(10, 10 * (this.zoom || 1));
      const targetMeasurement = nearestLineMeasurement && nearestLineMeasurementDist <= deleteThreshold
        ? nearestLineMeasurement
        : (nearestAreaMeasurement && nearestAreaMeasurementDist <= deleteThreshold ? nearestAreaMeasurement : null);

      if (targetMeasurement) {
        if (e.altKey) {
          this.onLineMeasurementRemoved?.(targetMeasurement);
          this.store.removeMeasurement(this.currentPage, targetMeasurement.id);
          this.onMeasurementsChanged?.();
          toast('Measurement removed', 'info');
          this.redraw();
          return;
        }
        this._selectedMeasurementId = targetMeasurement.id;
        this.redraw();
        return;
      }
    }

    if (!nearest || nearestDist > Math.max(8, 8 * (this.zoom || 1))) return;

    const id = nearest.id || nearest.__id;

    // Alt+click a detected/vector line to remove just that one — same
    // gesture the measurement-delete path above already uses, so it's one
    // consistent shortcut across every kind of shape on the calendar.
    if (e.altKey) {
      this.store.removeLine(this.currentPage, id);
      this._selectedLineIds.delete(id);
      this.onMeasurementsChanged?.();
      toast('Line removed', 'info');
      this.redraw();
      return;
    }

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
      const entry = await textPrompt({
        title: 'Set page scale',
        message: 'Examples: "1/16 in = 1 ft" or "3 ft". Leave blank to cancel.',
      });
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

    const pageLengthPoints = toPagePoints(pixelLength, this._pxPerPt);
    let measuredInches = pageLengthPoints * scaleFactor;
    if (this.doubleSided) {
      measuredInches *= 2;
    }
    if (measuredInches !== null) {
      const txt = formatInches(measuredInches);
      toast(`Length: ${txt}`, 'info');
      const measurement = {
        id: `line-${Date.now()}`,
        inches: measuredInches,
        label: txt,
        at: Date.now(),
        doubleSided: this.doubleSided,
        pts: [{ x1: nearest.x1 || nearest.x, y1: nearest.y1 || nearest.y, x2: nearest.x2 || nearest.x1, y2: nearest.y2 || nearest.y1 }]
      };
      this.onLineMeasurementCreated?.(measurement);
      this.store.addMeasurement(this.currentPage, measurement);
      this.onMeasurementsChanged?.();
    } else {
      toast(`Length: ${((pixelLength / this._pxPerPt) / 72).toFixed(2)} in`, 'info');
    }

    this.redraw();
  };

  resizeToMatchCanvas() {
    // match backing store size (pixels)
    this.overlay.width = this.canvasEl.width;
    this.overlay.height = this.canvasEl.height;
    // match CSS size so the overlay covers the visible canvas
    // use width/height attributes (not clientWidth) to avoid 0 when parent is display:none
    try {
      const w = this.canvasEl.width || this.canvasEl.clientWidth;
      const h = this.canvasEl.height || this.canvasEl.clientHeight;
      if (w > 0) this.overlay.style.width = `${w}px`;
      if (h > 0) this.overlay.style.height = `${h}px`;
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

    this._notifySelectionChangeIfNeeded();

    this.clear();
    this.renderToContext(this.ctx, { width: this.overlay.width, height: this.overlay.height });
  }

  // redraw() runs on every selection change (and plenty of other things —
  // zoom, pan, drag) so this only actually fires onSelectionChanged when
  // the selected measurement/polygon id has changed since the last check,
  // rather than needing a dedicated call at every one of the several
  // places selection gets set (_onPointerDown, _pasteMeasurement,
  // _onContextMenu, ...).
  _notifySelectionChangeIfNeeded() {
    const key = `${this._selectedMeasurementId || ''}|${this._selectedPolygonId || ''}|${Array.from(this._selectedMeasurementIds).sort().join(',')}`;
    if (key === this._lastNotifiedSelectionKey) return;
    this._lastNotifiedSelectionKey = key;
    this.onSelectionChanged?.();
  }

  // Every currently-selected line measurement (not area/rect shapes —
  // "single/double-sided" only means anything for a linear wall
  // measurement) — one via a plain click (_selectedMeasurementId), or
  // several via the Select tool's box-select (_selectedMeasurementIds).
  // Used by the Single/Double sided toolbar toggle so it acts on
  // whatever's selected instead of just the default for new measurements
  // (see setSelectedMeasurementsDoubleSided).
  getSelectedLineMeasurements() {
    const ids = this._selectedMeasurementIds.size > 0
      ? Array.from(this._selectedMeasurementIds)
      : (this._selectedMeasurementId ? [this._selectedMeasurementId] : []);
    if (!ids.length) return [];
    const measurements = this.store.listMeasurements(this.currentPage) || [];
    return ids
      .map((id) => measurements.find((entry) => entry.id === id))
      .filter((measurement) => measurement && !this._isAreaMeasurement(measurement));
  }

  // Sets every selected line measurement's single/double-sided flag after
  // the fact, rather than only setting the default new measurements are
  // created with (see this.doubleSided/setDoubleSided). The real-world
  // length was doubled into `inches` at creation time (see the line-
  // measurement creation code above), not recomputed live from
  // doubleSided on every redraw/total, so flipping the flag here has to
  // also double/halve the stored inches to match — otherwise every
  // downstream total that reads `inches` would silently go stale.
  setSelectedMeasurementsDoubleSided(value) {
    const measurements = this.getSelectedLineMeasurements();
    if (!measurements.length) return false;

    const nextDoubleSided = Boolean(value);
    for (const measurement of measurements) {
      if (Boolean(measurement.doubleSided) === nextDoubleSided) continue;
      measurement.inches = nextDoubleSided
        ? (measurement.inches || 0) * 2
        : (measurement.inches || 0) / 2;
      measurement.doubleSided = nextDoubleSided;
      measurement.label = formatInches(measurement.inches);
    }

    this.onMeasurementsChanged?.();
    this.redraw();
    return true;
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

function drawPolygon(ctx, pts, solid, { selected = false } = {}) {
  if (!pts.length) return;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();

  if (selected) {
    ctx.fillStyle = 'rgba(99,102,241,0.25)';
    ctx.strokeStyle = 'rgba(99,102,241,0.95)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 3]);
  } else {
    ctx.fillStyle = solid ? 'rgba(255,214,10,0.35)' : 'rgba(255,214,10,0.15)';
    ctx.strokeStyle = 'rgba(255,195,0,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
  }

  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
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

function calculateFilledAreaPixels(points) {
  if (!points || points.length < 3) return 0;
  return calculatePolygonArea(points);
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

function toPagePoints(lengthPx, pxPerPt) {
  const scale = Number(pxPerPt) || 1;
  return lengthPx / scale;
}

function applyScale(areaPx, pxPerPt, scaleFactor = null) {
  const pxPerPtValue = Number(pxPerPt);
  if (!Number.isFinite(pxPerPtValue) || pxPerPtValue <= 0) return 0;
  const pageAreaPoints = areaPx / (pxPerPtValue * pxPerPtValue);
  if (scaleFactor && Number(scaleFactor) > 0) {
    const scaleValue = Number(scaleFactor);
    return pageAreaPoints * scaleValue * scaleValue / 144;
  }
  return pageAreaPoints / (72 * 72);
}

function applyScaleLength(lengthPx, pxPerPt, scaleFactor = null) {
  const pageLengthPoints = toPagePoints(lengthPx, pxPerPt);
  if (scaleFactor && Number(scaleFactor) > 0) {
    return pageLengthPoints * Number(scaleFactor);
  }
  return pageLengthPoints / 72;
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

function drawLabel(ctx, x, y, txt, scale = 1) {
  ctx.save();
  const labelScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  ctx.font = `${14 * labelScale}px sans-serif`;
  ctx.fillStyle = 'rgba(20,20,20,0.95)';
  const padding = 6 * labelScale;
  const m = ctx.measureText(txt);
  const w = m.width + padding * 2;
  const h = (18 + 6) * labelScale;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillText(txt, x - m.width / 2, y + 6 * labelScale);
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
function drawPreviewLine(ctx, a, b, { doubleSided = false } = {}) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,120,212,0.95)';
  ctx.lineWidth = 3;
  // Same dashed=single/solid=double convention as drawMeasurementLine —
  // a single line either way.
  ctx.setLineDash(doubleSided ? [] : [6, 6]);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.restore();
}

function drawPreviewRect(ctx, a, b) {
  ctx.save();
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.fillStyle = 'rgba(0,120,212,0.18)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,120,212,0.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([6,6]);
  ctx.stroke();
  ctx.restore();
}

function buildSmoothedPathPoints(points, preview = null, samples = 24) {
  if (!points || !points.length) return [];
  const anchors = preview ? [...points, { x: preview.x2, y: preview.y2 }] : [...points];
  return anchors.map(point => ({ x: point.x, y: point.y }));
}

function drawIrregularPath(ctx, points, preview) {
  const pathPoints = buildSmoothedPathPoints(points, preview, 24);
  if (!pathPoints.length) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
  for (let i = 1; i < pathPoints.length; i++) {
    ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
  }
  ctx.strokeStyle = 'rgba(0,120,212,0.95)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.restore();
}

// Dashed blue box with a faint fill — the box-select marquee (see the
// Select tool / _marqueePreview in CanvasOverlay). Drawn live while
// dragging, same visual vocabulary as the other preview shapes below.
function drawMarqueeSelection(ctx, a, b) {
  ctx.save();
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(left, top, width, height);
  ctx.restore();
}

function pointInRect(p, rect) {
  return p.x >= rect.x1 && p.x <= rect.x2 && p.y >= rect.y1 && p.y <= rect.y2;
}

// Standard orientation-based segment intersection test (degenerate
// collinear-overlap cases aren't handled — acceptable for a selection
// box, not for anything geometrically load-bearing).
function ccw(a, b, c) {
  return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
}

// Whether segment a-b "touches" rect at all — either endpoint inside it,
// or the segment crosses one of its four edges. Used by the Select
// tool's box-select to decide which measurement lines a dragged marquee
// caught (see _measurementIntersectsRect).
function segmentIntersectsRect(a, b, rect) {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true;
  const corners = [
    { x: rect.x1, y: rect.y1 },
    { x: rect.x2, y: rect.y1 },
    { x: rect.x2, y: rect.y2 },
    { x: rect.x1, y: rect.y2 }
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function samePoints(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((pt, i) => {
    const other = b[i] || {};
    return Math.abs((pt.x || 0) - (other.x || 0)) < 1e-9 && Math.abs((pt.y || 0) - (other.y || 0)) < 1e-9;
  });
}

function makeStableId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function drawMeasurementLine(ctx, a, b, { hover = false, selected = false, doubleSided = false } = {}) {
  ctx.save();
  ctx.strokeStyle = selected ? 'rgba(0,220,120,0.95)' : hover ? 'rgba(120,220,180,0.95)' : 'rgba(0,180,120,0.8)';
  ctx.lineWidth = selected ? 4 : hover ? 3 : 2.5;
  // Dashed = single-sided, solid = double-sided — a single line either
  // way. (Used to also draw double-sided as two parallel strokes; that
  // read as a rendering glitch rather than a deliberate style, so it's
  // just the dash/solid distinction now.)
  ctx.setLineDash(doubleSided ? [] : [4, 4]);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
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

// compute a zoom-independent scale factor in inches per PDF point
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

// draw a preview (temporary) measurement line
