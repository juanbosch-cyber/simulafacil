/* SIMULA FÁCIL IA — editor de fluxograma (PFD) em SVG: arrastar, ligar portas, zoom, roteamento ortogonal, setas de energia e exportação */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const NS = 'http://www.w3.org/2000/svg';
  const IC = SF.icons, U = SF.units;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (v, d) => (v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : v.toFixed(d == null ? 2 : d));

  const isCol = t => t === 'column' || t === 'column_short';
  function nameX(b) { return isCol(b.type) ? 27 : IC.G[b.type].w / 2; }
  function portPos(b, port) { const g = IC.G[b.type]; const p = g && g.ports[port]; if (!p) return null; return { x: b.x + p.x, y: b.y + p.y, dir: p.dir }; }

  function route(a, b, blocks, off) {
    const S = 18, p1 = { x: a.x + a.dir[0] * S, y: a.y + a.dir[1] * S }, p2 = { x: b.x + b.dir[0] * S, y: b.y + b.dir[1] * S };
    const pts = [[a.x, a.y], [p1.x, p1.y]];
    if (p1.x <= p2.x - 4) {
      let mx = Math.round((p1.x + p2.x) / 2 + (off || 0)); mx = Math.max(p1.x + 4, Math.min(p2.x - 4, mx));
      if (a.dir[1] !== 0 && b.dir[1] === 0) { pts.push([p1.x, p2.y]); }
      else if (a.dir[1] === 0 && b.dir[1] !== 0) { pts.push([p2.x, p1.y]); }
      else { pts.push([mx, p1.y]); pts.push([mx, p2.y]); }
    } else { // retorno (reciclo): contorna por baixo
      let ymax = Math.max(p1.y, p2.y); blocks.forEach(bl => { const g = IC.G[bl.type]; if (bl.x < Math.max(p1.x, p2.x) + 40 && bl.x + g.w > Math.min(p1.x, p2.x) - 40) ymax = Math.max(ymax, bl.y + g.h); });
      const yb = ymax + 36; pts.push([p1.x, yb]); pts.push([p2.x, yb]);
    }
    pts.push([p2.x, p2.y]); pts.push([b.x, b.y]);
    // remove pontos colineares
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) { const [x0, y0] = out[out.length - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; if ((x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2)) continue; out.push(pts[i]); }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function portOffset(st, s) { // separa verticais de correntes que chegam ao mesmo equipamento
    const b = st.blocks.find(x => x.id === s.to); if (!b) return 0;
    const ins = st.streams.filter(x => x.to === s.to).map(x => x.toPort);
    const g = IC.G[b.type]; ins.sort((p, q) => (g.ports[p] ? g.ports[p].y : 0) - (g.ports[q] ? g.ports[q].y : 0));
    const k = ins.indexOf(s.toPort); return ins.length > 1 ? (k - (ins.length - 1) / 2) * -16 : 0;
  }
  function longestSeg(pts) { let best = 0, bi = 0; for (let i = 0; i < pts.length - 1; i++) { const d = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]); if (d > best) { best = d; bi = i; } } return { x: (pts[bi][0] + pts[bi + 1][0]) / 2, y: (pts[bi][1] + pts[bi + 1][1]) / 2, horiz: pts[bi][1] === pts[bi + 1][1] }; }
  const pathD = pts => 'M' + pts.map(p => p[0] + ' ' + p[1]).join(' L');

  /* posições automáticas por camadas (fontes à esquerda) */
  function autoLayout(state, force) {
    const blocks = state.blocks; if (!blocks.length) return;
    if (!force && blocks.every(b => isFinite(b.x) && isFinite(b.y))) return;
    const out = {}, indeg = {}; blocks.forEach(b => { out[b.id] = []; indeg[b.id] = 0; });
    state.streams.forEach(s => { if (out[s.from] && out[s.to] !== undefined) out[s.from].push(s.to); });
    // remove arestas de retorno por DFS
    const color = {}, back = new Set();
    const dfs = u => { color[u] = 1; out[u].forEach(v => { if (color[v] === 1) back.add(u + '>' + v); else if (!color[v]) dfs(v); }); color[u] = 2; };
    blocks.filter(b => b.type === 'feed').concat(blocks).forEach(b => { if (!color[b.id]) dfs(b.id); });
    const layer = {}; blocks.forEach(b => { layer[b.id] = 0; });
    for (let k = 0; k < blocks.length; k++) state.streams.forEach(s => { if (layer[s.from] == null || layer[s.to] == null || back.has(s.from + '>' + s.to)) return; if (layer[s.to] < layer[s.from] + 1) layer[s.to] = layer[s.from] + 1; });
    blocks.forEach(b => { if (b.type === 'product') { const inc = state.streams.find(s => s.to === b.id); if (inc) layer[b.id] = layer[inc.from] + 1; } });
    const layers = {}; blocks.forEach(b => { (layers[layer[b.id]] = layers[layer[b.id]] || []).push(b); });
    const keys = Object.keys(layers).map(Number).sort((a, b) => a - b);
    const place = () => {
      let x = 40;
      keys.forEach(k => {
        const col = layers[k]; const wmax = Math.max.apply(null, col.map(b => IC.G[b.type].w));
        const tot = col.reduce((s, b) => s + IC.G[b.type].h + 70, -70); let y = Math.max(40, 260 - tot / 2);
        col.forEach(b => { const g = IC.G[b.type]; b.x = x + (wmax - g.w) / 2; b.y = y; y += g.h + 70; });
        const open = col.some(b => U.TYPES[b.type] && U.TYPES[b.type].outs.some(o => o !== 'side' && o !== 'out3' && !state.streams.some(s => s.from === b.id && s.fromPort === o)));
        x += wmax + 150 + (open ? 130 : 0);
      });
    };
    place();
    // ordena cada camada pela altura da porta de destino (reduz cruzamentos) e reposiciona
    const bmap = {}; blocks.forEach(b => { bmap[b.id] = b; });
    const keyY = b => { const s = state.streams.find(q => q.from === b.id && bmap[q.to]); if (!s) { const t = state.streams.find(q => q.to === b.id && bmap[q.from]); if (!t) return b.y; const pp = portPos(bmap[t.from], t.fromPort); return pp ? pp.y : b.y; } const p = portPos(bmap[s.to], s.toPort); return p ? p.y : b.y; };
    for (let pass = 0; pass < 2; pass++) { keys.forEach(k => { const ys = {}; layers[k].forEach(b => { ys[b.id] = keyY(b); }); layers[k].sort((a, b) => ys[a.id] - ys[b.id]); }); place(); }
  }

  function energyMarks(b, r) {
    if (!r) return [];
    const g = IC.G[b.type], marks = [];
    const add = (x, y, Q, label, up) => marks.push({ x: b.x + x, y: b.y + y, Q, label, up });
    if (r.duties && (b.type === 'column' || b.type === 'column_short')) { add(82, -4, r.duties.Qc, 'Qc', true); add(82, g.h + 4, r.duties.Qr, 'Qr', false); }
    else if (r.duty != null && Math.abs(r.duty) > 1e-3 && b.type !== 'feed') add(g.w - 2, g.h + 4, r.duty, r.power ? 'W' : 'Q', false);
    return marks;
  }

  function PFD(svg, opts) {
    this.svg = svg; this.o = opts; this.tx = 20; this.ty = 20; this.s = 1; this.sel = null; this.arm = null; this.drag = null;
    this._bind();
  }
  PFD.prototype.toWorld = function (e) { const r = this.svg.getBoundingClientRect(); return { x: (e.clientX - r.left - this.tx) / this.s, y: (e.clientY - r.top - this.ty) / this.s }; };
  PFD.prototype.render = function () {
    const st = this.o.getState(), res = this.o.getResults ? this.o.getResults() : null, self = this;
    const bmap = {}; st.blocks.forEach(b => { bmap[b.id] = b; });
    let h = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--stream)"/></marker>' +
      '<marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--energy)"/></marker></defs>';
    h += '<g id="vp" transform="translate(' + this.tx + ',' + this.ty + ') scale(' + this.s + ')">';
    // correntes
    st.streams.forEach(s => {
      const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return;
      const p1 = portPos(a, s.fromPort), p2 = portPos(b, s.toPort); if (!p1 || !p2) return;
      const pts = route(p1, p2, st.blocks, portOffset(st, s)), d = pathD(pts), sel = this.sel && this.sel.kind === 'stream' && this.sel.id === s.id;
      const ss = res && res.streams && res.streams[s.id];
      const tip = ss ? esc(s.name) + ': ' + fmt(ss.T - 273.15, 1) + ' °C, ' + fmt(ss.P / 1e5, 3) + ' bar, ' + fmt(ss.F * 3.6, 3) + ' kmol/h, vf ' + fmt(ss.beta, 3) : esc(s.name);
      h += '<g data-stream="' + esc(s.id) + '"><title>' + tip + '</title><path class="str' + (sel ? ' sel' : '') + '" d="' + d + '" marker-end="url(#arr)"/><path class="str-hit" d="' + d + '"/>';
      const m = longestSeg(pts), w = Math.max(22, String(s.name).length * 7 + 10);
      h += '<g class="str-lbl"><rect x="' + (m.x - w / 2) + '" y="' + (m.y - 9) + '" width="' + w + '" height="18" rx="4"/><text x="' + m.x + '" y="' + (m.y + 4) + '">' + esc(s.name) + '</text></g></g>';
    });
    // saídas não conectadas após simulação
    if (res && res.extraStreams) res.extraStreams.forEach(x => {
      const b = bmap[x.from]; if (!b) return; const p = portPos(b, x.fromPort); if (!p) return;
      const e = { x: p.x + p.dir[0] * 46, y: p.y + p.dir[1] * 46 };
      const ss = res.streams[x.id];
      h += '<g><title>' + esc(x.name) + (ss ? ': ' + fmt(ss.T - 273.15, 1) + ' °C, ' + fmt(ss.F * 3.6, 3) + ' kmol/h' : '') + '</title><path class="str" d="M' + p.x + ' ' + p.y + ' L' + e.x + ' ' + e.y + '" marker-end="url(#arr)"/>' +
        '<text class="energy-lbl" style="fill:var(--stream)" x="' + (e.x + (p.dir[0] >= 0 ? 4 : -4)) + '" y="' + (e.y + 4) + '" text-anchor="' + (p.dir[0] >= 0 ? 'start' : 'end') + '">' + esc(x.name) + '</text></g>';
    });
    // energia
    if (res && res.blocks) st.blocks.forEach(b => energyMarks(b, res.blocks[b.id]).forEach(m => {
      if (m.Q == null || !isFinite(m.Q)) return;
      const into = m.Q > 0, y0 = m.up ? m.y - 30 : m.y + 30, y1 = m.y;
      const d = into ? 'M' + m.x + ' ' + y0 + ' L' + m.x + ' ' + y1 : 'M' + m.x + ' ' + y1 + ' L' + m.x + ' ' + y0;
      h += '<path class="energy" d="' + d + '" marker-end="url(#arrE)"/><text class="energy-lbl" x="' + (m.x + 6) + '" y="' + ((y0 + y1) / 2 + 4) + '">' + m.label + ' = ' + fmt(m.Q / 1000, 1) + ' kW</text>';
    }));
    // blocos
    const bad = res && res.errors ? new Set(res.errors.map(e => e.block)) : new Set();
    st.blocks.forEach(b => {
      const g = IC.G[b.type]; if (!g) return;
      const sel = this.sel && this.sel.kind === 'block' && this.sel.id === b.id;
      h += '<g class="blk' + (sel ? ' sel' : '') + (bad.has(b.id) ? ' bad' : '') + '" data-block="' + esc(b.id) + '" transform="translate(' + b.x + ',' + b.y + ')">';
      h += '<rect class="halo" x="-6" y="-6" width="' + (g.w + 12) + '" height="' + (g.h + 12) + '" rx="8" fill="transparent" stroke="none"/>';
      h += IC.draw(b.type, g.w, g.h);
      h += '<text class="lbl" x="' + (isCol(b.type) ? 50 : nameX(b)) + '" y="' + (g.h + 16) + '"' + (isCol(b.type) ? ' style="text-anchor:end"' : '') + '>' + esc(b.name || b.id) + '</text>';
      const used = new Set(st.streams.filter(s => s.from === b.id).map(s => s.fromPort).concat(st.streams.filter(s => s.to === b.id).map(s => s.toPort)));
      Object.keys(g.ports).forEach(pn => {
        const p = g.ports[pn], armed = this.arm && this.arm.block === b.id && this.arm.port === pn;
        h += '<circle class="port ' + p.io + (used.has(pn) ? '' : ' free') + (armed ? ' arm' : '') + '" data-port="' + pn + '" data-io="' + p.io + '" cx="' + p.x + '" cy="' + p.y + '" r="5"><title>' + esc(SF.flowsheet.portLabel(pn)) + '</title></circle>';
      });
      h += '</g>';
    });
    if (this.arm && this.arm.cur) { const a = portPos(bmap[this.arm.block], this.arm.port); if (a) h += '<path class="rubber" d="M' + a.x + ' ' + a.y + ' L' + this.arm.cur.x + ' ' + this.arm.cur.y + '"/>'; }
    h += '</g>';
    this.svg.innerHTML = h;
  };
  PFD.prototype.fit = function () {
    const st = this.o.getState(); if (!st.blocks.length) { this.tx = 20; this.ty = 20; this.s = 1; this.render(); return; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.blocks.forEach(b => { const g = IC.G[b.type]; x0 = Math.min(x0, b.x - 30); y0 = Math.min(y0, b.y - 50); x1 = Math.max(x1, b.x + g.w + 110); y1 = Math.max(y1, b.y + g.h + 70); });
    const r = this.svg.getBoundingClientRect(), W = r.width || 800, H = r.height || 500;
    this.s = Math.max(0.3, Math.min(1.4, Math.min(W / (x1 - x0), H / (y1 - y0))));
    this.tx = (W - (x1 - x0) * this.s) / 2 - x0 * this.s; this.ty = (H - (y1 - y0) * this.s) / 2 - y0 * this.s;
    this.render();
  };
  PFD.prototype.zoom = function (f, cx, cy) {
    const r = this.svg.getBoundingClientRect(); cx = cx == null ? r.width / 2 : cx; cy = cy == null ? r.height / 2 : cy;
    const ns = Math.max(0.25, Math.min(3, this.s * f)); this.tx = cx - (cx - this.tx) * ns / this.s; this.ty = cy - (cy - this.ty) * ns / this.s; this.s = ns; this.render();
  };
  PFD.prototype.select = function (sel) { this.sel = sel; this.render(); if (this.o.onSelect) this.o.onSelect(sel); };
  PFD.prototype._bind = function () {
    const svg = this.svg, self = this;
    let pan = null, moved = false;
    svg.addEventListener('pointerdown', e => {
      const port = e.target.closest('[data-port]'), blk = e.target.closest('[data-block]'), str = e.target.closest('[data-stream]');
      moved = false;
      if (port && blk) {
        e.stopPropagation();
        const bid = blk.getAttribute('data-block'), pn = port.getAttribute('data-port'), io = port.getAttribute('data-io');
        if (self.arm) { self._finishArm(bid, pn, io); return; }
        self.arm = { block: bid, port: pn, io, cur: self.toWorld(e) }; self.render(); return;
      }
      if (blk) {
        const id = blk.getAttribute('data-block'), b = self.o.getState().blocks.find(x => x.id === id), w = self.toWorld(e);
        if (self.arm) { self.arm = null; }
        self.drag = { id, dx: w.x - b.x, dy: w.y - b.y, started: false };
        svg.setPointerCapture(e.pointerId);
        if (!(self.sel && self.sel.id === id)) self.select({ kind: 'block', id });
        return;
      }
      if (str) { self.arm = null; self.select({ kind: 'stream', id: str.getAttribute('data-stream') }); return; }
      if (self.arm) { self.arm = null; self.render(); return; }
      pan = { x: e.clientX, y: e.clientY, tx: self.tx, ty: self.ty }; svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (self.drag) {
        const w = self.toWorld(e), b = self.o.getState().blocks.find(x => x.id === self.drag.id); if (!b) return;
        if (!self.drag.started) { self.drag.started = true; if (self.o.onBeforeMove) self.o.onBeforeMove(); }
        b.x = Math.round((w.x - self.drag.dx) / 10) * 10; b.y = Math.round((w.y - self.drag.dy) / 10) * 10; moved = true; self.render(); return;
      }
      if (pan) { self.tx = pan.tx + e.clientX - pan.x; self.ty = pan.ty + e.clientY - pan.y; if (Math.abs(e.clientX - pan.x) + Math.abs(e.clientY - pan.y) > 3) moved = true; self.render(); return; }
      if (self.arm) { self.arm.cur = self.toWorld(e); self.render(); }
    });
    svg.addEventListener('pointerup', e => {
      if (self.drag) { const was = self.drag.started; self.drag = null; if (was && self.o.onChange) self.o.onChange('move'); return; }
      if (pan) { pan = null; if (!moved) self.select(null); return; }
      if (self.arm) { // soltar sobre uma porta conclui a ligação (arrastar)
        const el = document.elementFromPoint(e.clientX, e.clientY), port = el && el.closest && el.closest('[data-port]'), blk = el && el.closest && el.closest('[data-block]');
        if (port && blk && !(blk.getAttribute('data-block') === self.arm.block && port.getAttribute('data-port') === self.arm.port)) self._finishArm(blk.getAttribute('data-block'), port.getAttribute('data-port'), port.getAttribute('data-io'));
      }
    });
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); self.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    svg.addEventListener('dblclick', e => { const blk = e.target.closest('[data-block]'); if (blk && self.o.onOpen) self.o.onOpen(blk.getAttribute('data-block')); });
    svg.addEventListener('dragover', e => e.preventDefault());
    svg.addEventListener('drop', e => { e.preventDefault(); const t = e.dataTransfer.getData('text/plain'); if (t && self.o.onDropType) { const w = self.toWorld(e); self.o.onDropType(t, w.x, w.y); } });
  };
  PFD.prototype._finishArm = function (bid, pn, io) {
    const a = this.arm; this.arm = null;
    if (!a || a.block === bid || a.io === io) { this.render(); return; }
    const from = a.io === 'out' ? a : { block: bid, port: pn }, to = a.io === 'out' ? { block: bid, port: pn } : a;
    if (this.o.onConnect) this.o.onConnect(from.block, from.port, to.block, to.port);
    this.render();
  };

  /* SVG autônomo para o fluxograma final (PFD + tabela de correntes + energia) */
  function exportSVG(st, res, opts) {
    opts = opts || {};
    const C = { stream: '#2563c9', energy: '#b98500', fill: '#fbe4dc', line: '#cf6f55', fill2: '#e6f0fb', ink: '#15232a', muted: '#5a6a72', grid: '#d2dbdf' };
    const bmap = {}; st.blocks.forEach(b => { bmap[b.id] = b; });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.blocks.forEach(b => { const g = IC.G[b.type]; x0 = Math.min(x0, b.x - 60); y0 = Math.min(y0, b.y - 60); x1 = Math.max(x1, b.x + g.w + 160); y1 = Math.max(y1, b.y + g.h + 80); });
    st.streams.forEach(s => { const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return; route(portPos(a, s.fromPort), portPos(b, s.toPort), st.blocks, portOffset(st, s)).forEach(p => { y1 = Math.max(y1, p[1] + 30); }); });
    const W0 = x1 - x0, titleH = 56;
    let body = '';
    st.streams.forEach(s => {
      const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return;
      const pts = route(portPos(a, s.fromPort), portPos(b, s.toPort), st.blocks, portOffset(st, s)), m = longestSeg(pts), w = Math.max(24, String(s.name).length * 8 + 12);
      body += '<path d="' + pathD(pts) + '" fill="none" stroke="' + C.stream + '" stroke-width="2" marker-end="url(#xa)"/>';
      body += '<rect x="' + (m.x - w / 2) + '" y="' + (m.y - 10) + '" width="' + w + '" height="20" rx="10" fill="#fff" stroke="' + C.stream + '"/><text x="' + m.x + '" y="' + (m.y + 5) + '" font-size="13" font-weight="700" fill="' + C.stream + '" text-anchor="middle">' + esc(s.name) + '</text>';
    });
    if (res && res.extraStreams) res.extraStreams.forEach(x => { const b = bmap[x.from]; if (!b) return; const p = portPos(b, x.fromPort); const e = { x: p.x + p.dir[0] * 50, y: p.y + p.dir[1] * 50 };
      body += '<path d="M' + p.x + ' ' + p.y + 'L' + e.x + ' ' + e.y + '" stroke="' + C.stream + '" stroke-width="2" marker-end="url(#xa)"/><text x="' + (e.x + 5) + '" y="' + (e.y + 5) + '" font-size="13" font-weight="700" fill="' + C.stream + '">' + esc(x.name) + '</text>'; });
    if (res && res.blocks) st.blocks.forEach(b => energyMarks(b, res.blocks[b.id]).forEach(m => {
      if (m.Q == null || !isFinite(m.Q)) return; const into = m.Q > 0, ya = m.up ? m.y - 32 : m.y + 32;
      body += '<path d="' + (into ? 'M' + m.x + ' ' + ya + 'L' + m.x + ' ' + m.y : 'M' + m.x + ' ' + m.y + 'L' + m.x + ' ' + ya) + '" stroke="' + C.energy + '" stroke-width="2.2" marker-end="url(#xe)"/><text x="' + (m.x + 7) + '" y="' + ((ya + m.y) / 2 + 5) + '" font-size="12.5" font-weight="700" fill="' + C.energy + '">' + m.label + ' = ' + fmt(m.Q / 1000, 1) + ' kW</text>';
    }));
    st.blocks.forEach(b => {
      const g = IC.G[b.type];
      body += '<g transform="translate(' + b.x + ',' + b.y + ')">' + IC.drawInline(b.type)
        + '<text x="' + (isCol(b.type) ? 50 : nameX(b)) + '" y="' + (g.h + 18) + '" font-size="14" font-weight="700" fill="' + C.ink + '" text-anchor="' + (isCol(b.type) ? 'end' : 'middle') + '">' + esc(b.name || b.id) + '</text></g>';
    });
    // tabela de correntes
    let table = '', tH = 0;
    if (res && res.streams) {
      const th = res.th, list = st.streams.map(s => ({ name: s.name, s: res.streams[s.id] })).concat((res.extraStreams || []).map(x => ({ name: x.name, s: res.streams[x.id] }))).filter(r => r.s);
      const rows = [['Temperatura (°C)', r => fmt(r.T - 273.15, 2)], ['Pressão (bar)', r => fmt(r.P / 1e5, 3)], ['Fração vaporizada', r => fmt(r.beta, 3)], ['Vazão molar (kmol/h)', r => fmt(r.F * 3.6, 3)], ['Vazão mássica (kg/h)', r => fmt(r.mass * 3600, 1)]]
        .concat(th.ids.map((id, i) => ['x ' + th.c[i].name, r => fmt(r.z[i], 4)]));
      const per = Math.max(3, Math.floor((Math.max(W0, 900) - 230) / 112)), colW = 112, labW = 230, rowH = 20;
      for (let g0 = 0; g0 < list.length; g0 += per) {
        const grp = list.slice(g0, g0 + per), top = tH;
        table += '<rect x="0" y="' + top + '" width="' + (labW + grp.length * colW) + '" height="' + rowH + '" fill="#e8eef0"/>';
        table += '<text x="8" y="' + (top + 14) + '" font-size="12.5" font-weight="700" fill="' + C.ink + '">Corrente</text>';
        grp.forEach((r, k) => { table += '<text x="' + (labW + k * colW + colW - 8) + '" y="' + (top + 14) + '" font-size="12.5" font-weight="700" fill="' + C.stream + '" text-anchor="end">' + esc(r.name) + '</text>'; });
        rows.forEach((row, ri) => {
          const y = top + rowH * (ri + 1);
          if (ri % 2) table += '<rect x="0" y="' + y + '" width="' + (labW + grp.length * colW) + '" height="' + rowH + '" fill="#f5f8f9"/>';
          table += '<text x="8" y="' + (y + 14) + '" font-size="12" fill="' + C.ink + '">' + esc(row[0]) + '</text>';
          grp.forEach((r, k) => { table += '<text x="' + (labW + k * colW + colW - 8) + '" y="' + (y + 14) + '" font-size="12" font-family="Consolas, monospace" fill="' + C.ink + '" text-anchor="end">' + row[1](r.s) + '</text>'; });
        });
        tH += rowH * (rows.length + 1) + 16;
      }
    }
    const W = Math.max(W0, 900), H = titleH + (y1 - y0) + tH + 44;
    const date = new Date().toLocaleString('pt-BR');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Arial, Helvetica, sans-serif">' +
      '<defs><marker id="xa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + C.stream + '"/></marker><marker id="xe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + C.energy + '"/></marker></defs>' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' +
      '<text x="16" y="28" font-size="20" font-weight="700" fill="' + C.ink + '">' + esc(opts.title || 'Fluxograma do processo') + '</text>' +
      '<text x="16" y="47" font-size="12.5" fill="' + C.muted + '">SIMULA FÁCIL IA · modelo ' + esc(opts.model || '') + ' · ' + esc(date) + '</text>' +
      '<text x="16" y="' + (H - 10) + '" font-size="11.5" fill="' + C.muted + '">' + esc((SF.CREDITS && SF.CREDITS.short) || '') + '</text>' +
      '<g transform="translate(' + (-x0) + ',' + (titleH - y0) + ')">' + body + '</g>' +
      '<g transform="translate(16,' + (titleH + (y1 - y0) + 10) + ')">' + table + '</g></svg>';
  }

  SF.PFD = PFD; SF.pfd = { autoLayout, exportSVG, portPos, route, portOffset, nameX };
})(typeof window !== 'undefined' ? window : globalThis);
