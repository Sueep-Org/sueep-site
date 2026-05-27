// Ruler overlay scaffold: attaches a transparent canvas for future measurement UI

export class RulerOverlay {
  constructor(){ this.wrapperEl=null; this.canvasEl=null; this.root=null; this.canvas=null; this.ctx=null; this.active=false; }

  attach({ wrapperEl, canvasEl }){
    this.wrapperEl = wrapperEl; this.canvasEl = canvasEl;
    if(!wrapperEl || !canvasEl || this.root) return;
    const root = document.createElement('div');
    root.id = 'rulerOverlayRoot';
    root.style.position = 'absolute';
    root.style.left = '0';
    root.style.top = '0';
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '4';
    const c = document.createElement('canvas');
    c.id = 'rulerOverlay';
    c.style.position = 'absolute';
    c.style.left = '0';
    c.style.top = '0';
    c.style.pointerEvents = 'none';
    c.style.touchAction = 'none';
    root.appendChild(c);
    wrapperEl.appendChild(root);
    this.root = root; this.canvas = c; this.ctx = c.getContext('2d');
    this._resizeToMatch();
    console.log('[ruler] attached');
  }

  detach(){ if(!this.root) return; this.root.remove(); this.root=null; this.canvas=null; this.ctx=null; console.log('[ruler] detached'); }

  _resizeToMatch(){ if(!this.canvas || !this.canvasEl) return; this.canvas.width = this.canvasEl.width||0; this.canvas.height = this.canvasEl.height||0; this.canvas.style.width=this.canvasEl.style.width||''; this.canvas.style.height=this.canvasEl.style.height||''; this.canvas.style.left=this.canvasEl.style.left||'0px'; this.canvas.style.top=this.canvasEl.style.top||'0px'; this.clear(); }

  setActive(on){ this.active = !!on; if(!this.canvas) return; this.canvas.style.pointerEvents = this.active ? 'auto' : 'none'; console.log('[ruler] active =', this.active); }

  onPageChange(page){ console.log('[ruler] page =', page); this._resizeToMatch(); this.clear(); }

  onZoomChange({ zoom, panX, panY }){ console.log('[ruler] zoom change', { zoom, panX, panY }); this._resizeToMatch(); this.clear(); }

  setScale({ pxPerUnit, unit }){ console.log('[ruler] set scale', { pxPerUnit, unit }); }

  clear(){ if(!this.ctx||!this.canvas) return; this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height); }
}

export default RulerOverlay;




