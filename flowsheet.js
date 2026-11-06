/* SIMULA FÁCIL IA — Solver sequencial-modular do fluxograma (ordem automática, correntes de corte e Wegstein) */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const U = SF.units, N = SF.num;
  const OPTIONAL_IN = { mixer: ['in2', 'in3', 'in4'], column: ['feed2', 'feed3'] };

  function solve(fs, opts) {
    opts = opts || {};
    const log = [];
    const t0 = Date.now();
    if (!fs.components || fs.components.length < 1) throw new Error('Selecione os componentes do processo');
    const th = new SF.thermo.Thermo(fs.components, fs.model || 'NRTL', { binary: fs.binary, kij: fs.kij });
    const blocks = {}; (fs.blocks || []).forEach(b => { blocks[b.id] = b; });
    const conns = (fs.streams || []).filter(s => blocks[s.from] && blocks[s.to]);
    // portas de entrada/saída
    const inOf = {}, outOf = {};
    Object.keys(blocks).forEach(id => { inOf[id] = {}; outOf[id] = {}; });
    conns.forEach(c => { inOf[c.to][c.toPort] = c; outOf[c.from][c.fromPort] = c; });
    // verificações
    const errors = [];
    Object.values(blocks).forEach(b => {
      const T = U.TYPES[b.type]; if (!T) { errors.push({ block: b.id, msg: 'Tipo desconhecido: ' + b.type }); return; }
      T.ins.forEach(port => { if (!inOf[b.id][port] && (OPTIONAL_IN[b.type] || []).indexOf(port) < 0 && !(b.type === 'mixer') && !(b.type === 'column' && port !== 'feed')) errors.push({ block: b.id, msg: (b.name || b.id) + ': entrada "' + port + '" não conectada' }); });
      if (b.type === 'mixer' && !Object.keys(inOf[b.id]).length) errors.push({ block: b.id, msg: (b.name || b.id) + ': misturador sem entradas' });
    });
    if (errors.length) return { ok: false, errors, th, streams: {}, blocks: {}, log };
    // ordem de cálculo com seleção de correntes de corte
    const known = {}, order = [], tears = [];
    const remaining = new Set(Object.keys(blocks));
    while (remaining.size) {
      let pick = null;
      for (const id of remaining) { const ok = Object.values(inOf[id]).every(c => known[c.id]); if (ok) { pick = id; break; } }
      if (!pick) {
        let best = null, bestScore = -1;
        for (const id of remaining) {
          const ins = Object.values(inOf[id]); const kn = ins.filter(c => known[c.id]).length;
          const score = kn * 10 + (blocks[id].type === 'mixer' ? 5 : 0) - ins.length;
          if (score > bestScore) { bestScore = score; best = id; }
        }
        Object.values(inOf[best]).forEach(c => { if (!known[c.id]) { tears.push(c.id); known[c.id] = true; } });
        pick = best;
      }
      order.push(pick); remaining.delete(pick);
      Object.values(outOf[pick]).forEach(c => { known[c.id] = true; });
    }
    // estado das correntes
    const S = {}; const tearGuess = {};
    tears.forEach(id => { tearGuess[id] = { flows: new Array(th.n).fill(0), T: 298.15, P: 101325 }; });
    const blockRes = {};
    const maxIt = opts.maxIter || 80; let it = 0, converged = tears.length === 0, tearErr = 0;
    let prevX = null, prevG = null;
    const vec = st => st.flows.concat([st.T / 100]);
    for (it = 0; it < (tears.length ? maxIt : 1); it++) {
      tears.forEach(id => { const g = tearGuess[id]; S[id] = U.mkStream(th, g.flows, g.T, g.P); });
      for (const id of order) {
        const b = blocks[id], ins = {};
        Object.keys(inOf[id]).forEach(port => { ins[port] = S[inOf[id][port].id]; });
        let r;
        try { r = U.IMPL[b.type](th, b, ins, { fs }); }
        catch (e) { return { ok: false, errors: [{ block: id, msg: (b.name || id) + ': ' + e.message }], th, streams: S, blocks: blockRes, log, order }; }
        blockRes[id] = r;
        Object.keys(r.out || {}).forEach(port => {
          const c = outOf[id][port];
          if (c) { if (tears.indexOf(c.id) < 0) S[c.id] = r.out[port]; else r._tearOut = Object.assign(r._tearOut || {}, { [c.id]: r.out[port] }); }
        });
      }
      if (!tears.length) break;
      // convergência das correntes de corte
      const X = [], G = [];
      tears.forEach(id => { const g = tearGuess[id]; X.push.apply(X, g.flows.concat([g.T / 100])); const src = conns.find(c => c.id === id); const calc = blockRes[src.from]._tearOut[id]; G.push.apply(G, vec(calc)); });
      const scale = Math.max(1e-9, N.sum(X.map(Math.abs)) / X.length);
      tearErr = Math.max.apply(null, X.map((x, k) => Math.abs(G[k] - x) / Math.max(Math.abs(x), scale)));
      log.push({ it: it + 1, err: tearErr });
      if (tearErr < (opts.tol || 1e-6)) { converged = true; tears.forEach(id => { const src = conns.find(c => c.id === id); S[id] = blockRes[src.from]._tearOut[id]; }); break; }
      let Xn;
      if (prevX && it >= 2) {
        Xn = X.map((x, k) => {
          const dx = x - prevX[k]; if (Math.abs(dx) < 1e-14) return G[k];
          const s = (G[k] - prevG[k]) / dx; let q = s / (s - 1); if (!isFinite(q)) q = 0; q = Math.max(-5, Math.min(0, q));
          return q * x + (1 - q) * G[k];
        });
      } else Xn = G.slice();
      prevX = X; prevG = G;
      let k = 0;
      tears.forEach(id => { const g = tearGuess[id]; for (let i = 0; i < th.n; i++) g.flows[i] = Math.max(0, Xn[k++]); g.T = Xn[k++] * 100; const src = conns.find(c => c.id === id); g.P = blockRes[src.from]._tearOut[id].P; });
    }
    // correntes de saída não conectadas
    const extra = [];
    Object.keys(blocks).forEach(id => {
      const b = blocks[id], r = blockRes[id]; if (!r || !r.out) return;
      Object.keys(r.out).forEach(port => {
        if (!outOf[id][port] && r.out[port] && r.out[port].F > 1e-12) {
          const sid = id + '.' + port; S[sid] = r.out[port];
          extra.push({ id: sid, name: (b.name || id) + '-' + portLabel(port), from: id, fromPort: port, to: null, toPort: null, implicit: true });
        }
      });
    });
    const warnings = th.warnings.slice();
    Object.keys(blockRes).forEach(id => (blockRes[id].warn || []).forEach(w => warnings.push((blocks[id].name || id) + ': ' + w)));
    if (tears.length && !converged) warnings.push('Reciclo não convergiu em ' + maxIt + ' iterações (erro ' + tearErr.toExponential(2) + ').');
    // balanço global de massa
    let mIn = 0, mOut = 0;
    Object.values(blocks).forEach(b => { if (b.type === 'feed' && blockRes[b.id]) mIn += blockRes[b.id].out.out.mass; });
    conns.concat(extra).forEach(c => { const to = c.to ? blocks[c.to] : null; if ((!to || to.type === 'product') && S[c.id]) mOut += S[c.id].mass; });
    return { ok: true, th, streams: S, blocks: blockRes, order, tears, iterations: it + 1, converged, warnings, log, extraStreams: extra, conns, massIn: mIn, massOut: mOut, ms: Date.now() - t0 };
  }

  const PORT_LABELS = { out: 'saída', in: 'entrada', vapor: 'vapor', liquid: 'líquido', light: 'fase leve', heavy: 'fase pesada', distillate: 'destilado', bottoms: 'fundo', side: 'lateral',
    gas_out: 'gás tratado', liq_out: 'líquido rico', extract: 'extrato', raffinate: 'rafinado', overflow: 'extrato', underflow: 'torta', hot_out: 'saída quente', cold_out: 'saída fria',
    out1: 'saída 1', out2: 'saída 2', out3: 'saída 3', hot_in: 'entrada quente', cold_in: 'entrada fria', feed: 'alimentação', feed2: 'alimentação 2', feed3: 'alimentação 3', solvent: 'solvente', solids: 'sólidos', gas_in: 'gás', liq_in: 'líquido', in1: 'entrada 1', in2: 'entrada 2', in3: 'entrada 3', in4: 'entrada 4' };
  function portLabel(p) { return PORT_LABELS[p] || p; }

  SF.flowsheet = { solve, portLabel, PORT_LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
