/* SIMULA FÁCIL IA — biblioteca de ícones de processo (padrão análogo a Aspen Plus, HYSYS e DWSIM)
   Cada ícone é uma lista de primitivas geométricas; o mesmo desenho é usado no editor (SVG),
   no fluxograma final exportado e nos programas MATLAB/Octave e Python gerados. */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const dirv = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };
  const P = (x, y, d, io) => ({ x, y, dir: dirv[d], io });

  /* geometria (caixa do ícone e portas) */
  const G = {
    feed: { w: 54, h: 30, ports: { out: P(54, 15, 'r', 'out') } },
    product: { w: 54, h: 30, ports: { in: P(0, 15, 'l', 'in') } },
    mixer: { w: 56, h: 64, ports: { in1: P(0, 10, 'l', 'in'), in2: P(0, 25, 'l', 'in'), in3: P(0, 40, 'l', 'in'), in4: P(0, 54, 'l', 'in'), out: P(56, 32, 'r', 'out') } },
    splitter: { w: 56, h: 64, ports: { in: P(0, 32, 'l', 'in'), out1: P(56, 10, 'r', 'out'), out2: P(56, 32, 'r', 'out'), out3: P(56, 54, 'r', 'out') } },
    separator: { w: 60, h: 64, ports: { in: P(0, 32, 'l', 'in'), out1: P(60, 14, 'r', 'out'), out2: P(60, 50, 'r', 'out') } },
    heater: { w: 56, h: 56, ports: { in: P(0, 28, 'l', 'in'), out: P(56, 28, 'r', 'out') } },
    cooler: { w: 56, h: 56, ports: { in: P(0, 28, 'l', 'in'), out: P(56, 28, 'r', 'out') } },
    hx_shell: { w: 120, h: 56, ports: { hot_in: P(30, 0, 'u', 'in'), hot_out: P(92, 56, 'd', 'out'), cold_in: P(0, 28, 'l', 'in'), cold_out: P(120, 28, 'r', 'out') } },
    hx_plate: { w: 64, h: 90, ports: { hot_in: P(0, 14, 'l', 'in'), hot_out: P(64, 76, 'r', 'out'), cold_in: P(0, 76, 'l', 'in'), cold_out: P(64, 14, 'r', 'out') } },
    pump: { w: 56, h: 52, ports: { in: P(0, 30, 'l', 'in'), out: P(56, 12, 'r', 'out') } },
    compressor: { w: 60, h: 56, ports: { in: P(0, 28, 'l', 'in'), out: P(60, 28, 'r', 'out') } },
    valve: { w: 50, h: 34, ports: { in: P(0, 20, 'l', 'in'), out: P(50, 20, 'r', 'out') } },
    flash: { w: 54, h: 100, ports: { in: P(0, 52, 'l', 'in'), vapor: P(54, 10, 'r', 'out'), liquid: P(54, 90, 'r', 'out') } },
    decanter: { w: 110, h: 60, ports: { in: P(0, 22, 'l', 'in'), light: P(110, 16, 'r', 'out'), heavy: P(110, 54, 'r', 'out') } },
    column_short: { w: 112, h: 210, ports: { feed: P(0, 105, 'l', 'in'), distillate: P(112, 46, 'r', 'out'), bottoms: P(112, 188, 'r', 'out') } },
    column: { w: 112, h: 230, ports: { feed2: P(0, 55, 'l', 'in'), feed: P(0, 115, 'l', 'in'), feed3: P(0, 170, 'l', 'in'), distillate: P(112, 46, 'r', 'out'), side: P(112, 130, 'r', 'out'), bottoms: P(112, 208, 'r', 'out') } },
    absorber: { w: 54, h: 180, ports: { liq_in: P(0, 22, 'l', 'in'), gas_in: P(0, 158, 'l', 'in'), gas_out: P(54, 22, 'r', 'out'), liq_out: P(54, 158, 'r', 'out') } },
    extractor: { w: 54, h: 180, ports: { feed: P(0, 22, 'l', 'in'), solvent: P(0, 158, 'l', 'in'), extract: P(54, 22, 'r', 'out'), raffinate: P(54, 158, 'r', 'out') } },
    leaching: { w: 130, h: 70, ports: { solvent: P(0, 18, 'l', 'in'), solids: P(0, 52, 'l', 'in'), overflow: P(130, 18, 'r', 'out'), underflow: P(130, 52, 'r', 'out') } },
    cstr: { w: 70, h: 84, ports: { in: P(0, 24, 'l', 'in'), out: P(70, 72, 'r', 'out') } },
    pfr: { w: 130, h: 40, ports: { in: P(0, 20, 'l', 'in'), out: P(130, 20, 'r', 'out') } },
    rconv: { w: 64, h: 80, ports: { in: P(0, 22, 'l', 'in'), out: P(64, 64, 'r', 'out') } }
  };

  /* primitivas: rect (x,y,w,h,r), circ (cx,cy,r), line (polilinha aberta), poly (polígono fechado), text.
     classes de estilo: body (equipamento), bodyb (corrente), bodyw (produto), ln (linha), lnd (linha tracejada), hot, cold, lbl, lblb */
  const R = (x, y, w, h, r, c) => ({ t: 'rect', x, y, w, h, r: r || 0, c: c || 'body' });
  const C = (cx, cy, r, c) => ({ t: 'circ', cx, cy, r, c: c || 'body' });
  const L = (pts, c) => ({ t: 'line', pts, c: c || 'ln' });
  const Pg = (pts, c) => ({ t: 'poly', pts, c: c || 'body' });
  const T = (x, y, s, c) => ({ t: 'text', x, y, s, c: c || 'lbl' });
  const zig = (x, y, w, c) => { const pts = [[x, y]], n = 6, dx = w / n; for (let k = 1; k <= n; k++) pts.push([x + k * dx, k === n ? y : y + (k % 2 ? -7 : 7)]); return L(pts, c); };

  function column(h, label) {
    const out = [R(4, 6, 46, h - 12, 12)];
    for (let y = 30; y < h - 30; y += 14) out.push(L([[9, y], [45, y]]));
    out.push(
      L([[36, 6], [36, 2], [82, 2], [82, 10]]),            // vapor de topo → condensador
      C(82, 21, 11), L([[73, 21], [91, 21]], 'cold'),     // condensador
      L([[82, 32], [82, 38]]),                             // condensado → vaso de refluxo
      R(62, 38, 40, 16, 8),                                // vaso de refluxo
      L([[102, 46], [112, 46]]),                           // destilado
      L([[70, 54], [70, 62], [50, 62]]),                   // refluxo
      L([[38, h - 6], [38, h - 1], [82, h - 1], [82, h - 11]]), // líquido de fundo → refervedor
      C(82, h - 22, 11), L([[73, h - 22], [91, h - 22]], 'hot'),  // refervedor
      L([[82, h - 33], [82, h - 42], [50, h - 42]]),       // vapor de retorno
      L([[93, h - 22], [112, h - 22]]));                   // produto de fundo
    if (label) out.push(T(27, h / 2 + 4, label));
    return out;
  }

  const PRIMS = {
    feed: () => [Pg([[2, 6], [36, 6], [50, 15], [36, 24], [2, 24]], 'bodyb'), T(22, 19, 'F', 'lblb')],
    product: () => [Pg([[4, 6], [38, 6], [52, 15], [38, 24], [4, 24]], 'bodyw'), T(24, 19, 'P', 'lblb')],
    mixer: () => [Pg([[4, 4], [52, 26], [52, 38], [4, 60]])],
    splitter: () => [Pg([[52, 4], [4, 26], [4, 38], [52, 60]])],
    separator: () => [R(4, 4, 52, 56, 4), L([[14, 32], [26, 32], [36, 18], [46, 18]]), L([[26, 32], [36, 46], [46, 46]])],
    heater: () => [C(28, 28, 24), zig(8, 28, 40, 'hot')],
    cooler: () => [C(28, 28, 24), zig(8, 28, 40, 'cold')],
    hx_shell: () => [R(10, 10, 100, 36, 18), L([[24, 10], [24, 46]]), L([[24, 20], [100, 20]]), L([[24, 28], [100, 28]]), L([[24, 36], [100, 36]]),
      L([[30, 0], [30, 10]]), L([[92, 46], [92, 56]]), L([[0, 28], [10, 28]]), L([[110, 28], [120, 28]])],
    hx_plate: () => [R(6, 4, 52, 82, 4), L([[16, 8], [16, 82]]), L([[24, 8], [24, 82]]), L([[32, 8], [32, 82]]), L([[40, 8], [40, 82]]), L([[48, 8], [48, 82]]),
      L([[0, 14], [6, 14]], 'hot'), L([[58, 76], [64, 76]], 'hot'), L([[0, 76], [6, 76]], 'cold'), L([[58, 14], [64, 14]], 'cold')],
    pump: () => [Pg([[12, 44], [40, 44], [46, 51], [6, 51]]), R(26, 8, 30, 9, 0), C(26, 28, 18), Pg([[17, 28], [33, 20], [33, 36]], 'ln')],
    compressor: () => [Pg([[6, 8], [54, 18], [54, 38], [6, 48]]), C(30, 28, 5, 'ln')],
    valve: () => [Pg([[4, 9], [25, 20], [4, 31]]), Pg([[46, 9], [25, 20], [46, 31]]), L([[25, 20], [25, 6]]), R(17, 1, 16, 5, 1)],
    flash: () => [R(6, 4, 42, 92, 21), L([[12, 18], [42, 18]], 'lnd'), L([[10, 62], [44, 62]], 'lnd')],
    decanter: () => [R(6, 6, 98, 40, 20), R(72, 44, 22, 12, 4), L([[14, 28], [96, 28]], 'lnd'), L([[60, 6], [60, 28]])],
    column_short: () => column(210, 'FUG'),
    column: () => column(230, ''),
    absorber: () => {
      const o = [R(4, 4, 46, 172, 12), L([[8, 34], [46, 34]]), L([[8, 146], [46, 146]])];
      for (let y = 40; y < 140; y += 20) { o.push(L([[8, y], [46, y + 20]])); o.push(L([[46, y], [8, y + 20]])); }
      return o;
    },
    extractor: () => [R(4, 4, 46, 172, 12), L([[27, 14], [27, 154]]), L([[15, 46], [39, 46]]), L([[15, 72], [39, 72]]), L([[15, 98], [39, 98]]), L([[15, 124], [39, 124]]), R(21, 4, 12, 8, 2, 'ln')],
    leaching: () => [R(4, 26, 34, 36, 3), R(48, 26, 34, 36, 3), R(92, 26, 34, 36, 3), L([[38, 34], [48, 34]]), L([[82, 34], [92, 34]]),
      L([[10, 50], [34, 56]]), L([[54, 50], [78, 56]]), L([[98, 50], [122, 56]]), L([[21, 26], [21, 12]]), L([[65, 26], [65, 12]]), L([[109, 26], [109, 12]])],
    cstr: () => [R(3, 14, 64, 66, 13, 'lnd'), R(7, 12, 56, 66, 11), R(29, 0, 12, 7, 1), L([[35, 7], [35, 60]]), L([[23, 60], [47, 60]]), L([[23, 54], [35, 60], [47, 54]]),
      L([[3, 70], [0, 70]], 'hot'), L([[67, 22], [70, 22]], 'hot')],
    pfr: () => { const o = [R(4, 6, 122, 28, 8)]; for (let x = 16; x < 120; x += 16) o.push(L([[x, 34], [x + 10, 6]])); return o; },
    rconv: () => [R(6, 6, 52, 68, 11), T(32, 45, 'X%')]
  };
  function prims(t) { return PRIMS[t] ? PRIMS[t]() : [R(0, 0, G[t] ? G[t].w : 60, G[t] ? G[t].h : 60, 6)]; }

  /* estilos para exportação (SVG autônomo, MATLAB e Python) */
  const STYLE = {
    body: { fill: '#ffe6dc', stroke: '#ec6a4c', lw: 1.6 }, bodyb: { fill: '#e6f0fb', stroke: '#1f6feb', lw: 1.4 }, bodyw: { fill: '#ffffff', stroke: '#1f6feb', lw: 1.4 },
    ln: { fill: 'none', stroke: '#ec6a4c', lw: 1.2 }, lnd: { fill: 'none', stroke: '#ec6a4c', lw: 1.2, dash: true },
    hot: { fill: 'none', stroke: '#d24a35', lw: 1.8 }, cold: { fill: 'none', stroke: '#2f74d0', lw: 1.8 },
    lbl: { text: '#ec6a4c' }, lblb: { text: '#1f6feb' }
  };

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ptsStr = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  function toSVG(list, inline) {
    return list.map(p => {
      const st = STYLE[p.c] || STYLE.body;
      const a = inline ? (p.t === 'text' ? ' fill="' + st.text + '" font-size="12" font-weight="700" text-anchor="middle"'
        : ' fill="' + (p.t === 'line' ? 'none' : st.fill) + '" stroke="' + st.stroke + '" stroke-width="' + st.lw + '"' + (st.dash ? ' stroke-dasharray="4 3"' : '')) : ' class="' + p.c + '"';
      if (p.t === 'rect') return '<rect' + a + ' x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" rx="' + p.r + '"/>';
      if (p.t === 'circ') return '<circle' + a + ' cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"/>';
      if (p.t === 'line') return '<path' + a + ' d="' + ptsStr(p.pts) + '"/>';
      if (p.t === 'poly') return '<path' + a + ' d="' + ptsStr(p.pts) + 'Z"/>';
      return '<text' + a + ' x="' + p.x + '" y="' + p.y + '">' + esc(p.s) + '</text>';
    }).join('');
  }
  function draw(t) { return toSVG(prims(t), false); }
  function drawInline(t) { return toSVG(prims(t), true); }
  function paletteIcon(t) {
    const g = G[t], pad = 4;
    return '<svg viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (g.w + 2 * pad) + ' ' + (g.h + 2 * pad) + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="blk">' + draw(t) + '</g></svg>';
  }

  SF.icons = { G, prims, STYLE, draw, drawInline, paletteIcon };
})(typeof window !== 'undefined' ? window : globalThis);
