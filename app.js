/* SIMULA FÁCIL IA — aplicação: estado, paleta, propriedades, resultados, termodinâmica, relatórios e arquivos */
(function () {
  'use strict';
  const SF = window.SF, U = SF.units, TH = SF.thermo, IC = SF.icons;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (v, d) => (v == null || (typeof v === 'number' && !isFinite(v)) ? '—' : typeof v !== 'number' ? String(v) : (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : v.toLocaleString('pt-BR', { maximumFractionDigits: d == null ? 3 : d, minimumFractionDigits: 0 })));
  const PREFIX = { feed: 'F', product: 'P', mixer: 'MIX', splitter: 'DIV', separator: 'SEP', heater: 'E', cooler: 'E', hx_shell: 'E', hx_plate: 'E', pump: 'B', compressor: 'K', valve: 'VLV', flash: 'V', decanter: 'V', column_short: 'T', column: 'T', absorber: 'T', extractor: 'X', leaching: 'X', cstr: 'R', pfr: 'R', rconv: 'R' };

  let state = blank(), results = null, undoStack = [], autoTimer = null, chartTarget = null;
  const caps = { downloads: undefined };

  function blank() { return { name: 'Novo processo', components: ['ethanol', 'water'], model: 'NRTL', blocks: [], streams: [], binary: {} }; }
  function pushUndo() { undoStack.push(JSON.stringify(state)); if (undoStack.length > 40) undoStack.shift(); }
  function undo() { if (!undoStack.length) return toast('Nada para desfazer'); state = JSON.parse(undoStack.pop()); results = null; afterChange(true); }

  /* ------------------------------------------------------------------ utilidades de arquivo */
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms || 3200); }
  async function getDownloads() {
    if (caps.downloads !== undefined) return caps.downloads;
    try { caps.downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { caps.downloads = null; }
    return caps.downloads;
  }
  async function saveFile(filename, data) {
    const dl = await getDownloads();
    if (dl) {
      try { await dl.save({ filename, data }); toast('Arquivo salvo: ' + filename); return true; }
      catch (e) { if (e && e.code === 'declined') return false; if (e && e.code === 'rejected_extension') { toast('Formato não permitido aqui: ' + filename); return false; } toast('Não foi possível salvar (' + ((e && e.code) || 'erro') + ')'); return false; }
    }
    try { const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); return true; }
    catch (e) { toast('Download indisponível nesta visualização. Use "Copiar".'); return false; }
  }
  async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copiado para a área de transferência'); } catch (e) { toast('Não foi possível copiar automaticamente'); } }
  function makeZip(files) { // ZIP sem compressão (store) com CRC-32
    const enc = new TextEncoder(), crcT = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
    const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    const parts = [], central = []; let off = 0;
    const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, c = crc(data);
      const local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(local), name, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(c), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += local.length + name.length + data.length;
    });
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(off), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }
  function svgToPng(svg, scale) {
    return new Promise((res, rej) => {
      const img = new Image(); img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(scale, scale); g.drawImage(img, 0, 0);
        c.toBlob(b => (b ? res(b) : rej(new Error('falha ao gerar PNG'))), 'image/png');
      };
      img.onerror = () => rej(new Error('falha ao rasterizar SVG')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  const slug = s => String(s || 'processo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 40) || 'processo';

  /* ------------------------------------------------------------------ editor de fluxograma */
  const pfd = new SF.PFD($('#pfd'), {
    getState: () => state, getResults: () => results,
    onSelect: sel => { renderProps(); if (sel) switchTab('props'); if (sel && sel.kind === 'block' && results && results.blocks && results.blocks[sel.id] && (results.blocks[sel.id].plots || []).length) renderCharts(sel.id); },
    onChange: kind => { if (kind === 'move') { persist(); return; } afterChange(false); }, onBeforeMove: pushUndo,
    onConnect: (a, ap, b, bp) => { pushUndo(); connect(a, ap, b, bp); afterChange(true); },
    onOpen: id => { pfd.select({ kind: 'block', id }); const inp = $('#blkName'); if (inp) inp.focus(); },
    onDropType: (t, x, y) => addBlock(t, x, y)
  });

  function nextBlockId(type) { const p = PREFIX[type] || 'B'; let k = 101; while (state.blocks.some(b => b.id === p + '-' + k)) k++; return p + '-' + k; }
  function nextStreamName() { let k = 1; const names = new Set(state.streams.map(s => String(s.name))); while (names.has(String(k))) k++; return String(k); }
  function defaultParams(type) {
    const T = U.TYPES[type], p = {};
    (T.params || []).forEach(f => { if (f.def !== undefined) p[f.k] = f.def; });
    if (type === 'feed') { p.composition = {}; state.components.forEach((id, i) => { p.composition[id] = i === 0 ? 1 : 0; }); }
    if (type === 'column_short') { const sorted = state.components.filter(id => !TH.COMP[id].nv && !TH.COMP[id].solid).sort((a, b) => TH.COMP[a].tb - TH.COMP[b].tb); p.lk = sorted[0] || ''; p.hk = sorted[1] || ''; }
    if (type === 'separator') { p.splits = {}; state.components.forEach(id => { p.splits[id] = 0.5; }); }
    if (T.params.some(f => f.type === 'reactions')) p.reactions = [];
    return p;
  }
  function addBlock(type, x, y) {
    pushUndo();
    const g = IC.G[type]; const r = $('#pfd').getBoundingClientRect();
    if (x == null) { x = (r.width / 2 - pfd.tx) / pfd.s - g.w / 2 + (state.blocks.length % 5) * 18; y = (r.height / 2 - pfd.ty) / pfd.s - g.h / 2 + (state.blocks.length % 5) * 18; }
    const id = nextBlockId(type);
    state.blocks.push({ id, type, name: id, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, params: defaultParams(type) });
    afterChange(true); pfd.select({ kind: 'block', id });
    return id;
  }
  function connect(from, fromPort, to, toPort, name) {
    state.streams = state.streams.filter(s => !(s.to === to && s.toPort === toPort) && !(s.from === from && s.fromPort === fromPort));
    const nm = name || nextStreamName(); let id = 'S' + nm.replace(/\W/g, ''); while (state.streams.some(s => s.id === id)) id += 'x';
    state.streams.push({ id, name: nm, from, fromPort, to, toPort });
  }
  function deleteSelected() {
    const sel = pfd.sel; if (!sel) return; pushUndo();
    if (sel.kind === 'block') { state.blocks = state.blocks.filter(b => b.id !== sel.id); state.streams = state.streams.filter(s => s.from !== sel.id && s.to !== sel.id); }
    else state.streams = state.streams.filter(s => s.id !== sel.id);
    pfd.sel = null; afterChange(true); renderProps();
  }
  function afterChange(structural) {
    results = null; setStatus('idle', 'Alterado — simule novamente');
    $('#emptyHint').hidden = state.blocks.length > 0; $('#projName').value = state.name;
    pfd.render(); persist(); updateCompSummary();
    if (structural) renderProps();
    if ($('#autoSim') && $('#autoSim').checked && state.blocks.length) { clearTimeout(autoTimer); autoTimer = setTimeout(() => runSimulation(true), 700); }
  }
  function persist() { try { localStorage.setItem('simulafacil.v1', JSON.stringify(state)); } catch (e) { /* armazenamento indisponível */ } }
  function updateCompSummary() { $('#compSummary').textContent = state.components.length + ' componentes · ' + (TH.MODELS[state.model] || state.model); }

  /* ------------------------------------------------------------------ simulação */
  function setStatus(kind, text) { const c = $('#simStatus'); c.className = 'chip ' + kind; c.textContent = text; }
  function runSimulation(quiet) {
    if (!state.blocks.length) { if (!quiet) toast('Monte o fluxograma primeiro'); return null; }
    setStatus('run', 'Simulando…');
    try { results = SF.flowsheet.solve(JSON.parse(JSON.stringify(state))); }
    catch (e) { results = { ok: false, errors: [{ msg: e.message }] }; }
    if (!results.ok) setStatus('err', 'Erro: ' + (results.errors[0] && results.errors[0].msg || '').slice(0, 70));
    else if (!results.converged || results.warnings.length) setStatus('warn', (results.converged ? 'Convergido' : 'Não convergiu') + ' · ' + results.warnings.length + ' aviso(s) · ' + results.ms + ' ms');
    else setStatus('ok', 'Convergido · ' + results.ms + ' ms');
    pfd.render(); renderResults(); renderProps();
    if (results.ok) {
      const sel = pfd.sel && pfd.sel.kind === 'block' && results.blocks[pfd.sel.id] && (results.blocks[pfd.sel.id].plots || []).length ? pfd.sel.id : null;
      renderCharts(sel || chartTarget || 'auto');
    }
    return results;
  }

  /* ------------------------------------------------------------------ paleta */
  function renderPalette() {
    const cats = {}; Object.keys(U.TYPES).forEach(k => { const t = U.TYPES[k]; (cats[t.cat] = cats[t.cat] || []).push(k); });
    const el = $('#palette'); el.innerHTML = '';
    Object.keys(cats).forEach(c => {
      const d = document.createElement('div'); d.className = 'pal-cat'; d.innerHTML = '<h3>' + esc(c) + '</h3><div class="pal-items"></div>';
      cats[c].forEach(k => {
        const b = document.createElement('button'); b.className = 'pal-item'; b.draggable = true; b.title = U.TYPES[k].label + ' (clique ou arraste)';
        b.innerHTML = IC.paletteIcon(k) + '<span>' + esc(U.TYPES[k].label) + '</span>';
        b.onclick = () => addBlock(k); b.ondragstart = e => e.dataTransfer.setData('text/plain', k);
        d.querySelector('.pal-items').appendChild(b);
      });
      el.appendChild(d);
    });
  }

  /* ------------------------------------------------------------------ abas */
  function switchTab(t) { document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'tab-' + t)); if (t === 'thermo') renderThermo(); if (t === 'results') renderResults(); }
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });

  /* ------------------------------------------------------------------ propriedades */
  function compOptions(sel, allowEmpty) { return (allowEmpty ? '<option value="">—</option>' : '') + state.components.map(id => '<option value="' + id + '"' + (id === sel ? ' selected' : '') + '>' + esc(TH.COMP[id].name) + '</option>').join(''); }
  function renderProps() {
    const el = $('#propsBody'), sel = pfd.sel;
    if (!sel) {
      el.innerHTML = '<p class="muted">Selecione um equipamento ou corrente no fluxograma para editar.</p>' +
        '<div class="subhead">Equipamentos (' + state.blocks.length + ')</div>' +
        (state.blocks.length ? '<table class="grid"><tbody>' + state.blocks.map(b => '<tr><td><a href="#" data-sel="' + esc(b.id) + '">' + esc(b.name) + '</a></td><td>' + esc(U.TYPES[b.type].label) + '</td></tr>').join('') + '</tbody></table>' : '<p class="small muted">Nenhum ainda.</p>') +
        '<div class="subhead">Dicas</div><ul class="small"><li>Ligue correntes clicando numa saída (círculo cheio) e depois numa entrada (círculo vazado).</li><li>Saídas sem ligação viram produtos automaticamente.</li><li>Duplo clique no equipamento para renomear.</li></ul>';
      el.querySelectorAll('[data-sel]').forEach(a => { a.onclick = e => { e.preventDefault(); pfd.select({ kind: 'block', id: a.dataset.sel }); }; });
      return;
    }
    if (sel.kind === 'stream') {
      const s = state.streams.find(x => x.id === sel.id); if (!s) { el.innerHTML = ''; return; }
      const r = results && results.streams && results.streams[s.id];
      el.innerHTML = '<div class="blk-head"><input id="strName" value="' + esc(s.name) + '" aria-label="Nome da corrente"></div>' +
        '<p class="small muted">' + esc(blockName(s.from)) + ' (' + esc(SF.flowsheet.portLabel(s.fromPort)) + ') → ' + esc(blockName(s.to)) + ' (' + esc(SF.flowsheet.portLabel(s.toPort)) + ')</p>' +
        (r ? streamDetail(r) : '<p class="muted small">Simule para ver as propriedades.</p>') +
        '<div class="row-actions"><button id="delStr">Excluir corrente</button></div>';
      $('#strName').onchange = e => { pushUndo(); s.name = e.target.value || s.name; afterChange(false); };
      $('#delStr').onclick = deleteSelected; return;
    }
    const b = state.blocks.find(x => x.id === sel.id); if (!b) { el.innerHTML = ''; return; }
    const T = U.TYPES[b.type];
    let h = '<div class="blk-head">' + IC.paletteIcon(b.type) + '<div style="flex:1"><input id="blkName" value="' + esc(b.name) + '" aria-label="Nome do equipamento"><div class="small muted">' + esc(T.label) + ' · ' + esc(b.id) + '</div></div></div>';
    const r = results && results.blocks && results.blocks[b.id];
    if (r) h += '<div class="subhead">Resultados</div>' + resTable(r) + ((r.plots || []).length ? '<div class="row-actions"><button id="showCharts">Ver gráficos (' + r.plots.length + ')</button></div>' : '');
    if (results && results.errors) { const e = results.errors.find(x => x.block === b.id); if (e) h += '<div class="note err">' + esc(e.msg) + '</div>'; }
    h += '<div class="subhead">Especificações</div>';
    T.params.forEach(f => { h += fieldHTML(b, f); });
    h += '<div class="row-actions"><button id="runFromProps" class="primary">Simular</button><button id="delBlk">Excluir equipamento</button></div>';
    el.innerHTML = h;
    $('#blkName').onchange = e => { pushUndo(); b.name = e.target.value || b.name; afterChange(false); };
    $('#delBlk').onclick = deleteSelected; $('#runFromProps').onclick = () => runSimulation();
    if ($('#showCharts')) $('#showCharts').onclick = () => renderCharts(b.id);
    bindFields(b);
  }
  function blockName(id) { const b = state.blocks.find(x => x.id === id); return b ? b.name : id; }
  function fieldHTML(b, f) {
    const v = b.params[f.k];
    if (f.type === 'select') return '<div class="field"><label for="f_' + f.k + '">' + esc(f.label) + '</label><select id="f_' + f.k + '" data-k="' + f.k + '">' + f.options.map(o => '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select></div>';
    if (f.type === 'comp') return '<div class="field"><label for="f_' + f.k + '">' + esc(f.label) + '</label><select id="f_' + f.k + '" data-k="' + f.k + '">' + compOptions(v, true) + '</select></div>';
    if (f.type === 'composition' || f.type === 'compfrac') {
      const obj = v || {}; const tot = state.components.reduce((s, id) => s + (+obj[id] || 0), 0);
      const isConc = f.type === 'composition' && b.params.basis === 'concentração (mol/L)';
      const unitLbl = f.type === 'compfrac' ? 'fração → saída 1' : isConc ? 'mol/L (solvente completa)' : (b.params.basis === 'mássica' ? 'fração mássica' : 'fração molar');
      return '<div class="subhead">' + esc(f.label) + ' <span class="muted">(' + unitLbl + ')</span></div><table class="grid"><tbody>' +
        state.components.map(id => '<tr><td>' + esc(TH.COMP[id].name) + '</td><td><input type="number" step="any" min="0" data-ck="' + f.k + '" data-comp="' + id + '" value="' + (obj[id] != null ? obj[id] : 0) + '" aria-label="' + esc(TH.COMP[id].name) + '"></td></tr>').join('') +
        '</tbody></table>' + (f.type === 'composition' && !isConc ? '<p class="small muted">Soma: <span class="num">' + nf(tot, 4) + '</span> (normalizada automaticamente)</p>' : '');
    }
    if (f.type === 'reactions') return reactionsHTML(b);
    return '<div class="field"><label for="f_' + f.k + '">' + esc(f.label) + (f.u ? '<span class="u">' + esc(f.u) + '</span>' : '') + '</label><input id="f_' + f.k + '" type="number" step="any" data-k="' + f.k + '" value="' + (v == null ? '' : esc(v)) + '"></div>';
  }
  function reactionsHTML(b) {
    const rx = b.params.reactions || []; const conv = b.type === 'rconv';
    let h = '<div class="subhead">Reações (' + rx.length + ')</div>';
    rx.forEach((r, k) => {
      let eq = ''; try { eq = U.compileReactions(new TH.Thermo(state.components, 'IDEAL'), [r])[0].label; } catch (e) { eq = '(defina a estequiometria)'; }
      h += '<div class="rxn"><div style="display:flex;align-items:center;gap:6px"><b>R' + (k + 1) + '</b><span class="eq">' + esc(eq) + '</span><span class="spacer"></span><button class="ghost" data-rxdel="' + k + '" title="Remover reação">✕</button></div>' +
        '<table class="grid"><thead><tr><th>Componente</th><th>ν (estequiometria)</th>' + (conv ? '' : '<th>Ordem</th>') + '</tr></thead><tbody>' +
        state.components.map(id => '<tr><td>' + esc(TH.COMP[id].name) + '</td><td><input type="number" step="any" data-rx="' + k + '" data-rk="stoich" data-comp="' + id + '" value="' + ((r.stoich || {})[id] || 0) + '"></td>' + (conv ? '' : '<td><input type="number" step="any" data-rx="' + k + '" data-rk="orders" data-comp="' + id + '" value="' + ((r.orders || {})[id] != null ? r.orders[id] : ((r.stoich || {})[id] < 0 ? -r.stoich[id] : 0)) + '"></td>') + '</tr>').join('') +
        '</tbody></table><div class="row">' +
        (conv ? '<label>Componente-chave<select data-rx="' + k + '" data-rf="key">' + compOptions(r.key, true) + '</select></label><label>Conversão (0–1)<input type="number" step="any" data-rx="' + k + '" data-rf="conversion" value="' + (r.conversion != null ? r.conversion : 0.9) + '"></label>'
          : '<label>k (em Tref; mol/L, s)<input type="number" step="any" data-rx="' + k + '" data-rf="k" value="' + (r.k != null ? r.k : 0.01) + '"></label><label>Tref (°C)<input type="number" step="any" data-rx="' + k + '" data-rf="Tref" value="' + (r.Tref != null ? r.Tref : 25) + '"></label><label>Ea (kJ/mol)<input type="number" step="any" data-rx="' + k + '" data-rf="Ea" value="' + (r.Ea != null ? r.Ea : 0) + '"></label>') +
        '<label>ΔH reação (kJ/mol)<input type="number" step="any" data-rx="' + k + '" data-rf="dH" value="' + (r.dH != null ? r.dH : 0) + '"></label></div></div>';
    });
    return h + '<div class="row-actions"><button id="rxAdd">+ Adicionar reação</button></div>';
  }
  function bindFields(b) {
    const el = $('#propsBody');
    el.querySelectorAll('[data-k]').forEach(inp => {
      inp.onchange = () => {
        pushUndo(); const k = inp.dataset.k, f = U.TYPES[b.type].params.find(x => x.k === k);
        b.params[k] = (f.type === 'select' || f.type === 'comp') ? inp.value : (inp.value === '' ? '' : +inp.value);
        afterChange(false); if (f.type === 'select') renderProps();
      };
    });
    el.querySelectorAll('[data-ck]').forEach(inp => { inp.onchange = () => { pushUndo(); const k = inp.dataset.ck; b.params[k] = b.params[k] || {}; b.params[k][inp.dataset.comp] = +inp.value || 0; afterChange(false); renderProps(); }; });
    el.querySelectorAll('[data-rx]').forEach(inp => {
      inp.onchange = () => {
        pushUndo(); const r = b.params.reactions[+inp.dataset.rx];
        if (inp.dataset.rk) { r[inp.dataset.rk] = r[inp.dataset.rk] || {}; const v = +inp.value || 0; if (v) r[inp.dataset.rk][inp.dataset.comp] = v; else delete r[inp.dataset.rk][inp.dataset.comp]; }
        else r[inp.dataset.rf] = inp.tagName === 'SELECT' ? inp.value : +inp.value;
        afterChange(false); renderProps();
      };
    });
    el.querySelectorAll('[data-rxdel]').forEach(btn => { btn.onclick = () => { pushUndo(); b.params.reactions.splice(+btn.dataset.rxdel, 1); afterChange(false); renderProps(); }; });
    if ($('#rxAdd')) $('#rxAdd').onclick = () => { pushUndo(); b.params.reactions = b.params.reactions || []; const a = state.components[1] || state.components[0], c = state.components[2] || state.components[0]; b.params.reactions.push({ stoich: { [a]: -1, [c]: 1 }, orders: { [a]: 1 }, k: 0.01, Tref: 25, Ea: 0, dH: 0, key: a, conversion: 0.9 }); afterChange(false); renderProps(); };
  }
  function resTable(r) {
    return '<table class="grid"><tbody>' + (r.res || []).map(x => '<tr><td>' + esc(x.k) + '</td><td class="num">' + esc(nf(x.v, 4)) + ' ' + esc(x.u || '') + '</td></tr>').join('') + '</tbody></table>' +
      (r.warn || []).map(w => '<div class="note warn small">' + esc(w) + '</div>').join('');
  }
  function streamDetail(s) {
    const th = results.th;
    return '<table class="grid"><tbody>' +
      [['Temperatura', nf(s.T - 273.15, 2) + ' °C'], ['Pressão', nf(s.P / 1e5, 4) + ' bar'], ['Fase', s.phase + ' (vf = ' + nf(s.beta, 4) + ')'], ['Vazão molar', nf(s.F * 3.6, 4) + ' kmol/h'], ['Vazão mássica', nf(s.mass * 3600, 2) + ' kg/h'], ['Massa molar', nf(s.mw, 3) + ' g/mol'], ['Entalpia', nf(s.h / 1000, 3) + ' kJ/mol']]
        .map(r => '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="subhead">Composição</div><table class="grid"><thead><tr><th>Componente</th><th>x molar</th><th>kmol/h</th></tr></thead><tbody>' +
      th.ids.map((id, i) => '<tr><td>' + esc(th.c[i].name) + '</td><td class="num">' + nf(s.z[i], 5) + '</td><td class="num">' + nf(s.flows[i] * 3.6, 4) + '</td></tr>').join('') + '</tbody></table>';
  }

  /* ------------------------------------------------------------------ resultados */
  function streamList() {
    if (!results || !results.ok) return [];
    return state.streams.map(s => ({ name: s.name, s: results.streams[s.id], from: s.from, to: s.to })).concat((results.extraStreams || []).map(x => ({ name: x.name, s: results.streams[x.id], from: x.from, to: null }))).filter(r => r.s);
  }
  function streamCSV() {
    const th = results.th, L = streamList(), sep = ';', d = v => (typeof v === 'number' ? String(+v.toPrecision(8)).replace('.', ',') : v);
    const rows = [['Corrente'].concat(L.map(r => r.name)), ['Origem'].concat(L.map(r => blockName(r.from))), ['Destino'].concat(L.map(r => (r.to ? blockName(r.to) : 'produto'))),
      ['Temperatura (°C)'].concat(L.map(r => d(r.s.T - 273.15))), ['Pressão (bar)'].concat(L.map(r => d(r.s.P / 1e5))), ['Fração vaporizada'].concat(L.map(r => d(r.s.beta))),
      ['Vazão molar (kmol/h)'].concat(L.map(r => d(r.s.F * 3.6))), ['Vazão mássica (kg/h)'].concat(L.map(r => d(r.s.mass * 3600)))]
      .concat(th.ids.map((id, i) => ['x ' + th.c[i].name].concat(L.map(r => d(r.s.z[i])))));
    return rows.map(r => r.join(sep)).join('\n');
  }
  function totals() {
    let heat = 0, cool = 0, power = 0;
    Object.keys(results.blocks).forEach(id => {
      const r = results.blocks[id];
      if (r.duties) { cool += Math.min(0, r.duties.Qc || 0); heat += Math.max(0, r.duties.Qr || 0); return; }
      if (r.power) { power += r.duty || 0; return; }
      const b = state.blocks.find(x => x.id === id); if (!b || b.type === 'hx_shell' || b.type === 'hx_plate' || r.duty == null) return;
      if (r.duty > 0) heat += r.duty; else cool += r.duty;
    });
    return { heat, cool, power };
  }
  function renderResults() {
    const el = $('#resultsBody');
    if (!results) { el.innerHTML = '<p class="muted">Ainda não há resultados. Clique em <b>Simular</b> (F5).</p>'; return; }
    if (!results.ok) { el.innerHTML = '<div class="note err"><b>A simulação parou.</b><br>' + results.errors.map(e => esc(e.msg)).join('<br>') + '</div><p class="small muted">Corrija a especificação indicada e simule novamente, ou peça ajuda ao agente.</p>'; return; }
    const t = totals(), L = streamList(), th = results.th;
    const close = results.massIn > 0 ? (results.massOut - results.massIn) / results.massIn * 100 : 0;
    let h = '<div class="note ' + (results.converged ? (results.warnings.length ? 'warn' : 'ok') : 'err') + '">' + (results.converged ? 'Fluxograma convergido' : 'Reciclo não convergiu') + ' em ' + results.ms + ' ms · ' + state.blocks.length + ' equipamentos · ' + L.length + ' correntes' + (results.tears.length ? ' · reciclo: ' + results.iterations + ' iterações (Wegstein)' : '') + ' · fechamento do balanço de massa global: ' + nf(close, 4) + ' %</div>';
    h += '<div class="kpis"><div class="kpi"><b>' + nf(t.heat / 1000, 1) + '</b><span>aquecimento, kW</span></div><div class="kpi"><b>' + nf(Math.abs(t.cool) / 1000, 1) + '</b><span>resfriamento, kW</span></div><div class="kpi"><b>' + nf(t.power / 1000, 2) + '</b><span>potência de eixo, kW</span></div></div>';
    results.warnings.forEach(w => { h += '<div class="note warn small">' + esc(w) + '</div>'; });
    h += '<div class="subhead">Tabela de correntes</div><div class="row-actions"><button id="csvCopy">Copiar CSV</button><button id="csvSave">Baixar CSV</button></div><div class="scroll-x"><table class="grid"><thead><tr><th>Corrente</th>' + L.map(r => '<th>' + esc(r.name) + '</th>').join('') + '</tr></thead><tbody>';
    const rows = [['T (°C)', r => nf(r.T - 273.15, 2)], ['P (bar)', r => nf(r.P / 1e5, 3)], ['Fração vaporizada', r => nf(r.beta, 3)], ['Vazão (kmol/h)', r => nf(r.F * 3.6, 3)], ['Vazão (kg/h)', r => nf(r.mass * 3600, 1)]].concat(th.ids.map((id, i) => ['x ' + th.c[i].name, r => nf(r.z[i], 4)]));
    rows.forEach(row => { h += '<tr><td>' + esc(row[0]) + '</td>' + L.map(r => '<td class="num">' + row[1](r.s) + '</td>').join('') + '</tr>'; });
    h += '</tbody></table></div><div class="subhead">Equipamentos</div>';
    state.blocks.forEach(b => {
      const r = results.blocks[b.id]; if (!r || !(r.res || []).length) return;
      h += '<details' + (b.type !== 'feed' && b.type !== 'product' ? ' open' : '') + '><summary><b>' + esc(b.name) + '</b> <span class="muted small">' + esc(U.TYPES[b.type].label) + '</span></summary>' + resTable(r) + ((r.plots || []).length ? '<div class="row-actions"><button data-chart="' + esc(b.id) + '">Gráficos (' + r.plots.length + ')</button></div>' : '') + '</details>';
    });
    el.innerHTML = h;
    $('#csvCopy').onclick = () => copyText(streamCSV()); $('#csvSave').onclick = () => saveFile(slug(state.name) + '_correntes.csv', '﻿' + streamCSV());
    el.querySelectorAll('[data-chart]').forEach(bt => { bt.onclick = () => renderCharts(bt.dataset.chart); });
  }

  /* ------------------------------------------------------------------ gráficos */
  function renderCharts(target, extraPlots, title) {
    const el = $('#charts'); el.innerHTML = '';
    let plots = [], ttl = title || 'Gráficos';
    if (extraPlots) plots = extraPlots;
    else if (results && results.ok) {
      if (target === 'auto' || !target || !results.blocks[target] || !(results.blocks[target].plots || []).length) { const b = state.blocks.find(x => results.blocks[x.id] && (results.blocks[x.id].plots || []).length); target = b && b.id; }
      if (target && results.blocks[target]) { plots = results.blocks[target].plots || []; ttl = 'Gráficos — ' + blockName(target); chartTarget = target; }
    }
    $('#drawerTitle').textContent = ttl;
    if (!plots.length) { el.innerHTML = '<p class="chart-empty">Sem gráficos para mostrar. Simule e selecione uma coluna, reator, trocador ou extrator.</p>'; return; }
    $('#drawer').classList.remove('closed'); $('#drawerToggle').textContent = '▾';
    plots.forEach(p => SF.charts.render(el, p, { save: saveFile, toast, source: title ? '' : blockName(target) }));
  }
  $('#drawerToggle').onclick = () => { const d = $('#drawer'); d.classList.toggle('closed'); $('#drawerToggle').textContent = d.classList.contains('closed') ? '▴' : '▾'; setTimeout(() => { pfd.render(); window.dispatchEvent(new Event('resize')); }, 50); };

  /* ------------------------------------------------------------------ termodinâmica */
  function modelAdvice(ids) {
    const cs = ids.map(id => TH.COMP[id]);
    const gas = cs.filter(c => c.tc && c.tc < 380 && !c.ant).length, polar = cs.filter(c => c.g && (c.g.OH || c.g.H2O || c.g.CH3OH || c.g.COOH || c.g.CH3CO || c.g.CH3COO)).length;
    if (gas && gas >= cs.length / 2) return 'Predominam gases leves: use Peng-Robinson ou SRK (equações de estado).';
    if (polar >= 1 && cs.some(c => c.id === 'water')) return 'Mistura polar com água: use NRTL (ou UNIQUAC). Para pares sem dados, os parâmetros são estimados por UNIFAC.';
    if (polar >= 1) return 'Componentes polares: NRTL, UNIQUAC ou UNIFAC (preditivo).';
    if (cs.every(c => c.g && Object.keys(c.g).every(g => ['CH3', 'CH2', 'CH', 'C', 'ACH', 'AC', 'ACCH3', 'ACCH2'].indexOf(g) >= 0))) return 'Hidrocarbonetos semelhantes a baixa pressão: Ideal (Raoult) é razoável; Peng-Robinson em pressões altas.';
    return 'NRTL é uma boa escolha geral para líquidos; Peng-Robinson para gases e pressões altas.';
  }
  function renderThermo() {
    const el = $('#thermoBody');
    let th = null, err = '';
    try { th = new TH.Thermo(state.components, state.model, { binary: state.binary }); } catch (e) { err = e.message; }
    let h = '<div class="field"><label for="modelSel">Modelo termodinâmico</label><select id="modelSel">' + Object.keys(TH.MODELS).map(k => '<option value="' + k + '"' + (k === state.model ? ' selected' : '') + '>' + TH.MODELS[k] + '</option>').join('') + '</select></div>';
    h += '<div class="note small">' + esc(modelAdvice(state.components)) + '</div>';
    if (th && th.warnings.length) h += th.warnings.map(w => '<div class="note warn small">' + esc(w) + '</div>').join('');
    if (err) h += '<div class="note err">' + esc(err) + '</div>';
    h += '<div class="subhead">Componentes (' + state.components.length + ')</div><input id="compSearch" placeholder="Buscar componente…" style="width:100%;margin-bottom:6px" aria-label="Buscar componente"><div class="comp-list" id="compList">' +
      TH.COMPONENTS.slice().sort((a, b) => (state.components.indexOf(b.id) >= 0) - (state.components.indexOf(a.id) >= 0)).map(c => '<label data-name="' + esc((c.name + ' ' + c.formula + ' ' + c.id).toLowerCase()) + '"><input type="checkbox" data-comp="' + c.id + '"' + (state.components.indexOf(c.id) >= 0 ? ' checked' : '') + '>' + esc(c.name) + ' <small>' + esc(c.formula) + (c.tb ? ' · Teb ' + nf(c.tb - 273.15, 1) + ' °C' : c.solid ? ' · sólido' : ' · não volátil') + '</small></label>').join('') + '</div>';
    if (th && th.pairInfo.length) {
      const isAct = ['NRTL', 'WILSON', 'UNIQUAC'].indexOf(state.model) >= 0;
      h += '<div class="subhead">Parâmetros binários (' + esc(TH.MODELS[state.model]) + ')</div>';
      if (isAct) h += '<p class="small muted">' + (state.model === 'NRTL' ? 'τij = aij + bij/T; α = cij' : state.model === 'UNIQUAC' ? 'τij = exp(aij + bij/T)' : 'ln Λij = aij + bij/T') + '. Edite para usar valores de outro banco (Aspen, DWSIM, ChemSep).</p>';
      h += '<div class="scroll-x"><table class="grid"><thead><tr><th>i / j</th>' + (isAct ? '<th>aij</th><th>aji</th><th>bij</th><th>bji</th>' + (state.model === 'NRTL' ? '<th>α</th>' : '') : state.model === 'PR' || state.model === 'SRK' ? '<th>kij</th>' : '') + '<th>Fonte</th></tr></thead><tbody>';
      th.pairInfo.forEach((p, k) => {
        h += '<tr><td>' + esc(TH.COMP[p.i].name) + ' / ' + esc(TH.COMP[p.j].name) + '</td>';
        if (isAct) ['a12', 'a21', 'b12', 'b21'].concat(state.model === 'NRTL' ? ['c'] : []).forEach(f => { h += '<td><input type="number" step="any" data-pair="' + k + '" data-pf="' + f + '" value="' + (+p[f]).toPrecision(5) + '"></td>'; });
        else if (p.kij != null) h += '<td class="num">' + nf(p.kij, 4) + '</td>';
        h += '<td class="small">' + esc(p.src) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    const vol = state.components.filter(id => !TH.COMP[id].nv && !TH.COMP[id].solid);
    h += '<div class="subhead">Diagrama de fases binário (Txy / xy)</div>';
    if (vol.length >= 2) {
      h += '<div class="field"><label for="txy1">Componente 1</label><select id="txy1">' + vol.map((id, i) => '<option value="' + id + '"' + (i === 0 ? ' selected' : '') + '>' + esc(TH.COMP[id].name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="txy2">Componente 2</label><select id="txy2">' + vol.map((id, i) => '<option value="' + id + '"' + (i === 1 ? ' selected' : '') + '>' + esc(TH.COMP[id].name) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="txyP">Pressão<span class="u">bar</span></label><input id="txyP" type="number" step="any" value="1.01325"></div><div class="row-actions"><button id="txyBtn" class="primary">Gerar Txy e xy</button></div><div id="txyOut"></div>';
    } else h += '<p class="small muted">Selecione ao menos dois componentes voláteis.</p>';
    el.innerHTML = h;
    $('#modelSel').onchange = e => { pushUndo(); state.model = e.target.value; afterChange(false); renderThermo(); };
    $('#compSearch').oninput = e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('#compList label').forEach(l => { l.hidden = q && l.dataset.name.indexOf(q) < 0; }); };
    el.querySelectorAll('[data-comp]').forEach(cb => { cb.onchange = () => { pushUndo(); const id = cb.dataset.comp; if (cb.checked) { if (state.components.indexOf(id) < 0) state.components.push(id); } else state.components = state.components.filter(x => x !== id); afterChange(false); renderThermo(); }; });
    el.querySelectorAll('[data-pair]').forEach(inp => {
      inp.onchange = () => {
        pushUndo(); const p = th.pairInfo[+inp.dataset.pair], key = TH.pairKey(p.i, p.j), flip = p.i > p.j;
        const cur = { a12: p.a12, a21: p.a21, b12: p.b12, b21: p.b21, c: p.c }; cur[inp.dataset.pf] = +inp.value;
        state.binary[state.model + ':' + key] = flip ? { a12: cur.a21, a21: cur.a12, b12: cur.b21, b21: cur.b12, c: cur.c } : cur;
        afterChange(false); renderThermo();
      };
    });
    if ($('#txyBtn')) $('#txyBtn').onclick = () => {
      const a = $('#txy1').value, b = $('#txy2').value, P = (+$('#txyP').value || 1.01325) * 1e5;
      if (a === b) return toast('Escolha dois componentes diferentes');
      try {
        const t2 = new TH.Thermo([a, b], state.model, { binary: state.binary }), d = t2.binaryTxy(0, 1, P, 51); let az = null; try { az = t2.azeotrope(0, 1, P); } catch (e) { /* */ }
        const n1 = TH.COMP[a].name, n2 = TH.COMP[b].name;
        $('#txyOut').innerHTML = az ? '<div class="note warn">Azeótropo de ' + esc(az.type) + ' em x(' + esc(n1) + ') = ' + nf(az.x, 4) + ' a ' + nf(az.T - 273.15, 2) + ' °C. Destilação simples não ultrapassa esse ponto.</div>' : '<div class="note ok">Sem azeótropo a ' + nf(P / 1e5, 3) + ' bar.</div>';
        renderCharts(null, [{ kind: 'txy', title: 'Txy ' + n1 + '/' + n2 + ' a ' + nf(P / 1e5, 3) + ' bar (' + TH.MODELS[state.model] + ')', data: { x: d.x, y: d.y, T: d.T.map(T => T - 273.15), n1, az: az ? { x: az.x, T: az.T - 273.15 } : null } },
          { kind: 'xy', title: 'Diagrama xy ' + n1 + '/' + n2, data: { x: d.x, y: d.y, n1 } }], 'Equilíbrio líquido-vapor');
      } catch (e) { $('#txyOut').innerHTML = '<div class="note err">' + esc(e.message) + '</div>'; }
    };
  }

  /* ------------------------------------------------------------------ fluxograma final (relatório) */
  function openModal(title, bodyHTML, actions) {
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = bodyHTML; const a = $('#modalActions'); a.innerHTML = '';
    (actions || []).forEach(x => { const b = document.createElement('button'); b.textContent = x.label; if (x.primary) b.className = 'primary'; b.onclick = x.fn; a.appendChild(b); });
    $('#modal').hidden = false; setTimeout(() => $('#modalClose').focus(), 30);
  }
  $('#modalClose').onclick = () => { $('#modal').hidden = true; };
  $('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').hidden = true; };

  function reportHTML(svg) {
    const blocks = state.blocks.filter(b => results.blocks[b.id] && (results.blocks[b.id].res || []).length && b.type !== 'feed');
    const t = totals();
    return '<div class="report-pfd">' + svg + '</div>' +
      '<div class="kpis" style="margin-top:12px"><div class="kpi"><b>' + nf(t.heat / 1000, 1) + '</b><span>aquecimento total, kW</span></div><div class="kpi"><b>' + nf(Math.abs(t.cool) / 1000, 1) + '</b><span>resfriamento total, kW</span></div><div class="kpi"><b>' + nf(t.power / 1000, 2) + '</b><span>potência, kW</span></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px">' + blocks.map(b => '<div><div class="subhead">' + esc(b.name) + ' — ' + esc(U.TYPES[b.type].label) + '</div>' + resTable(results.blocks[b.id]) + '</div>').join('') + '</div>' +
      (results.warnings.length ? '<div class="subhead">Avisos</div>' + results.warnings.map(w => '<div class="note warn small">' + esc(w) + '</div>').join('') : '') +
      '<p class="small muted" style="margin-top:14px">' + esc(SF.CREDITS.long) + '</p>';
  }
  function openAbout() {
    const C = SF.CREDITS;
    openModal('Sobre o ' + C.title,
      '<div style="max-width:740px">' +
      '<p style="font-size:16px"><b>' + esc(C.title) + ' – ' + esc(C.subtitle) + '</b><br>Simulador de processos químicos com agente de inteligência artificial, no estilo Aspen Plus e DWSIM.</p>' +
      '<div class="subhead">Autor</div><p><b>' + esc(C.author) + '</b> – ' + esc(C.course) + '<br>' + esc(C.program) + ' &amp; CLAUDE<br><span class="small muted">' + esc(C.role) + ' · ' + esc(C.institution) + '</span></p>' +
      '<p>Autor do livro <i>' + esc(C.book) + '</i> (' + esc(C.publisher) + ', 2019), base dos modelos dinâmicos usados aqui.</p>' +
      '<div class="subhead">Coautor</div><p><b>' + esc(C.coauthor) + '</b> – desenvolvimento do código, do motor numérico e do agente.</p>' +
      '<div class="subhead">Recursos</div><ul class="small"><li>Termodinâmica: Ideal, NRTL, Wilson, UNIQUAC, UNIFAC, Peng-Robinson e SRK.</li>' +
      '<li>Colunas rigorosas pelo método do ponto de bolha (Wang–Henke + θ) com Newton simultâneo (Naphtali–Sandholm).</li>' +
      '<li>Reatores CSTR e PFR em regime permanente e transiente; trocadores, extratores, vasos e máquinas.</li>' +
      '<li>Fluxograma final, gráficos com fonte 18 e geração de código MATLAB, Octave e Python.</li></ul>' +
      '<div class="subhead">Referência</div><p class="small">' + esc(C.bookRef) + '</p></div>', []);
  }
  function standaloneReport(svg) {
    const blocks = state.blocks.filter(b => results.blocks[b.id] && (results.blocks[b.id].res || []).length && b.type !== 'feed');
    const tbl = r => '<table>' + (r.res || []).map(x => '<tr><td>' + esc(x.k) + '</td><td style="text-align:right">' + esc(nf(x.v, 4)) + ' ' + esc(x.u || '') + '</td></tr>').join('') + '</table>';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>' + esc(state.name) + ' — SIMULA FÁCIL IA</title><style>body{font:14px Arial,sans-serif;margin:24px;color:#15232a}h1{font-size:22px}h2{font-size:16px;margin:18px 0 6px}table{border-collapse:collapse;font-size:13px}td{border-bottom:1px solid #ddd;padding:3px 8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}.w{background:#fbf0dc;padding:6px 10px;margin:4px 0;border-left:3px solid #9a6512}</style></head><body>' +
      '<h1>' + esc(state.name) + '</h1><p>Modelo termodinâmico: ' + esc(TH.MODELS[state.model]) + ' · Componentes: ' + state.components.map(id => esc(TH.COMP[id].name)).join(', ') + '</p>' + svg +
      '<div class="g">' + blocks.map(b => '<div><h2>' + esc(b.name) + ' — ' + esc(U.TYPES[b.type].label) + '</h2>' + tbl(results.blocks[b.id]) + '</div>').join('') + '</div>' +
      results.warnings.map(w => '<div class="w">' + esc(w) + '</div>').join('') + '<p style="color:#5a6a72;font-size:12px">Gerado por SIMULA FÁCIL IA em ' + new Date().toLocaleString('pt-BR') + '.<br>' + esc(SF.CREDITS.long) + '</p></body></html>';
  }
  function openReport() {
    if (!results || !results.ok) runSimulation(true);
    if (!results || !results.ok) { switchTab('results'); return toast('Corrija os erros da simulação antes de gerar o fluxograma final'); }
    const svg = SF.pfd.exportSVG(state, results, { title: state.name, model: TH.MODELS[state.model] });
    openModal('Fluxograma final — ' + state.name, reportHTML(svg), [
      { label: 'Baixar PNG', primary: true, fn: async () => { try { saveFile(slug(state.name) + '_fluxograma.png', await svgToPng(svg, 2)); } catch (e) { toast(e.message); } } },
      { label: 'Baixar SVG', fn: () => saveFile(slug(state.name) + '_fluxograma.svg', svg) },
      { label: 'Relatório HTML', fn: () => saveFile(slug(state.name) + '_relatorio.html', standaloneReport(svg)) },
      { label: 'Correntes CSV', fn: () => saveFile(slug(state.name) + '_correntes.csv', '﻿' + streamCSV()) }]);
  }

  /* ------------------------------------------------------------------ MATLAB / Octave */
  function openMatlab() {
    if (!results || !results.ok) runSimulation(true);
    if (!results || !results.ok) { switchTab('results'); return toast('Simule com sucesso antes de gerar o código'); }
    const fn = 'simula_facil_' + slug(state.name);
    const code = SF.matlab.generate(state, results, fn);
    const readme = SF.matlab.readme(state, fn);
    openModal('Código MATLAB / Octave — ' + fn + '.m', '<p class="small muted">Função autocontida: recalcula os blocos-chave com os mesmos dados (ode15s, ode45, fzero), desenha o fluxograma e os gráficos com fonte 18. Compatível com MATLAB R2016b+ e GNU Octave 6+.</p><pre>' + esc(code) + '</pre>', [
      { label: 'Copiar código', primary: true, fn: () => copyText(code) },
      { label: 'Baixar .zip (.m + leia-me)', fn: () => saveFile(fn + '.zip', makeZip([{ name: fn + '.m', data: code }, { name: 'LEIA-ME.txt', data: readme }, { name: fn + '_projeto.json', data: JSON.stringify(state, null, 2) }])) },
      { label: 'Baixar .txt', fn: () => saveFile(fn + '.m.txt', code) }]);
  }

  function openPython() {
    if (!results || !results.ok) runSimulation(true);
    if (!results || !results.ok) { switchTab('results'); return toast('Simule com sucesso antes de gerar o código'); }
    const fn = 'simula_facil_' + slug(state.name);
    const code = SF.python.generate(state, results, fn);
    openModal('Código Python — ' + fn + '.py', '<p class="small muted">Script autocontido (NumPy, SciPy, Matplotlib): recalcula os blocos-chave com solve_ivp e brentq, desenha o fluxograma com os ícones padrão e os gráficos com fonte 18. Roda em Python 3.9+, Jupyter ou Google Colab.</p><pre>' + esc(code) + '</pre>', [
      { label: 'Copiar código', primary: true, fn: () => copyText(code) },
      { label: 'Baixar .zip (.py + leia-me)', fn: () => saveFile(fn + '_python.zip', makeZip([{ name: fn + '.py', data: code }, { name: 'LEIA-ME.txt', data: SF.python.readme(state, fn) }, { name: fn + '_projeto.json', data: JSON.stringify(state, null, 2) }])) },
      { label: 'Baixar .txt', fn: () => saveFile(fn + '.py.txt', code) }]);
  }

  /* ------------------------------------------------------------------ projeto: novo, exemplos, salvar, abrir */
  function loadFlowsheet(fs, keepPositions) {
    pushUndo();
    state = Object.assign(blank(), JSON.parse(JSON.stringify(fs)));
    state.binary = state.binary || {};
    state.blocks.forEach(b => { b.params = Object.assign(defaultParamsSafe(b.type, state), b.params || {}); b.name = b.name || b.id; });
    state.streams.forEach((s, k) => { s.id = s.id || ('S' + (k + 1)); s.name = s.name || String(k + 1); });
    SF.pfd.autoLayout(state, !keepPositions);
    results = null; pfd.sel = null; afterChange(true); setTimeout(() => pfd.fit(), 30);
  }
  function defaultParamsSafe(type, st) { const saved = state; state = st; try { return U.TYPES[type] ? defaultParams(type) : {}; } finally { state = saved; } }
  SF.examples.forEach(e => { const o = document.createElement('option'); o.value = e.key; o.textContent = e.title; $('#exampleSel').appendChild(o); });
  $('#exampleSel').onchange = e => { const ex = SF.examples.find(x => x.key === e.target.value); e.target.value = ''; if (!ex) return; loadFlowsheet(ex.fs); runSimulation(true); toast('Exemplo carregado: ' + ex.title); };
  $('#btnNew').onclick = () => { pushUndo(); state = blank(); results = null; pfd.sel = null; afterChange(true); pfd.fit(); renderCharts(null, []); };
  $('#btnUndo').onclick = undo;
  $('#btnRun').onclick = () => runSimulation();
  $('#btnReport').onclick = openReport;
  $('#btnMatlab').onclick = openMatlab;
  $('#btnPython').onclick = openPython;
  $('#btnSave').onclick = () => saveFile(slug(state.name) + '.json', JSON.stringify(state, null, 2));
  $('#btnOpen').onclick = () => $('#fileOpen').click();
  $('#btnAbout').onclick = openAbout;
  $('#fileOpen').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { try { const fs = JSON.parse(t); if (!fs.blocks) throw new Error('arquivo sem blocos'); loadFlowsheet(fs, true); toast('Projeto aberto'); } catch (err) { toast('Arquivo inválido: ' + err.message); } }); e.target.value = ''; };
  $('#projName').onchange = e => { state.name = e.target.value || 'Processo'; persist(); };
  $('#zoomIn').onclick = () => pfd.zoom(1.2); $('#zoomOut').onclick = () => pfd.zoom(1 / 1.2); $('#zoomFit').onclick = () => pfd.fit();
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (e.key === 'F5') { e.preventDefault(); runSimulation(); }
    else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSelected(); }
    else if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape') { $('#modal').hidden = true; $('#welcome').hidden = true; if (pfd.arm) { pfd.arm = null; pfd.render(); } }
  });
  window.addEventListener('resize', () => pfd.render());

  // auto-simulação
  (function () { const lab = document.createElement('label'); lab.className = 'small'; lab.style.cssText = 'display:inline-flex;gap:4px;align-items:center'; lab.innerHTML = '<input type="checkbox" id="autoSim" checked> auto-simular'; $('.canvas-bar').insertBefore(lab, $('#zoomOut')); })();

  /* ------------------------------------------------------------------ tela inicial */
  function openWelcome() {
    const grid = $('#wExGrid'); grid.innerHTML = '';
    SF.examples.forEach(ex => {
      const main = (ex.fs.blocks.find(b => b.type !== 'feed' && b.type !== 'product') || ex.fs.blocks[0]).type;
      const b = document.createElement('button'); b.className = 'wexc'; b.type = 'button';
      b.innerHTML = IC.paletteIcon(main) + '<span>' + esc(ex.title) + '</span>';
      b.onclick = () => { closeWelcome(); loadFlowsheet(ex.fs); runSimulation(true); toast('Exemplo carregado: ' + ex.title); };
      grid.appendChild(b);
    });
    let noShow = false; try { noShow = localStorage.getItem('simulafacil.noWelcome') === '1'; } catch (e) { /* */ }
    $('#wNoShow').checked = noShow;
    $('#welcome').hidden = false; setTimeout(() => $('#wAgent').focus(), 30);
  }
  function closeWelcome() { $('#welcome').hidden = true; setTimeout(() => pfd.fit(), 30); }
  $('#wClose').onclick = closeWelcome;
  $('#welcome').onclick = e => { if (e.target.id === 'welcome') closeWelcome(); };
  $('#wAgent').onclick = () => { closeWelcome(); switchTab('agent'); setTimeout(() => $('#chatInput').focus(), 50); };
  $('#wExamples').onclick = () => { $('#wExTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = $('#wExGrid button'); if (f) f.focus(); };
  $('#wBlank').onclick = () => { closeWelcome(); pushUndo(); state = blank(); results = null; pfd.sel = null; afterChange(true); pfd.fit(); renderCharts(null, []); switchTab('thermo'); toast('Escolha os componentes e o modelo; depois clique nos equipamentos da paleta'); };
  $('#wNoShow').onchange = e => { try { localStorage.setItem('simulafacil.noWelcome', e.target.checked ? '1' : '0'); } catch (err) { /* */ } };
  $('#btnHome').onclick = openWelcome;
  // fora do Claude (site próprio): botão para a versão com o agente de IA
  (function () {
    const url = window.SIMULAFACIL_CONFIG && window.SIMULAFACIL_CONFIG.claudeUrl;
    if (window.claude || !url) return;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'btn claude-link'; a.textContent = 'Agente IA no Claude ↗';
    a.title = 'Abrir a versão com o agente de inteligência artificial (requer conta no Claude)';
    $('.tools').insertBefore(a, $('#btnNew'));
    const w = $('#wAgent'); if (w) { w.onclick = () => { window.open(url, '_blank', 'noopener'); }; w.querySelector('span:last-child').textContent = 'Abre a versão no Claude (requer conta do Claude)'; }
  })();

  /* ------------------------------------------------------------------ API para o agente */
  SF.app = {
    getState: () => state, getResults: () => results,
    load: (fs, keep) => loadFlowsheet(fs, keep),
    run: () => runSimulation(true),
    pushUndo, afterChange, connect, defaultParams, renderCharts, saveFile, toast, switchTab, openMatlab, openPython, openReport,
    fit: () => pfd.fit(), select: sel => pfd.select(sel), blockName, streamList, totals
  };

  /* ------------------------------------------------------------------ inicialização */
  renderPalette();
  let restored = false;
  try { const s = localStorage.getItem('simulafacil.v1'); if (s) { const fs = JSON.parse(s); if (fs && fs.blocks && fs.blocks.length) { state = Object.assign(blank(), fs); restored = true; } } } catch (e) { /* sem armazenamento */ }
  if (!restored) { const ex = SF.examples[0]; state = Object.assign(blank(), JSON.parse(JSON.stringify(ex.fs))); SF.pfd.autoLayout(state, true); }
  $('#projName').value = state.name; $('#emptyHint').hidden = state.blocks.length > 0; updateCompSummary();
  requestAnimationFrame(() => { pfd.fit(); runSimulation(true); renderProps(); });
  (function () { let noShow = false; try { noShow = localStorage.getItem('simulafacil.noWelcome') === '1'; } catch (e) { /* */ } if (!noShow) openWelcome(); })();
  if (SF.agent) SF.agent.init(SF.app);
})();
