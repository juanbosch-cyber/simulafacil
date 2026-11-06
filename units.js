/* SIMULA FÁCIL IA — Operações unitárias (regime permanente e transiente)
   Cada operação recebe (th, bloco, entradas{porta: corrente}) e devolve {out:{porta: corrente}, res:[], plots:[], warn:[]}.
   Unidades internas SI (mol/s, K, Pa, W). Parâmetros do usuário em °C, bar, kmol/h, kW, m³, s. */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const N = SF.num, TH = SF.thermo, R = 8.314462618;
  const C2K = t => t + 273.15, K2C = T => T - 273.15, BAR = 1e5, KMOLH = 1000 / 3600;
  const sum = N.sum, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);

  /* ------------------------------------------------------------------ correntes */
  function mkStream(th, flows, T, P, fl) {
    flows = flows.map(v => (v > 0 ? v : 0));
    const F = sum(flows);
    if (!(F > 1e-14)) return { flows: flows.map(() => 0), F: 0, T, P, z: flows.map(() => 0), beta: 0, x: flows.map(() => 0), y: flows.map(() => 0), phase: '—', h: 0, H: 0, mw: 0, mass: 0, empty: true };
    const z = flows.map(f => f / F);
    fl = fl || th.flashTP(z, T, P);
    const h = th.enthalpy(fl), mw = th.mw(z);
    return { flows, F, T, P, z, beta: fl.beta, x: fl.x, y: fl.y, phase: fl.phase, h, H: h * F, mw, mass: F * mw / 1000 };
  }
  function streamPH(th, flows, P, Htot, Tg) {
    const F = sum(flows); if (!(F > 1e-14)) return mkStream(th, flows, Tg || 298.15, P);
    const z = flows.map(f => f / F), fl = th.flashPH(z, P, Htot / F, Tg);
    return mkStream(th, flows, fl.T, P, fl);
  }
  function addFlows(list, n) { const f = new Array(n).fill(0); list.forEach(s => { if (s) s.flows.forEach((v, i) => { f[i] += v; }); }); return f; }
  const kW = W => W / 1000;

  /* ------------------------------------------------------------------ cinética */
  function compileReactions(th, rxns) {
    return (rxns || []).map((r, k) => {
      const nu = new Array(th.n).fill(0), ord = new Array(th.n).fill(0);
      Object.keys(r.stoich || {}).forEach(id => { const i = th.ids.indexOf(id); if (i < 0) throw new Error('Reação ' + (k + 1) + ': componente ' + id + ' não está na lista'); nu[i] = +r.stoich[id]; });
      if (r.orders) Object.keys(r.orders).forEach(id => { const i = th.ids.indexOf(id); if (i >= 0) ord[i] = +r.orders[id]; });
      else nu.forEach((v, i) => { if (v < 0) ord[i] = -v; });
      const keyId = r.key || Object.keys(r.stoich || {}).find(id => r.stoich[id] < 0);
      return { nu, ord, k: num(r.k, 0), Ea: num(r.Ea, 0) * 1000, Tref: C2K(num(r.Tref, 25)), dH: num(r.dH, 0) * 1000, rev: r.kr ? num(r.kr, 0) : 0,
        key: th.ids.indexOf(keyId), X: num(r.conversion, 0), label: r.label || equationText(th, nu) };
    });
  }
  function equationText(th, nu) {
    const side = s => nu.map((v, i) => (s * v > 0 ? (Math.abs(v) !== 1 ? Math.abs(v) + ' ' : '') + th.c[i].formula : null)).filter(Boolean).join(' + ');
    return side(-1) + ' → ' + side(1);
  }
  function rates(rx, C, T) { // C em mol/L → r em mol/(L·s)
    return rx.map(r => {
      const k = r.k * Math.exp(-r.Ea / R * (1 / T - 1 / r.Tref));
      let v = k; for (let i = 0; i < C.length; i++) if (r.ord[i]) v *= Math.pow(Math.max(C[i], 0), r.ord[i]);
      return v;
    });
  }

  /* ------------------------------------------------------------------ registro de tipos (metadados para a paleta, editor e agente) */
  const P_T = { k: 'T', label: 'Temperatura', u: '°C' }, P_P = { k: 'P', label: 'Pressão', u: 'bar' };
  const RXN = { k: 'reactions', label: 'Reações', type: 'reactions' };
  const TYPES = {
    feed: { label: 'Corrente de alimentação', cat: 'Correntes', ins: [], outs: ['out'], params: [
      Object.assign({ def: 25 }, P_T), Object.assign({ def: 1.01325 }, P_P),
      { k: 'vf', label: 'Fração vaporizada (opcional; substitui T)', u: '0–1', def: '' },
      { k: 'flow', label: 'Vazão total', u: '', def: 100 }, { k: 'flowUnit', label: 'Unidade da vazão', type: 'select', options: ['kmol/h', 'kg/h', 'mol/s', 'L/s', 'm³/h'], def: 'kmol/h' },
      { k: 'basis', label: 'Base da composição', type: 'select', options: ['molar', 'mássica', 'concentração (mol/L)'], def: 'molar' },
      { k: 'solvent', label: 'Solvente (base concentração)', type: 'comp', def: '' },
      { k: 'composition', label: 'Composição', type: 'composition' }] },
    product: { label: 'Produto (saída)', cat: 'Correntes', ins: ['in'], outs: [], params: [] },
    mixer: { label: 'Misturador', cat: 'Misturadores/Divisores', ins: ['in1', 'in2', 'in3', 'in4'], outs: ['out'], params: [{ k: 'P', label: 'Pressão de saída (vazio = menor entrada)', u: 'bar', def: '' }] },
    splitter: { label: 'Divisor de corrente', cat: 'Misturadores/Divisores', ins: ['in'], outs: ['out1', 'out2', 'out3'], params: [{ k: 'f1', label: 'Fração para saída 1', u: '0–1', def: 0.5 }, { k: 'f2', label: 'Fração para saída 2', u: '0–1', def: 0.5 }] },
    separator: { label: 'Separador de componentes', cat: 'Misturadores/Divisores', ins: ['in'], outs: ['out1', 'out2'], params: [{ k: 'splits', label: 'Fração de cada componente para a saída 1', type: 'compfrac' }] },
    heater: { label: 'Aquecedor', cat: 'Trocadores de calor', ins: ['in'], outs: ['out'], params: [
      { k: 'mode', label: 'Especificação', type: 'select', options: ['Temperatura de saída', 'Carga térmica', 'Fração vaporizada'], def: 'Temperatura de saída' },
      { k: 'T', label: 'Temperatura de saída', u: '°C', def: 80 }, { k: 'Q', label: 'Carga térmica', u: 'kW', def: 100 }, { k: 'vf', label: 'Fração vaporizada de saída', u: '0–1', def: 1 }, { k: 'dP', label: 'Perda de carga', u: 'bar', def: 0 }] },
    cooler: { label: 'Resfriador', cat: 'Trocadores de calor', ins: ['in'], outs: ['out'], params: [
      { k: 'mode', label: 'Especificação', type: 'select', options: ['Temperatura de saída', 'Carga térmica', 'Fração vaporizada'], def: 'Temperatura de saída' },
      { k: 'T', label: 'Temperatura de saída', u: '°C', def: 30 }, { k: 'Q', label: 'Calor removido', u: 'kW', def: 100 }, { k: 'vf', label: 'Fração vaporizada de saída', u: '0–1', def: 0 }, { k: 'dP', label: 'Perda de carga', u: 'bar', def: 0 }] },
    hx_shell: { label: 'Trocador casco e tubo', cat: 'Trocadores de calor', ins: ['hot_in', 'cold_in'], outs: ['hot_out', 'cold_out'], params: [
      { k: 'spec', label: 'Especificação', type: 'select', options: ['T saída quente', 'T saída fria', 'Carga térmica', 'UA (avaliação)'], def: 'T saída quente' },
      { k: 'value', label: 'Valor (°C, kW ou W/K)', u: '', def: 60 }, { k: 'U', label: 'Coef. global U', u: 'W/m²·K', def: 800 },
      { k: 'shellPasses', label: 'Passes no casco', type: 'select', options: ['1', '2'], def: '1' }, { k: 'tubePasses', label: 'Passes nos tubos', type: 'select', options: ['1', '2', '4'], def: '2' },
      { k: 'tubeD', label: 'Diâmetro externo do tubo', u: 'mm', def: 19.05 }, { k: 'tubeL', label: 'Comprimento do tubo', u: 'm', def: 4.88 },
      { k: 'dPh', label: 'Perda de carga lado quente', u: 'bar', def: 0 }, { k: 'dPc', label: 'Perda de carga lado frio', u: 'bar', def: 0 }] },
    hx_plate: { label: 'Trocador de placas', cat: 'Trocadores de calor', ins: ['hot_in', 'cold_in'], outs: ['hot_out', 'cold_out'], params: [
      { k: 'spec', label: 'Especificação', type: 'select', options: ['T saída quente', 'T saída fria', 'Carga térmica', 'UA (avaliação)'], def: 'T saída quente' },
      { k: 'value', label: 'Valor (°C, kW ou W/K)', u: '', def: 40 }, { k: 'U', label: 'Coef. global U', u: 'W/m²·K', def: 3500 }, { k: 'plateArea', label: 'Área por placa', u: 'm²', def: 0.5 },
      { k: 'dPh', label: 'Perda de carga lado quente', u: 'bar', def: 0 }, { k: 'dPc', label: 'Perda de carga lado frio', u: 'bar', def: 0 }] },
    pump: { label: 'Bomba', cat: 'Alteradores de pressão', ins: ['in'], outs: ['out'], params: [{ k: 'P', label: 'Pressão de descarga', u: 'bar', def: 5 }, { k: 'eff', label: 'Eficiência', u: '0–1', def: 0.75 }] },
    compressor: { label: 'Compressor', cat: 'Alteradores de pressão', ins: ['in'], outs: ['out'], params: [{ k: 'P', label: 'Pressão de descarga', u: 'bar', def: 5 }, { k: 'eff', label: 'Eficiência isentrópica', u: '0–1', def: 0.75 }] },
    valve: { label: 'Válvula', cat: 'Alteradores de pressão', ins: ['in'], outs: ['out'], params: [{ k: 'P', label: 'Pressão de saída', u: 'bar', def: 1.01325 }] },
    flash: { label: 'Vaso flash', cat: 'Separadores/Vasos', ins: ['in'], outs: ['vapor', 'liquid'], params: [
      { k: 'mode', label: 'Especificação', type: 'select', options: ['T e P', 'Adiabático', 'Carga térmica', 'Fração vaporizada'], def: 'T e P' },
      Object.assign({ def: 80 }, P_T), Object.assign({ def: 1.01325 }, P_P), { k: 'Q', label: 'Carga térmica', u: 'kW', def: 0 }, { k: 'vf', label: 'Fração vaporizada', u: '0–1', def: 0.5 }] },
    decanter: { label: 'Decantador (ELL)', cat: 'Separadores/Vasos', ins: ['in'], outs: ['light', 'heavy'], params: [Object.assign({ def: 25 }, P_T), Object.assign({ def: 1.01325 }, P_P)] },
    column_short: { label: 'Coluna shortcut (FUG)', cat: 'Colunas', ins: ['feed'], outs: ['distillate', 'bottoms'], params: [
      { k: 'lk', label: 'Chave leve', type: 'comp' }, { k: 'hk', label: 'Chave pesado', type: 'comp' },
      { k: 'lkRec', label: 'Recuperação da chave leve no destilado', u: '0–1', def: 0.99 }, { k: 'hkRec', label: 'Recuperação da chave pesada no fundo', u: '0–1', def: 0.99 },
      { k: 'RRmin', label: 'R / Rmín', u: '', def: 1.3 }, Object.assign({ def: 1.01325 }, P_P)] },
    column: { label: 'Coluna de destilação rigorosa', cat: 'Colunas', ins: ['feed', 'feed2', 'feed3'], outs: ['distillate', 'bottoms', 'side'], params: [
      { k: 'N', label: 'Nº de estágios (inclui condensador e refervedor)', u: '', def: 20 }, { k: 'feedStage', label: 'Estágio da alimentação 1', u: '', def: 10 },
      { k: 'feed2Stage', label: 'Estágio da alimentação 2 (solvente/arrastador)', u: '', def: 3 }, { k: 'feed3Stage', label: 'Estágio da alimentação 3', u: '', def: 15 },
      { k: 'R', label: 'Razão de refluxo', u: '', def: 3 }, { k: 'Dmode', label: 'Especificação do destilado', type: 'select', options: ['Vazão D', 'D/F'], def: 'D/F' },
      { k: 'D', label: 'Vazão de destilado ou razão D/F', u: 'kmol/h ou –', def: 0.1 },
      { k: 'condenser', label: 'Condensador', type: 'select', options: ['total', 'parcial'], def: 'total' },
      Object.assign({ def: 1.01325 }, P_P), { k: 'dP', label: 'Queda de pressão por estágio', u: 'bar', def: 0 },
      { k: 'sideStage', label: 'Estágio da retirada lateral (0 = nenhuma)', u: '', def: 0 }, { k: 'sideFlow', label: 'Vazão da retirada lateral (líquido)', u: 'kmol/h', def: 0 },
      { k: 'specComp', label: 'Especificação de projeto: componente (opcional)', type: 'comp', def: '' },
      { k: 'specType', label: 'Tipo de especificação', type: 'select', options: ['nenhuma', 'pureza no destilado', 'pureza no fundo', 'recuperação no destilado'], def: 'nenhuma' },
      { k: 'specValue', label: 'Valor alvo da especificação', u: '0–1', def: 0.85 },
      { k: 'specVary', label: 'Variável manipulada', type: 'select', options: ['R', 'D'], def: 'R' }] },
    absorber: { label: 'Absorvedora / esgotadora (Kremser)', cat: 'Colunas', ins: ['gas_in', 'liq_in'], outs: ['gas_out', 'liq_out'], params: [
      { k: 'N', label: 'Nº de estágios teóricos', u: '', def: 8 }, Object.assign({ def: 30 }, P_T), Object.assign({ def: 1.01325 }, P_P)] },
    extractor: { label: 'Extrator líquido-líquido', cat: 'Extratores', ins: ['feed', 'solvent'], outs: ['extract', 'raffinate'], params: [
      { k: 'N', label: 'Nº de estágios (contracorrente)', u: '', def: 5 }, Object.assign({ def: 25 }, P_T), Object.assign({ def: 1.01325 }, P_P)] },
    leaching: { label: 'Extrator sólido-líquido (lixiviação)', cat: 'Extratores', ins: ['solids', 'solvent'], outs: ['overflow', 'underflow'], params: [
      { k: 'N', label: 'Nº de estágios (contracorrente)', u: '', def: 4 }, { k: 'r', label: 'Retenção de solução no sólido', u: 'kg solução/kg inerte', def: 0.5 },
      Object.assign({ def: 50 }, P_T), Object.assign({ def: 1.01325 }, P_P)] },
    cstr: { label: 'Reator CSTR', cat: 'Reatores', ins: ['in'], outs: ['out'], params: [
      { k: 'V', label: 'Volume', u: 'm³', def: 1 }, { k: 'mode', label: 'Regime', type: 'select', options: ['permanente', 'transiente', 'batelada'], def: 'permanente' },
      { k: 'thermal', label: 'Energia', type: 'select', options: ['isotérmico', 'adiabático', 'camisa'], def: 'isotérmico' },
      Object.assign({ def: 60 }, P_T), { k: 'UA', label: 'UA da camisa', u: 'W/K', def: 5000 }, { k: 'Tj', label: 'Temperatura da camisa', u: '°C', def: 25 },
      { k: 'tEnd', label: 'Tempo de simulação', u: 's', def: 3600 }, { k: 'init', label: 'Conteúdo inicial (transiente)', type: 'select', options: ['solvente puro', 'igual à alimentação'], def: 'solvente puro' }, RXN] },
    pfr: { label: 'Reator PFR', cat: 'Reatores', ins: ['in'], outs: ['out'], params: [
      { k: 'V', label: 'Volume', u: 'm³', def: 0.1 }, { k: 'D', label: 'Diâmetro', u: 'm', def: 0.1 },
      { k: 'mode', label: 'Regime', type: 'select', options: ['permanente', 'transiente'], def: 'permanente' },
      { k: 'phase', label: 'Fase reacional', type: 'select', options: ['líquida', 'gasosa'], def: 'líquida' },
      { k: 'thermal', label: 'Energia', type: 'select', options: ['isotérmico', 'adiabático', 'parede'], def: 'isotérmico' },
      Object.assign({ def: 60 }, P_T), { k: 'U', label: 'Coef. U da parede', u: 'W/m²·K', def: 300 }, { k: 'Tw', label: 'Temperatura da parede', u: '°C', def: 25 },
      { k: 'tEnd', label: 'Tempo de simulação (transiente)', u: 's', def: 120 }, { k: 'cells', label: 'Células de discretização', u: '', def: 60 }, RXN] },
    rconv: { label: 'Reator de conversão', cat: 'Reatores', ins: ['in'], outs: ['out'], params: [
      { k: 'thermal', label: 'Energia', type: 'select', options: ['isotérmico', 'adiabático'], def: 'isotérmico' }, Object.assign({ def: 60 }, P_T), RXN] }
  };
  Object.keys(TYPES).forEach(k => { TYPES[k].type = k; });

  /* ------------------------------------------------------------------ implementações */
  const IMPL = {};

  IMPL.feed = function (th, b, ins) {
    const p = b.params, comp = p.composition || {}, n = th.n;
    const volUnit = p.flowUnit === 'L/s' || p.flowUnit === 'm³/h';
    if (p.basis === 'concentração (mol/L)' || volUnit) {
      // vazão volumétrica + concentrações (mol/L); o solvente completa o volume (mistura ideal de volumes)
      const Q = p.flowUnit === 'm³/h' ? num(p.flow, 0) * 1000 / 3600 : p.flowUnit === 'L/s' ? num(p.flow, 0) : NaN; // L/s
      if (!isFinite(Q)) throw new Error('Base concentração exige vazão em L/s ou m³/h');
      let sv = th.ids.indexOf(p.solvent); if (sv < 0) sv = th.ids.indexOf('water'); if (sv < 0) sv = th.c.findIndex(c => !c.nv && !c.solid); if (sv < 0) sv = 0;
      const vm = th.c.map(c => c.mw / c.rho); // L/mol
      const Cs = th.ids.map((id, i) => (i === sv ? 0 : Math.max(0, num(comp[id], 0))));
      const occ = Cs.reduce((a, c, i) => a + c * vm[i], 0);
      if (occ >= 1) throw new Error('Concentrações somam mais que 1 L de soluto por litro');
      Cs[sv] = (1 - occ) / vm[sv];
      const P = num(p.P, 1.01325) * BAR, flows = Cs.map(c => c * Q);
      return { out: { out: mkStream(th, flows, C2K(num(p.T, 25)), P) }, res: [{ k: 'Concentração do solvente (' + th.c[sv].name + ')', v: Cs[sv], u: 'mol/L' }, { k: 'Vazão molar total', v: sum(flows) / KMOLH, u: 'kmol/h' }] };
    }
    let w = th.ids.map(id => Math.max(0, num(comp[id], 0)));
    const s = sum(w); if (!(s > 0)) throw new Error('Composição vazia');
    w = w.map(v => v / s);
    let z = w;
    if (p.basis === 'mássica') { const m = w.map((v, i) => v / th.c[i].mw); z = N.normalize(m); }
    const mw = th.mw(z), flow = num(p.flow, 0);
    let F; // mol/s
    if (p.flowUnit === 'kg/h') F = flow / 3600 / (mw / 1000); else if (p.flowUnit === 'mol/s') F = flow; else F = flow * KMOLH;
    const P = num(p.P, 1.01325) * BAR, flows = z.map(v => v * F);
    if (p.vf !== '' && p.vf !== null && p.vf !== undefined && !isNaN(+p.vf)) {
      const fl = th.flashPVF(z, P, clamp(+p.vf, 0, 1)); return { out: { out: mkStream(th, flows, fl.T, P, fl) }, res: [{ k: 'Temperatura calculada', v: K2C(fl.T), u: '°C' }] };
    }
    return { out: { out: mkStream(th, flows, C2K(num(p.T, 25)), P) }, res: [] };
  };
  IMPL.product = function () { return { out: {}, res: [] }; };

  IMPL.mixer = function (th, b, ins) {
    const list = Object.keys(ins).map(k => ins[k]).filter(s => s && s.F > 0);
    if (!list.length) return { out: { out: mkStream(th, new Array(th.n).fill(0), 298.15, 101325) }, res: [] };
    const P = b.params.P !== '' && b.params.P != null && !isNaN(+b.params.P) ? +b.params.P * BAR : Math.min.apply(null, list.map(s => s.P));
    const flows = addFlows(list, th.n), H = sum(list.map(s => s.H));
    const Tg = sum(list.map(s => s.T * s.F)) / sum(list.map(s => s.F));
    const out = streamPH(th, flows, P, H, Tg);
    return { out: { out }, res: [{ k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }, { k: 'Pressão de saída', v: P / BAR, u: 'bar' }] };
  };

  IMPL.splitter = function (th, b, ins) {
    const s = ins.in, f1 = clamp(num(b.params.f1, 0.5), 0, 1), f2 = clamp(num(b.params.f2, 1 - f1), 0, 1 - f1), f3 = Math.max(0, 1 - f1 - f2);
    const mk = f => mkStream(th, s.flows.map(v => v * f), s.T, s.P);
    return { out: { out1: mk(f1), out2: mk(f2), out3: mk(f3) }, res: [{ k: 'Frações (1/2/3)', v: [f1, f2, f3].map(v => v.toFixed(3)).join(' / '), u: '' }] };
  };

  IMPL.separator = function (th, b, ins) {
    const s = ins.in, sp = b.params.splits || {};
    const f1 = s.flows.map((v, i) => v * clamp(num(sp[th.ids[i]], 0.5), 0, 1));
    const f2 = s.flows.map((v, i) => v - f1[i]);
    const o1 = mkStream(th, f1, s.T, s.P), o2 = mkStream(th, f2, s.T, s.P);
    return { out: { out1: o1, out2: o2 }, res: [{ k: 'Carga térmica', v: kW(o1.H + o2.H - s.H), u: 'kW' }] };
  };

  function heaterLike(th, b, ins, sign) {
    const s = ins.in, p = b.params, P = s.P - num(p.dP, 0) * BAR; let out;
    if (p.mode === 'Carga térmica') out = streamPH(th, s.flows, P, s.H + sign * num(p.Q, 0) * 1000, s.T);
    else if (p.mode === 'Fração vaporizada') { const fl = th.flashPVF(s.z, P, clamp(num(p.vf, 1), 0, 1)); out = mkStream(th, s.flows, fl.T, P, fl); }
    else out = mkStream(th, s.flows, C2K(num(p.T, 25)), P);
    const Q = out.H - s.H;
    return { out: { out }, res: [{ k: 'Carga térmica', v: kW(Q), u: 'kW' }, { k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }, { k: 'Fração vaporizada de saída', v: out.beta, u: '' }], duty: Q };
  }
  IMPL.heater = (th, b, ins) => heaterLike(th, b, ins, 1);
  IMPL.cooler = (th, b, ins) => heaterLike(th, b, ins, -1);

  IMPL.pump = function (th, b, ins) {
    const s = ins.in, P2 = num(b.params.P, 5) * BAR, eff = clamp(num(b.params.eff, 0.75), 0.05, 1);
    const vol = s.F * th.vL(s.x) * (1 - s.beta) + (s.beta > 0 ? s.F * s.beta * R * s.T / s.P : 0);
    const W = vol * (P2 - s.P) / eff; const out = streamPH(th, s.flows, P2, s.H + W, s.T);
    const warn = s.beta > 0.001 ? ['Bomba recebendo corrente com vapor (fração ' + s.beta.toFixed(3) + ') — risco de cavitação.'] : [];
    return { out: { out }, res: [{ k: 'Potência', v: kW(W), u: 'kW' }, { k: 'Vazão volumétrica', v: vol * 3600, u: 'm³/h' }, { k: 'Δ pressão', v: (P2 - s.P) / BAR, u: 'bar' }, { k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }], warn, duty: W, power: true };
  };
  IMPL.compressor = function (th, b, ins) {
    const s = ins.in, P2 = num(b.params.P, 5) * BAR, eff = clamp(num(b.params.eff, 0.75), 0.05, 1);
    let T2s = s.T;
    for (let it = 0; it < 5; it++) { const cp = th.cpIG(s.z, 0.5 * (s.T + T2s)); const k = cp / (cp - R); T2s = s.T * Math.pow(P2 / s.P, (k - 1) / k); }
    const cp = th.cpIG(s.z, 0.5 * (s.T + T2s)), W = s.F * cp * (T2s - s.T) / eff;
    const out = streamPH(th, s.flows, P2, s.H + W, s.T + (T2s - s.T) / eff);
    const warn = s.beta < 0.999 ? ['Compressor recebendo líquido (fração vaporizada ' + s.beta.toFixed(3) + ').'] : [];
    return { out: { out }, res: [{ k: 'Potência', v: kW(W), u: 'kW' }, { k: 'T isentrópica', v: K2C(T2s), u: '°C' }, { k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }, { k: 'Razão de compressão', v: P2 / s.P, u: '' }], warn, duty: W, power: true };
  };
  IMPL.valve = function (th, b, ins) {
    const s = ins.in, P2 = num(b.params.P, 1.01325) * BAR, out = streamPH(th, s.flows, P2, s.H, s.T);
    return { out: { out }, res: [{ k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }, { k: 'Fração vaporizada', v: out.beta, u: '' }, { k: 'Δ pressão', v: (s.P - P2) / BAR, u: 'bar' }] };
  };

  /* ---------------- trocadores de calor (casco-tubo e placas) */
  function Fshell(R_, P_, shellPasses) {
    if (P_ <= 0) return 1;
    const onePass = (Rr, Pp) => {
      if (Math.abs(Rr - 1) < 1e-6) { const s = Math.SQRT2; const num_ = s * Pp / (1 - Pp); const den = Math.log((2 - Pp * (2 - s)) / (2 - Pp * (2 + s))); return num_ / den; }
      const S = Math.sqrt(Rr * Rr + 1), a = Math.log((1 - Pp) / (1 - Pp * Rr)), d = Math.log((2 - Pp * (Rr + 1 - S)) / (2 - Pp * (Rr + 1 + S)));
      return S * a / ((Rr - 1) * d);
    };
    if (shellPasses === 2) { // converte P para um casco equivalente
      let P1;
      if (Math.abs(R_ - 1) < 1e-6) P1 = P_ / (2 - P_);
      else { const X = Math.pow((1 - P_ * R_) / (1 - P_), 0.5); P1 = (X - 1) / (X - R_); }
      return onePass(R_, P1);
    }
    return onePass(R_, P_);
  }
  function hx(th, b, ins, plate) {
    const p = b.params, h = ins.hot_in, c = ins.cold_in;
    if (!h || !c) throw new Error('Conecte as correntes quente e fria');
    if (h.T < c.T) throw new Error('A corrente na porta "quente" está mais fria que a "fria". Inverta as conexões.');
    const Ph = h.P - num(p.dPh, 0) * BAR, Pc = c.P - num(p.dPc, 0) * BAR;
    const outs = Q => [streamPH(th, h.flows, Ph, h.H - Q, h.T), streamPH(th, c.flows, Pc, c.H + Q, c.T)];
    const tp = plate ? 1 : +(p.tubePasses || 2), sp = plate ? 1 : +(p.shellPasses || 1);
    const lmtdF = (ho, co) => {
      const dT1 = h.T - co.T, dT2 = ho.T - c.T;
      if (dT1 <= 0 || dT2 <= 0) return { bad: true, dT1, dT2 };
      const lm = Math.abs(dT1 - dT2) < 1e-9 ? dT1 : (dT1 - dT2) / Math.log(dT1 / dT2);
      let F = 1;
      if (!plate && tp > 1) { const Rr = (h.T - ho.T) / Math.max(co.T - c.T, 1e-9), Pp = (co.T - c.T) / (h.T - c.T); F = Fshell(Rr, Pp, sp); if (!isFinite(F) || F <= 0) F = NaN; }
      return { lm, F, dT1, dT2 };
    };
    let Q, ho, co; const spec = p.spec || 'T saída quente', val = num(p.value, 0);
    if (spec === 'T saída quente') { ho = mkStream(th, h.flows, C2K(val), Ph); Q = h.H - ho.H; co = streamPH(th, c.flows, Pc, c.H + Q, c.T); }
    else if (spec === 'T saída fria') { co = mkStream(th, c.flows, C2K(val), Pc); Q = co.H - c.H; ho = streamPH(th, h.flows, Ph, h.H - Q, h.T); }
    else if (spec === 'Carga térmica') { Q = val * 1000;[ho, co] = outs(Q); }
    else { // UA
      const UA = val; const hMin = mkStream(th, h.flows, c.T, Ph), cMax = mkStream(th, c.flows, h.T, Pc);
      const Qmax = Math.min(h.H - hMin.H, cMax.H - c.H);
      const f = Q => { const [a, bb] = outs(Q); const r = lmtdF(a, bb); if (r.bad) return -1e12; return UA * r.lm * (isNaN(r.F) ? 0.01 : r.F) - Q; };
      Q = N.brent(f, Qmax * 1e-6, Qmax * 0.999999, 1e-6 * Qmax);[ho, co] = outs(Q);
    }
    if (Q < 0) throw new Error('Carga térmica negativa: a especificação exige transferir calor do lado frio para o quente.');
    const r = lmtdF(ho, co); const warn = [];
    if (r.bad) throw new Error('Cruzamento de temperatura (ΔT terminal ≤ 0). Ajuste a especificação.');
    let F = r.F, shellsUsed = sp;
    if (!plate && tp > 1 && (isNaN(F) || F < 0.75)) {
      const Rr = (h.T - ho.T) / Math.max(co.T - c.T, 1e-9), Pp = (co.T - c.T) / (h.T - c.T);
      let found = false;
      for (let ns = sp + 1; ns <= 6; ns++) { const Fn = Fshell(Rr, ns === 2 ? Pp : Pp, ns === 2 ? 2 : 1); const Fg = ns === 2 ? Fn : Fshell(Rr, Pp, 2); if (ns === 2 && isFinite(Fn) && Fn >= 0.75) { F = Fn; shellsUsed = 2; found = true; break; } if (ns > 2 && isFinite(Fg) && Fg >= 0.75) { F = Fg; shellsUsed = 2; found = true; break; } }
      if (found) warn.push('Com ' + sp + ' casco(s) o fator F seria inviável/baixo; área calculada para ' + shellsUsed + ' cascos em série (F = ' + F.toFixed(3) + ').');
      else { F = 1; warn.push('Fator F inviável para casco-tubo multipasse (cruzamento interno de temperatura). Área calculada como contracorrente pura — considere vários cascos em série.'); }
    }
    const U = num(p.U, 800), A = Q / (U * F * r.lm);
    // perfil T–Q
    const prof = { Q: [], Th: [], Tc: [] };
    for (let k = 0; k <= 20; k++) { const q = Q * k / 20; const hs = streamPH(th, h.flows, Ph, ho.H + q, ho.T), cs = streamPH(th, c.flows, Pc, c.H + q, c.T); prof.Q.push(kW(q)); prof.Th.push(K2C(hs.T)); prof.Tc.push(K2C(cs.T)); }
    const minAp = Math.min.apply(null, prof.Th.map((t, k) => t - prof.Tc[k]));
    if (minAp < 3) warn.push('Aproximação mínima de temperatura de ' + minAp.toFixed(1) + ' °C — área muito grande.');
    const res = [{ k: 'Carga térmica', v: kW(Q), u: 'kW' }, { k: 'T saída quente', v: K2C(ho.T), u: '°C' }, { k: 'T saída fria', v: K2C(co.T), u: '°C' },
      { k: 'MLDT', v: r.lm, u: '°C' }, { k: 'Fator de correção F', v: F, u: '' }, { k: 'Cascos em série', v: plate ? 1 : shellsUsed, u: '' }, { k: 'UA', v: Q / (F * r.lm), u: 'W/K' }, { k: 'Área de troca', v: A, u: 'm²' }, { k: 'Aproximação mínima', v: minAp, u: '°C' }];
    if (plate) res.push({ k: 'Nº de placas estimado', v: Math.ceil(A / num(p.plateArea, 0.5)) + 1, u: '' });
    else { const dOut = num(p.tubeD, 19.05) / 1000, L = num(p.tubeL, 4.88); const nt = A / (Math.PI * dOut * L); res.push({ k: 'Nº de tubos estimado', v: Math.ceil(nt), u: '' }); }
    return { out: { hot_out: ho, cold_out: co }, res, warn, duty: Q, plots: [{ kind: 'TQ', title: (plate ? 'Trocador de placas' : 'Trocador casco e tubo') + ' — perfil T × Q', data: prof }] };
  }
  IMPL.hx_shell = (th, b, ins) => hx(th, b, ins, false);
  IMPL.hx_plate = (th, b, ins) => hx(th, b, ins, true);

  /* ---------------- flash e decantador */
  IMPL.flash = function (th, b, ins) {
    const s = ins.in, p = b.params, P = num(p.P, s.P / BAR) * BAR; let fl;
    if (p.mode === 'Adiabático') fl = th.flashPH(s.z, P, s.h, s.T);
    else if (p.mode === 'Carga térmica') fl = th.flashPH(s.z, P, s.h + num(p.Q, 0) * 1000 / s.F, s.T);
    else if (p.mode === 'Fração vaporizada') fl = th.flashPVF(s.z, P, clamp(num(p.vf, 0.5), 0, 1));
    else fl = th.flashTP(s.z, C2K(num(p.T, 25)), P);
    const V = s.F * fl.beta, L = s.F - V;
    const vap = mkStream(th, fl.y.map(v => v * V), fl.T, P, { T: fl.T, P, beta: 1, x: fl.x, y: fl.y, phase: 'V' });
    const liq = mkStream(th, fl.x.map(v => v * L), fl.T, P, { T: fl.T, P, beta: 0, x: fl.x, y: fl.y, phase: 'L' });
    const Q = vap.H + liq.H - s.H;
    const res = [{ k: 'Temperatura', v: K2C(fl.T), u: '°C' }, { k: 'Pressão', v: P / BAR, u: 'bar' }, { k: 'Fração vaporizada', v: fl.beta, u: '' }, { k: 'Carga térmica', v: kW(Q), u: 'kW' }];
    th.ids.forEach((id, i) => { if (s.z[i] > 1e-6 && !th.c[i].solid && !th.c[i].nv) res.push({ k: 'K (' + th.c[i].name + ')', v: fl.K[i], u: '' }); });
    return { out: { vapor: vap, liquid: liq }, res, duty: Q };
  };

  IMPL.decanter = function (th, b, ins) {
    const s = ins.in, T = C2K(num(b.params.T, 25)), P = num(b.params.P, 1.01325) * BAR;
    const ll = th.flashLL(s.z, T); const warn = [];
    let light, heavy;
    if (!ll) {
      warn.push('Mistura monofásica a ' + K2C(T).toFixed(1) + ' °C (ou modelo sem ELL: use NRTL, UNIQUAC ou UNIFAC). Tudo segue para a saída pesada.');
      light = mkStream(th, new Array(th.n).fill(0), T, P); heavy = mkStream(th, s.flows, T, P);
    } else {
      const nI = ll.xI.map(v => v * s.F * ll.beta), nII = ll.xII.map(v => v * s.F * (1 - ll.beta));
      const rI = th.rhoL(ll.xI), rII = th.rhoL(ll.xII);
      const fl0 = x => ({ T, P, beta: 0, x, y: x, phase: 'L' });
      const a = mkStream(th, nI, T, P, fl0(ll.xI)), c = mkStream(th, nII, T, P, fl0(ll.xII));
      if (rI <= rII) { light = a; heavy = c; } else { light = c; heavy = a; }
    }
    const Q = light.H + heavy.H - s.H;
    const res = [{ k: 'Fases líquidas', v: ll ? 2 : 1, u: '' }, { k: 'Fração da fase leve (molar)', v: light.F / s.F, u: '' }, { k: 'Densidade fase leve', v: light.F ? th.rhoL(light.z) : 0, u: 'kg/m³' }, { k: 'Densidade fase pesada', v: heavy.F ? th.rhoL(heavy.z) : 0, u: 'kg/m³' }, { k: 'Carga térmica', v: kW(Q), u: 'kW' }];
    return { out: { light, heavy }, res, warn, duty: Q };
  };

  /* ---------------- coluna shortcut Fenske–Underwood–Gilliland–Kirkbride */
  IMPL.column_short = function (th, b, ins) {
    const s = ins.feed, p = b.params, P = num(p.P, 1.01325) * BAR, n = th.n;
    const lk = th.ids.indexOf(p.lk), hk = th.ids.indexOf(p.hk);
    if (lk < 0 || hk < 0) throw new Error('Defina as chaves leve e pesada');
    const rl = clamp(num(p.lkRec, 0.99), 0.5, 0.99999), rh = clamp(num(p.hkRec, 0.99), 0.5, 0.99999);
    const f = s.flows; let d = new Array(n).fill(0), bb = new Array(n).fill(0);
    let Ttop = th.bubbleT(s.z, P).T, Tbot = Ttop + 20;
    let alpha, Nmin;
    for (let it = 0; it < 6; it++) {
      const Kt = th.K(Ttop, P, d.some(v => v > 0) ? N.normalize(d) : s.z, s.z), Kb = th.K(Tbot, P, bb.some(v => v > 0) ? N.normalize(bb) : s.z, s.z);
      alpha = Kt.map((k, i) => Math.sqrt((k / Kt[hk]) * (Kb[i] / Kb[hk])));
      if (alpha[lk] <= 1) throw new Error('Chave leve não é mais volátil que a chave pesada nestas condições');
      const dl = f[lk] * rl, bl = f[lk] - dl, bh = f[hk] * rh, dh = f[hk] - bh;
      Nmin = Math.log((dl / bl) * (bh / dh)) / Math.log(alpha[lk]);
      for (let i = 0; i < n; i++) {
        if (i === lk) { d[i] = dl; bb[i] = bl; continue; } if (i === hk) { d[i] = dh; bb[i] = bh; continue; }
        if (th.c[i].nv || th.c[i].solid) { d[i] = 0; bb[i] = f[i]; continue; }
        const ratio = (dh / bh) * Math.pow(alpha[i], Nmin); d[i] = f[i] * ratio / (1 + ratio); bb[i] = f[i] - d[i];
      }
      Ttop = th.bubbleT(N.normalize(d), P).T; Tbot = th.bubbleT(N.normalize(bb), P).T;
    }
    const D = sum(d), B = sum(bb), xD = d.map(v => v / D), xB = bb.map(v => v / B);
    const q = 1 - s.beta;
    const und = th_ => sum(s.z.map((z, i) => alpha[i] * z / (alpha[i] - th_))) - (1 - q);
    const theta = N.brent(und, alpha[hk] + 1e-6, alpha[lk] - 1e-6, 1e-12);
    const Rmin = Math.max(1e-3, sum(xD.map((x, i) => alpha[i] * x / (alpha[i] - theta))) - 1);
    const Rr = Rmin * num(p.RRmin, 1.3), X = (Rr - Rmin) / (Rr + 1);
    const Y = 1 - Math.exp((1 + 54.4 * X) / (11 + 117.2 * X) * (X - 1) / Math.sqrt(X));
    const Nst = (Y + Nmin) / (1 - Y);
    const ratio = Math.pow((s.z[hk] / s.z[lk]) * Math.pow(xB[lk] / xD[hk], 2) * (B / D), 0.206);
    const NR = Nst * ratio / (1 + ratio);
    const dist = mkStream(th, d, Ttop, P), bot = mkStream(th, bb, Tbot, P);
    const yV = xD, HV = th.hV(yV, th.dewT(yV, P).T, P);
    const Qc = (Rr + 1) * D * (dist.h - HV), Qr = dist.H + bot.H - s.H - Qc;
    const res = [{ k: 'Nº mínimo de estágios (Fenske)', v: Nmin, u: '' }, { k: 'Refluxo mínimo (Underwood)', v: Rmin, u: '' }, { k: 'Razão de refluxo', v: Rr, u: '' },
      { k: 'Nº de estágios teóricos (Gilliland)', v: Nst, u: '' }, { k: 'Estágio ótimo de alimentação (Kirkbride, do topo)', v: Math.round(NR) + 1, u: '' },
      { k: 'α chave leve / chave pesada', v: alpha[lk], u: '' }, { k: 'Vazão de destilado', v: D / KMOLH, u: 'kmol/h' }, { k: 'Vazão de fundo', v: B / KMOLH, u: 'kmol/h' },
      { k: 'T topo', v: K2C(Ttop), u: '°C' }, { k: 'T fundo', v: K2C(Tbot), u: '°C' }, { k: 'Carga do condensador', v: kW(Qc), u: 'kW' }, { k: 'Carga do refervedor', v: kW(Qr), u: 'kW' }];
    return { out: { distillate: dist, bottoms: bot }, res, duties: { Qc, Qr }, duty: Qr };
  };

  /* ---------------- coluna rigorosa — método do ponto de bolha (Wang–Henke) com balanços de energia */
  function solveColumn(th, cfg) {
    // estratégia: BP curto → Newton (Naphtali–Sandholm); se falhar, BP longo → Newton a partir do estado final
    if (cfg.maxBP) return solveColumnBP(th, cfg);
    const first = solveColumnBP(th, Object.assign({}, cfg, { maxBP: 45 }));
    if (first.converged) return first;
    const second = solveColumnBP(th, Object.assign({}, cfg, { maxBP: 400 }));
    return second;
  }
  function solveColumnBP(th, cfg) {
    const n = th.n, Ns = cfg.N, D = cfg.D, R_ = cfg.R, partial = cfg.partial;
    const Pst = []; for (let j = 0; j < Ns; j++) Pst.push(cfg.P + j * cfg.dP);
    const fF = [], Fj = new Array(Ns).fill(0), hF = new Array(Ns).fill(0), FH = new Array(Ns).fill(0);
    for (let j = 0; j < Ns; j++) fF.push(new Array(n).fill(0));
    cfg.feeds.forEach(fd => { const j = fd.j; fd.s.flows.forEach((v, i) => { fF[j][i] += v; }); Fj[j] += fd.s.F; FH[j] += fd.s.H; });
    for (let j = 0; j < Ns; j++) hF[j] = Fj[j] > 0 ? FH[j] / Fj[j] : 0;
    const Ftot = sum(Fj), U = new Array(Ns).fill(0), W = new Array(Ns).fill(0);
    if (!partial) U[0] = D;
    if (cfg.sideStage > 0 && cfg.sideFlow > 0) U[cfg.sideStage] += cfg.sideFlow;
    const V0 = partial ? D : 0;
    const B = Ftot - D - sum(U) + (partial ? 0 : D);
    if (B <= 0) throw new Error('Vazão de fundo não positiva: reduza D ou a retirada lateral');
    // estimativas iniciais
    const zF = N.normalize(addFlows(cfg.feeds.map(f => f.s), n));
    const Tb0 = th.bubbleT(zF, Pst[0]).T, Kf = th.K(Tb0, Pst[0], zF, zF);
    const order = zF.map((v, i) => i).sort((a, c) => Kf[c] - Kf[a]);
    let dist = new Array(n).fill(0), rem = D;
    const totFlows = addFlows(cfg.feeds.map(f => f.s), n);
    order.forEach(i => { const take = Math.min(rem, totFlows[i] * 0.999); dist[i] = take; rem -= take; });
    const xD0 = N.normalize(dist.map(v => v + 1e-9)), xB0 = N.normalize(totFlows.map((v, i) => Math.max(v - dist[i], 0) + 1e-9));
    let T = new Array(Ns), x = [], y = [];
    const Tt = th.bubbleT(xD0, Pst[0]).T, Tbt = th.bubbleT(xB0, Pst[Ns - 1]).T;
    for (let j = 0; j < Ns; j++) { const w = j / (Ns - 1); T[j] = Tt + w * (Tbt - Tt); x.push(xD0.map((v, i) => (1 - w) * v + w * xB0[i])); y.push(x[j].slice()); }
    let V = new Array(Ns).fill(0);
    V[0] = V0; V[1] = R_ * D + D;
    for (let j = 2; j < Ns; j++) { V[j] = V[j - 1]; }
    let L = new Array(Ns).fill(0), K = [];
    let converged = false, it, Tprev = null, Vprev = null, incPrev = null, lastDem = 0;
    const cum = (arr, j) => { let s = 0; for (let m = 0; m <= j; m++) s += arr[m]; return s; };
    for (it = 0; it < cfg.maxBP; it++) {
      for (let j = 0; j < Ns - 1; j++) L[j] = V[j + 1] + cum(Fj, j) - cum(U, j) - cum(W, j) - V0;
      L[Ns - 1] = cum(Fj, Ns - 1) - cum(U, Ns - 1) - cum(W, Ns - 1) - V0;
      if (L.some((v, j) => j < Ns && v <= 0)) throw new Error('Vazão de líquido não positiva na coluna — aumente o refluxo ou revise as especificações');
      K = []; for (let j = 0; j < Ns; j++) K.push(th.K(T[j], Pst[j], x[j], y[j]));
      const xn = []; for (let j = 0; j < Ns; j++) xn.push(new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        const a = new Array(Ns), bd = new Array(Ns), c = new Array(Ns), d = new Array(Ns);
        for (let j = 0; j < Ns; j++) {
          a[j] = j > 0 ? L[j - 1] : 0;
          bd[j] = -((j === 0 ? V0 : V[j]) + W[j]) * K[j][i] - (L[j] + U[j]);
          c[j] = j < Ns - 1 ? V[j + 1] * K[j + 1][i] : 0;
          d[j] = -fF[j][i];
        }
        const sol = N.thomas(a, bd, c, d);
        for (let j = 0; j < Ns; j++) xn[j][i] = Math.max(sol[j], 0);
      }
      // método θ (Holland): impõe o balanço global por componente com a vazão de destilado especificada
      if (!(cfg.sideStage > 0 && cfg.sideFlow > 0)) {
        const dC = new Array(n), bC = new Array(n), ftot = new Array(n).fill(0);
        for (let j = 0; j < Ns; j++) for (let i = 0; i < n; i++) ftot[i] += fF[j][i];
        for (let i = 0; i < n; i++) { dC[i] = partial ? V0 * K[0][i] * xn[0][i] : U[0] * xn[0][i]; bC[i] = L[Ns - 1] * xn[Ns - 1][i]; }
        const ratio = dC.map((d, i) => (d > 1e-300 ? bC[i] / d : 1e300));
        const gth = lt => { const th_ = Math.exp(lt); let s = 0; for (let i = 0; i < n; i++) if (ftot[i] > 0) s += ftot[i] / (1 + th_ * ratio[i]); return s - D; };
        let theta = 1;
        try { const br = N.bracket(gth, -1, 1, -60, 60); if (br) theta = Math.exp(N.brent(gth, br[0], br[1], 1e-12)); } catch (e) { theta = 1; }
        for (let i = 0; i < n; i++) {
          if (!(ftot[i] > 0)) continue;
          const dco = ftot[i] / (1 + theta * ratio[i]), bco = ftot[i] - dco;
          const fac = dC[i] > 1e-12 * ftot[i] ? dco / dC[i] : (bC[i] > 1e-300 ? bco / bC[i] : 1);
          if (isFinite(fac) && fac > 0) for (let j = 0; j < Ns; j++) xn[j][i] *= fac;
        }
      }
      const Tn = new Array(Ns), yn = [];
      let dT = 0;
      for (let j = 0; j < Ns; j++) {
        x[j] = N.normalize(xn[j].map(v => v + 1e-300));
        const bp = th.bubbleT(x[j], Pst[j], T[j]); Tn[j] = bp.T; yn.push(bp.y);
        dT = Math.max(dT, Math.abs(Tn[j] - T[j]));
      }
      const relax = it < 5 ? 0.6 : 1;
      for (let j = 0; j < Ns; j++) T[j] = relax * Tn[j] + (1 - relax) * T[j];
      y = yn;
      // balanço de energia → vazões de vapor
      const hL = [], HV = [];
      for (let j = 0; j < Ns; j++) { hL.push(th.hL(x[j], T[j], Pst[j])); HV.push(th.hV(y[j], T[j], Pst[j])); }
      const Vn = V.slice(); Vn[1] = L[0] + U[0] + V0 - Fj[0];
      let dV = 0;
      for (let j = 1; j < Ns - 1; j++) {
        const alpha = hL[j - 1] - HV[j], beta = HV[j + 1] - hL[j];
        const gamma = (cum(Fj, j - 1) - cum(W, j - 1) - cum(U, j - 1) - V0) * (hL[j] - hL[j - 1]) + Fj[j] * (hL[j] - hF[j]) + W[j] * (HV[j] - hL[j]);
        Vn[j + 1] = (gamma - alpha * Vn[j]) / beta;
        if (!(Vn[j + 1] > 0)) Vn[j + 1] = 1e-3 * V[1];
      }
      const Told = Tprev || T.slice();
      for (let j = 1; j < Ns; j++) { dV = Math.max(dV, Math.abs(Vn[j] - V[j]) / V[1]); { const rv = it < 3 ? 0.5 : 1; V[j] = rv * Vn[j] + (1 - rv) * V[j]; } }
      // aceleração por extrapolação do autovalor dominante (DEM) sobre o perfil de T e V
      const inc = T.map((t, j) => t - Told[j]).concat(V.map((v, j) => (v - (Vprev ? Vprev[j] : v)) / V[1] * 100));
      if (incPrev && it > 8 && it - lastDem > 4) {
        const n1 = Math.sqrt(inc.reduce((a, v) => a + v * v, 0)), n0 = Math.sqrt(incPrev.reduce((a, v) => a + v * v, 0)), lam = n1 / n0;
        const dot = inc.reduce((a, v, k) => a + v * incPrev[k], 0) / (n1 * n0 + 1e-300);
        if (lam > 0.8 && lam < 0.995 && dot > 0.99) {
          const fct = Math.min(lam / (1 - lam), 50);
          for (let j = 0; j < Ns; j++) T[j] += fct * inc[j];
          for (let j = 1; j < Ns; j++) V[j] = Math.max(V[j] + fct * inc[Ns + j] * V[1] / 100, 1e-6 * V[1]);
          lastDem = it;
        }
      }
      incPrev = inc; Tprev = T.slice(); Vprev = V.slice();
      if (dT < 1e-4 && dV < 1e-6 && it > 3) { converged = true; break; }
    }
    for (let j = 0; j < Ns - 1; j++) L[j] = V[j + 1] + cum(Fj, j) - cum(U, j) - cum(W, j) - V0;
    L[Ns - 1] = cum(Fj, Ns - 1) - cum(U, Ns - 1) - cum(W, Ns - 1) - V0;
    const hL = [], HV = []; for (let j = 0; j < Ns; j++) { hL.push(th.hL(x[j], T[j], Pst[j])); HV.push(th.hV(y[j], T[j], Pst[j])); }
    const Qc = (L[0] + U[0]) * hL[0] + V0 * HV[0] - V[1] * HV[1] - Fj[0] * hF[0]; // negativo = calor removido
    const j = Ns - 1;
    const Qr = L[j] * hL[j] + V[j] * HV[j] + U[j] * hL[j] - L[j - 1] * hL[j - 1] - Fj[j] * hF[j];
    const out = { T, x, y, L, V, U, Qc, Qr, P: Pst, it, converged, B: L[Ns - 1], D, Ftot, Fj, partial, method: 'Ponto de bolha (Wang–Henke + θ)' };
    if (!converged && !cfg.noNewton) {
      try { const ns = newtonColumn(th, { Ns, n, Pst, fF, Fj, hF, U, partial, R: R_, D, B, Ftot }, out); if (ns) return ns; } catch (e) { out.nsError = e.message; }
    }
    return out;
  }

  /* Naphtali–Sandholm: Newton simultâneo (vazões de componentes + T por estágio), Jacobiano bloco-tridiagonal numérico */
  function newtonColumn(th, c, init) {
    const n = c.n, Ns = c.Ns, m = 2 * n + 1, total = !c.partial, Ftot = c.Ftot;
    const X = [];
    for (let j = 0; j < Ns; j++) {
      const row = new Array(m);
      for (let i = 0; i < n; i++) row[i] = Math.max(init.L[j] * init.x[j][i], 1e-14 * Ftot);
      for (let i = 0; i < n; i++) row[n + i] = (j === 0 && total) ? init.y[0][i] : Math.max((j === 0 ? c.D : init.V[j]) * init.y[j][i], 1e-14 * Ftot);
      row[2 * n] = init.T[j]; X.push(row);
    }
    const props = (j, Xj) => {
      const l = Xj.slice(0, n), v = Xj.slice(n, 2 * n), T = Xj[2 * n];
      const L = N.sum(l), x = l.map(a => a / L);
      let V, y; if (j === 0 && total) { V = 0; y = N.normalize(v.map(a => Math.max(a, 1e-300))); } else { V = N.sum(v); y = v.map(a => a / V); }
      const K = th.K(T, c.Pst[j], x, y);
      return { l, v, T, L, V, x, y, K, hL: th.hL(x, T, c.Pst[j]), hV: th.hV(y, T, c.Pst[j]) };
    };
    const HS = Ftot * 4e4;
    const resid = (j, P) => {
      const p = P[j], pm = j > 0 ? P[j - 1] : null, pp = j < Ns - 1 ? P[j + 1] : null, F = new Array(m);
      for (let i = 0; i < n; i++) {
        let outF = p.l[i] + (j === 0 && total ? 0 : p.v[i]) + (j === 0 && total ? p.l[i] / c.R : c.U[j] * p.x[i]);
        let inF = (pm ? pm.l[i] : 0) + (pp ? pp.v[i] : 0) + c.fF[j][i];
        F[i] = (outF - inF) / Ftot;
        F[n + i] = (j === 0 && total) ? p.v[i] - p.K[i] * p.x[i] : p.K[i] * p.x[i] - p.y[i];
      }
      if (j === 0) F[2 * n] = total ? (N.sum(p.v) - 1) : (p.L - c.R * p.V) / Ftot;
      else if (j === Ns - 1) F[2 * n] = (p.L - c.B) / Ftot;
      else F[2 * n] = ((p.L + c.U[j]) * p.hL + p.V * p.hV - pm.L * pm.hL - pp.V * pp.hV - c.Fj[j] * c.hF[j]) / HS;
      return F;
    };
    let P = X.map((r, j) => props(j, r));
    let Fv = P.map((p, j) => resid(j, P));
    const norm = Fa => Math.sqrt(Fa.reduce((s, f) => s + f.reduce((a, b) => a + b * b, 0), 0));
    let nrm = norm(Fv), iter;
    for (iter = 0; iter < 60 && nrm > 1e-10; iter++) {
      // Jacobiano em blocos
      const A = [], B = [], C = [];
      for (let j = 0; j < Ns; j++) { A.push(null); B.push(null); C.push(null); }
      const mk = () => { const M = []; for (let r = 0; r < m; r++) M.push(new Array(m).fill(0)); return M; };
      for (let k = 0; k < Ns; k++) {
        B[k] = mk(); if (k > 0) C[k - 1] = mk(); if (k < Ns - 1) A[k + 1] = mk();
        for (let q = 0; q < m; q++) {
          const old = X[k][q], h = q === 2 * n ? 1e-4 : 1e-7 * Math.max(Math.abs(old), 1e-8 * Ftot);
          X[k][q] = old + h; const pk = props(k, X[k]); const Pt = P.slice(); Pt[k] = pk;
          for (const jj of [k - 1, k, k + 1]) {
            if (jj < 0 || jj >= Ns) continue;
            const Fn = resid(jj, Pt), M = jj === k ? B[k] : jj === k - 1 ? C[k - 1] : A[k + 1];
            for (let r = 0; r < m; r++) M[r][q] = (Fn[r] - Fv[jj][r]) / h;
          }
          X[k][q] = old;
        }
      }
      // eliminação bloco-tridiagonal
      const Bp = [], dp = [], G = [];
      const solveM = (M, rhsCols) => rhsCols.map(col => N.solveLinear(M, col));
      for (let j = 0; j < Ns; j++) {
        let Bj = B[j].map(r => r.slice()), dj = Fv[j].map(v => -v);
        if (j > 0) {
          for (let r = 0; r < m; r++) for (let q = 0; q < m; q++) { let s2 = 0; for (let t = 0; t < m; t++) s2 += A[j][r][t] * G[j - 1][t][q]; Bj[r][q] -= s2; }
          const g = N.solveLinear(Bp[j - 1], dp[j - 1]);
          for (let r = 0; r < m; r++) { let s2 = 0; for (let t = 0; t < m; t++) s2 += A[j][r][t] * g[t]; dj[r] -= s2; }
        }
        Bp.push(Bj); dp.push(dj);
        if (j < Ns - 1) { const cols = []; for (let q = 0; q < m; q++) cols.push(C[j].map(r => r[q])); const sol = solveM(Bj, cols); const Gm = mk(); for (let q = 0; q < m; q++) for (let r = 0; r < m; r++) Gm[r][q] = sol[q][r]; G.push(Gm); }
      }
      const dX = new Array(Ns);
      dX[Ns - 1] = N.solveLinear(Bp[Ns - 1], dp[Ns - 1]);
      for (let j = Ns - 2; j >= 0; j--) { const g = N.solveLinear(Bp[j], dp[j]); dX[j] = g.map((v, r) => { let s2 = 0; for (let t = 0; t < m; t++) s2 += G[j][r][t] * dX[j + 1][t]; return v - s2; }); }
      // passo amortecido com limites físicos
      let lam = 1, accepted = false;
      for (let ls = 0; ls < 12; ls++) {
        const Xn = X.map((row, j) => row.map((v, q) => {
          let d = lam * dX[j][q];
          if (q === 2 * n) d = Math.max(-15, Math.min(15, d));
          const w = v + d; return q === 2 * n ? w : Math.max(w, 0.05 * v, 1e-16 * Ftot);
        }));
        let Pn; try { Pn = Xn.map((r, j) => props(j, r)); } catch (e) { lam *= 0.5; continue; }
        const Fn = Pn.map((p, j) => resid(j, Pn)), nn = norm(Fn);
        if (isFinite(nn) && nn < (1 - 1e-4 * lam) * nrm) { for (let j = 0; j < Ns; j++) X[j] = Xn[j]; P = Pn; Fv = Fn; nrm = nn; accepted = true; break; }
        lam *= 0.5;
      }
      if (!accepted) break;
    }
    if (!(nrm < 1e-7)) return null;
    const T = P.map(p => p.T), x = P.map(p => p.x), y = P.map((p, j) => (j === 0 && total ? p.y : p.y));
    const L = P.map(p => p.L), V = P.map((p, j) => (j === 0 && total ? 0 : p.V));
    const hL = P.map(p => p.hL), HV = P.map(p => p.hV);
    const D = total ? L[0] / c.R : V[0];
    const Qc = (L[0] + (total ? D : 0)) * hL[0] + (total ? 0 : V[0] * HV[0]) - V[1] * HV[1] - c.Fj[0] * c.hF[0];
    const jN = Ns - 1, Qr = L[jN] * hL[jN] + V[jN] * HV[jN] + c.U[jN] * hL[jN] - L[jN - 1] * hL[jN - 1] - c.Fj[jN] * c.hF[jN];
    return { T, x, y, L, V, U: c.U, Qc, Qr, P: c.Pst, it: init.it + iter, converged: true, B: L[jN], D, Ftot, Fj: c.Fj, partial: c.partial, method: 'Newton simultâneo (Naphtali–Sandholm)' };
  }

  IMPL.column = function (th, b, ins) {
    const p = b.params, n = th.n, Ns = Math.max(3, Math.round(num(p.N, 20)));
    const feeds = [];
    [['feed', 'feedStage'], ['feed2', 'feed2Stage'], ['feed3', 'feed3Stage']].forEach(([port, key]) => {
      const s = ins[port]; if (s && s.F > 0) feeds.push({ j: clamp(Math.round(num(p[key], 2)), 1, Ns) - 1, s, port });
    });
    if (!feeds.length) throw new Error('Coluna sem alimentação');
    const Ftot = sum(feeds.map(f => f.s.F));
    const Dval = num(p.D, 0.5), Dm = p.Dmode === 'Vazão D' ? Dval * KMOLH : Dval * Ftot;
    const cfgBase = { N: Ns, P: num(p.P, 1.01325) * BAR, dP: num(p.dP, 0) * BAR, partial: p.condenser === 'parcial', feeds,
      sideStage: Math.round(num(p.sideStage, 0)) - 1, sideFlow: num(p.sideFlow, 0) * KMOLH };
    let R_ = num(p.R, 2), D = Dm, sol, specInfo = null;
    const sc = th.ids.indexOf(p.specComp);
    const specType = p.specType || 'nenhuma';
    const specFn = (s) => {
      if (specType === 'pureza no destilado') return (s.partial ? s.y[0][sc] : s.x[0][sc]);
      if (specType === 'pureza no fundo') return s.x[Ns - 1][sc];
      const dflows = (s.partial ? s.y[0] : s.x[0]).map(v => v * s.D); return dflows[sc] / sum(feeds.map(f => f.s.flows[sc]));
    };
    if (specType !== 'nenhuma' && sc >= 0) {
      const target = num(p.specValue, 0.9), vary = p.specVary === 'D' ? 'D' : 'R';
      const run = v => solveColumn(th, Object.assign({}, cfgBase, vary === 'R' ? { R: v, D } : { R: R_, D: v }));
      const g = v => { try { return specFn(run(v)) - target; } catch (e) { return NaN; } };
      let lo, hi;
      if (vary === 'R') { lo = 0.05; hi = Math.max(2 * R_, 5); } else { lo = 0.02 * Ftot; hi = 0.98 * Ftot; }
      // varredura para isolar a raiz
      const grid = N.linspace(lo, hi, 9).map(v => [v, g(v)]).filter(a => isFinite(a[1]));
      let br = null; for (let k = 1; k < grid.length; k++) if (grid[k - 1][1] * grid[k][1] <= 0) { br = [grid[k - 1][0], grid[k][0]]; break; }
      if (vary === 'R' && !br) { const ext = [10, 20, 40].map(v => [v * Math.max(R_, 1), g(v * Math.max(R_, 1))]).filter(a => isFinite(a[1])); const all = grid.concat(ext); for (let k = 1; k < all.length; k++) if (all[k - 1][1] * all[k][1] <= 0) { br = [all[k - 1][0], all[k][0]]; break; } }
      if (br) {
        const v = N.brent(g, br[0], br[1], vary === 'R' ? 1e-5 : 1e-6 * Ftot);
        if (vary === 'R') R_ = v; else D = v;
        specInfo = { ok: true, vary, value: vary === 'R' ? R_ : D / KMOLH };
      } else specInfo = { ok: false };
    }
    sol = solveColumn(th, Object.assign({}, cfgBase, { R: R_, D }));
    const warn = [];
    if (!sol.converged) warn.push('Coluna não convergiu totalmente em ' + sol.it + ' iterações — verifique especificações.');
    if (specInfo && !specInfo.ok) warn.push('Especificação de projeto inatingível com a variável escolhida; resultado com os valores informados.');
    const top = sol.partial ? sol.y[0] : sol.x[0];
    const fl = (z, T, P, beta) => ({ T, P, beta, x: z, y: z, phase: beta ? 'V' : 'L' });
    const dist = mkStream(th, top.map(v => v * D), sol.T[0], sol.P[0], fl(top, sol.T[0], sol.P[0], sol.partial ? 1 : 0));
    const bot = mkStream(th, sol.x[Ns - 1].map(v => v * sol.B), sol.T[Ns - 1], sol.P[Ns - 1], fl(sol.x[Ns - 1], sol.T[Ns - 1], sol.P[Ns - 1], 0));
    const ss = cfgBase.sideStage;
    const side = ss > 0 && cfgBase.sideFlow > 0 ? mkStream(th, sol.x[ss].map(v => v * cfgBase.sideFlow), sol.T[ss], sol.P[ss], fl(sol.x[ss], sol.T[ss], sol.P[ss], 0)) : mkStream(th, new Array(n).fill(0), sol.T[0], sol.P[0]);
    const res = [{ k: 'Razão de refluxo', v: R_, u: '' }, { k: 'Vazão de destilado', v: D / KMOLH, u: 'kmol/h' }, { k: 'Vazão de fundo', v: sol.B / KMOLH, u: 'kmol/h' },
      { k: 'T topo (condensador)', v: K2C(sol.T[0]), u: '°C' }, { k: 'T fundo (refervedor)', v: K2C(sol.T[Ns - 1]), u: '°C' },
      { k: 'Carga do condensador', v: kW(sol.Qc), u: 'kW' }, { k: 'Carga do refervedor', v: kW(sol.Qr), u: 'kW' }, { k: 'Iterações', v: sol.it, u: '' }, { k: 'Método', v: sol.method, u: '' }];
    if (specInfo && specInfo.ok) res.unshift({ k: 'Especificação atingida variando ' + specInfo.vary, v: specInfo.value, u: specInfo.vary === 'R' ? '' : 'kmol/h' });
    th.ids.forEach((id, i) => { if (top[i] > 1e-4 || sol.x[Ns - 1][i] > 1e-4) res.push({ k: 'x ' + th.c[i].name + ' (destilado / fundo)', v: top[i].toFixed(4) + ' / ' + sol.x[Ns - 1][i].toFixed(4), u: '' }); });
    const plots = [];
    const stages = sol.T.map((t, j) => j + 1);
    plots.push({ kind: 'profileT', title: 'Perfil de temperatura', data: { stage: stages, T: sol.T.map(K2C) } });
    const active = th.ids.map((id, i) => i).filter(i => sol.x.some(r => r[i] > 1e-4));
    plots.push({ kind: 'profileX', title: 'Perfil de composição do líquido', data: { stage: stages, series: active.map(i => ({ name: th.c[i].name, v: sol.x.map(r => r[i]) })) } });
    plots.push({ kind: 'profileF', title: 'Vazões internas', data: { stage: stages, L: sol.L.map(v => v / KMOLH), V: sol.V.map(v => v / KMOLH) } });
    // McCabe-Thiele para sistemas binários
    if (active.length === 2) {
      const lt = active.slice().sort((a, c) => th.c[a].tb - th.c[c].tb), i1 = lt[0], i2 = lt[1];
      try { plots.unshift(mccabeData(th, sol, feeds, i1, i2, R_, D)); } catch (e) { warn.push('Diagrama McCabe-Thiele: ' + e.message); }
    }
    return { out: { distillate: dist, bottoms: bot, side }, res, warn, plots, duties: { Qc: sol.Qc, Qr: sol.Qr }, duty: sol.Qr, profile: sol };
  };

  function mccabeData(th, sol, feeds, i1, i2, R_, D) {
    const P = sol.P[0], Ns = sol.T.length;
    const eq = th.binaryTxy(i1, i2, P, 61);
    const xs = sol.x.map(r => r[i1] / (r[i1] + r[i2])), ys = sol.y.map(r => r[i1] / (r[i1] + r[i2]));
    const xD = sol.partial ? ys[0] : xs[0], xB = xs[Ns - 1];
    const path = { x: [xD], y: [xD] };
    for (let j = 1; j < Ns; j++) { path.x.push(xs[j]); path.y.push(path.y[path.y.length - 1]); path.x.push(xs[j]); path.y.push(j < Ns - 1 ? ys[j + 1] : xs[j]); }
    const f = feeds[0].s; const zF = f.z[i1] / (f.z[i1] + f.z[i2]), q = 1 - f.beta;
    const slope = R_ / (R_ + 1), icp = xD / (R_ + 1);
    let xi, yi; if (Math.abs(q - 1) < 1e-6) { xi = zF; yi = slope * zF + icp; } else { const m = q / (q - 1), c0 = -zF / (q - 1); xi = (c0 - icp) / (slope - m); yi = slope * xi + icp; }
    // refluxo mínimo (pinch na interseção da reta q com a curva de equilíbrio)
    let Rmin = null;
    try {
      const eqY = xx => { let k = 1; while (k < eq.x.length - 1 && eq.x[k] < xx) k++; const t = (xx - eq.x[k - 1]) / (eq.x[k] - eq.x[k - 1]); return eq.y[k - 1] + t * (eq.y[k] - eq.y[k - 1]); };
      let xp; if (Math.abs(q - 1) < 1e-6) xp = zF; else { const m = q / (q - 1), c0 = -zF / (q - 1); xp = N.brent(xx => eqY(xx) - (m * xx + c0), 1e-6, 1 - 1e-6, 1e-10); }
      const yp = eqY(xp); Rmin = (xD - yp) / (yp - xp);
    } catch (e) { /* sem pinch definido */ }
    let az = null; try { az = th.azeotrope(i1, i2, P); } catch (e) { /* */ }
    return { kind: 'mccabe', title: 'McCabe-Thiele (' + th.c[i1].name + '/' + th.c[i2].name + ') | R = ' + R_.toFixed(2), data: { eq, path, xD, xB, zF, q, xi, yi, R: R_, Rmin, nStages: Ns, az, light: th.c[i1].name, heavy: th.c[i2].name } };
  }

  /* ---------------- absorvedora / esgotadora (Kremser) */
  IMPL.absorber = function (th, b, ins) {
    const g = ins.gas_in, l = ins.liq_in, p = b.params, Ns = Math.max(1, Math.round(num(p.N, 8))), T = C2K(num(p.T, 30)), P = num(p.P, 1.01325) * BAR;
    if (!g || !l) throw new Error('Conecte gás (entrada inferior) e líquido (entrada superior)');
    let Lm = l.F, Vm = g.F, gOut, lOut;
    for (let it = 0; it < 30; it++) {
      const xg = lOut ? N.normalize(lOut.map(v => v + 1e-12)) : (l.F ? l.z : g.z), yg = gOut ? N.normalize(gOut.map(v => v + 1e-12)) : g.z;
      const K = th.K(T, P, xg, yg);
      gOut = new Array(th.n); lOut = new Array(th.n);
      for (let i = 0; i < th.n; i++) {
        const A = Lm / (K[i] * Vm), S = 1 / A;
        const fa = Math.abs(A - 1) < 1e-8 ? Ns / (Ns + 1) : (Math.pow(A, Ns + 1) - A) / (Math.pow(A, Ns + 1) - 1);
        const fs = Math.abs(S - 1) < 1e-8 ? Ns / (Ns + 1) : (Math.pow(S, Ns + 1) - S) / (Math.pow(S, Ns + 1) - 1);
        gOut[i] = g.flows[i] * (1 - (isFinite(fa) ? fa : 1)) + l.flows[i] * (isFinite(fs) ? fs : 1);
        lOut[i] = g.flows[i] + l.flows[i] - gOut[i];
      }
      const Ln = 0.5 * (l.F + sum(lOut)), Vn = 0.5 * (g.F + sum(gOut));
      if (Math.abs(Ln - Lm) < 1e-10 * Lm && Math.abs(Vn - Vm) < 1e-10 * Vm) break;
      Lm = Ln; Vm = Vn;
    }
    const go = mkStream(th, gOut, T, P), lo = mkStream(th, lOut, T, P), Q = go.H + lo.H - g.H - l.H;
    const res = [{ k: 'L/V médio', v: Lm / Vm, u: '' }, { k: 'Carga térmica (isotérmica)', v: kW(Q), u: 'kW' }];
    th.ids.forEach((id, i) => { if (g.flows[i] > 1e-12) res.push({ k: 'Fração absorvida de ' + th.c[i].name, v: 1 - gOut[i] / g.flows[i], u: '' }); });
    return { out: { gas_out: go, liq_out: lo }, res, duty: Q };
  };

  /* ---------------- extrator líquido-líquido contracorrente */
  IMPL.extractor = function (th, b, ins) {
    const f = ins.feed, s = ins.solvent, p = b.params, Ns = Math.max(1, Math.round(num(p.N, 5))), T = C2K(num(p.T, 25)), P = num(p.P, 1.01325) * BAR, n = th.n;
    if (!f || !s) throw new Error('Conecte alimentação e solvente');
    if (th.isEOS || th.model === 'IDEAL' || th.model === 'WILSON') throw new Error('Extração L-L exige NRTL, UNIQUAC ou UNIFAC');
    let r = [], e = [];
    for (let j = 0; j < Ns; j++) { r.push(f.flows.slice()); e.push(s.flows.slice()); }
    let xR = r.map(v => N.normalize(v)), xE = e.map(v => N.normalize(v)), converged = false, it;
    for (it = 0; it < 400; it++) {
      const Rj = r.map(sum), Ej = e.map(sum);
      const Kst = []; for (let j = 0; j < Ns; j++) { const gR = th.gamma(xR[j], T), gE = th.gamma(xE[j], T); Kst.push(gR.map((g, i) => g / gE[i])); }
      const rn = []; for (let j = 0; j < Ns; j++) rn.push(new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        const S = Kst.map((k, j) => k[i] * Ej[j] / Rj[j]);
        const a = new Array(Ns), bd = new Array(Ns), c = new Array(Ns), d = new Array(Ns);
        for (let j = 0; j < Ns; j++) { a[j] = j > 0 ? 1 : 0; bd[j] = -(1 + S[j]); c[j] = j < Ns - 1 ? S[j + 1] : 0; d[j] = -((j === 0 ? f.flows[i] : 0) + (j === Ns - 1 ? s.flows[i] : 0)); }
        const sol = N.thomas(a, bd, c, d);
        for (let j = 0; j < Ns; j++) rn[j][i] = Math.max(sol[j], 0);
      }
      let err = 0;
      for (let j = 0; j < Ns; j++) {
        const S = Kst[j].map(k => k * Ej[j] / Rj[j]);
        const en = rn[j].map((v, i) => v * S[i]);
        for (let i = 0; i < n; i++) { err = Math.max(err, Math.abs(rn[j][i] - r[j][i]) / (f.F + s.F)); }
        r[j] = rn[j].map((v, i) => 0.5 * v + 0.5 * r[j][i]); e[j] = en.map((v, i) => 0.5 * v + 0.5 * e[j][i]);
        xR[j] = N.normalize(r[j].map(v => v + 1e-300)); xE[j] = N.normalize(e[j].map(v => v + 1e-300));
      }
      if (err < 1e-10 && it > 5) { converged = true; break; }
    }
    let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(xR[0][i] - xE[0][i]));
    const warn = []; if (d < 1e-3) warn.push('As fases se tornaram idênticas: não há separação líquido-líquido nestas condições (excesso de solvente ou componentes miscíveis).');
    if (!converged) warn.push('Extrator não convergiu totalmente.');
    const fl0 = x => ({ T, P, beta: 0, x, y: x, phase: 'L' });
    const ext = mkStream(th, e[0], T, P, fl0(xE[0])), raf = mkStream(th, r[Ns - 1], T, P, fl0(xR[Ns - 1]));
    const Q = ext.H + raf.H - f.H - s.H;
    const res = [{ k: 'Vazão de extrato', v: ext.F / KMOLH, u: 'kmol/h' }, { k: 'Vazão de rafinado', v: raf.F / KMOLH, u: 'kmol/h' }, { k: 'Carga térmica', v: kW(Q), u: 'kW' }];
    th.ids.forEach((id, i) => { if (f.flows[i] > 1e-12) res.push({ k: 'Recuperação de ' + th.c[i].name + ' no extrato', v: e[0][i] / (f.flows[i] + s.flows[i]), u: '' }); });
    const stages = r.map((v, j) => j + 1);
    const plots = [{ kind: 'stagesBar', title: 'Extração L-L: composição do rafinado por estágio', data: { stage: stages, series: th.ids.map((id, i) => ({ name: th.c[i].name, v: xR.map(x => x[i]) })).filter(s0 => s0.v.some(v => v > 1e-4)) } }];
    return { out: { extract: ext, raffinate: raf }, res, warn, plots, duty: Q };
  };

  /* ---------------- extrator sólido-líquido (lixiviação contracorrente, estágios ideais, retenção constante) */
  IMPL.leaching = function (th, b, ins) {
    const sf = ins.solids, sv = ins.solvent, p = b.params, Ns = Math.max(1, Math.round(num(p.N, 4))), rr = num(p.r, 0.5), T = C2K(num(p.T, 50)), P = num(p.P, 1.01325) * BAR, n = th.n;
    if (!sf || !sv) throw new Error('Conecte os sólidos (entrada) e o solvente');
    const mw = th.c.map(c => c.mw / 1000);
    const solidIdx = th.c.map((c, i) => (c.solid ? i : -1)).filter(i => i >= 0);
    if (!solidIdx.length) throw new Error('A carga de sólidos precisa conter um componente sólido inerte');
    const mFeed = sf.flows.map((v, i) => v * mw[i]), mSolv = sv.flows.map((v, i) => v * mw[i]);
    const inert = sum(solidIdx.map(i => mFeed[i] + mSolv[i]));
    const u0 = mFeed.map((v, i) => (th.c[i].solid ? 0 : v)); // solução que entra com os sólidos (soluto dissolve no estágio 1)
    const Ut = rr * inert, U0 = sum(u0), Vs = sum(mSolv.map((v, i) => (th.c[i].solid ? 0 : v)));
    const Vn = []; for (let j = 0; j < Ns; j++) Vn.push(j === 0 ? Vs + U0 - Ut : Vs);
    if (Vn[0] <= 0) throw new Error('Solvente insuficiente para a retenção especificada');
    const A = Vn.map(v => Ut / v);
    const over = [], under = []; for (let j = 0; j < Ns; j++) { over.push(new Array(n).fill(0)); under.push(new Array(n).fill(0)); }
    for (let i = 0; i < n; i++) {
      if (th.c[i].solid) continue;
      const a = new Array(Ns), bd = new Array(Ns), c = new Array(Ns), d = new Array(Ns);
      for (let j = 0; j < Ns; j++) { a[j] = j > 0 ? -A[j - 1] : 0; bd[j] = 1 + A[j]; c[j] = j < Ns - 1 ? -1 : 0; d[j] = (j === 0 ? u0[i] : 0) + (j === Ns - 1 ? mSolv[i] : 0); }
      const v = N.thomas(a, bd, c, d);
      for (let j = 0; j < Ns; j++) { over[j][i] = Math.max(v[j], 0); under[j][i] = A[j] * over[j][i]; }
    }
    const ovMol = over[0].map((m, i) => m / mw[i]), unMol = under[Ns - 1].map((m, i) => (th.c[i].solid ? (mFeed[i] + mSolv[i]) / mw[i] : m / mw[i]));
    const ov = mkStream(th, ovMol, T, P), un = mkStream(th, unMol, T, P), Q = ov.H + un.H - sf.H - sv.H;
    const res = [{ k: 'Sólido inerte', v: inert * 3600, u: 'kg/h' }, { k: 'Solução retida no sólido', v: Ut * 3600, u: 'kg/h' }, { k: 'Extrato (overflow)', v: Vn[0] * 3600, u: 'kg/h' }, { k: 'Carga térmica', v: kW(Q), u: 'kW' }];
    const plotsS = [];
    th.ids.forEach((id, i) => {
      if (!th.c[i].solid && u0[i] > 1e-12) {
        res.push({ k: 'Recuperação de ' + th.c[i].name + ' no extrato', v: over[0][i] / (u0[i] + mSolv[i]), u: '' });
        plotsS.push({ name: th.c[i].name, v: over.map((o, j) => o[i] / sum(o)) });
      }
    });
    return { out: { overflow: ov, underflow: un }, res, duty: Q, plots: [{ kind: 'stagesBar', title: 'Lixiviação: fração mássica do soluto na solução por estágio', data: { stage: over.map((o, j) => j + 1), series: plotsS } }] };
  };

  /* ---------------- reatores */
  function liquidCp(th, z, T) { return (th.hL(z, T + 0.5, 101325) - th.hL(z, T - 0.5, 101325)); } // J/mol/K
  function solventIndex(th, s, rx) { // componente mais abundante que não participa das reações
    let best = -1; s.z.forEach((v, i) => { if (rx.every(r => r.nu[i] === 0) && (best < 0 || v > s.z[best])) best = i; });
    if (best < 0) best = s.z.indexOf(Math.max.apply(null, s.z));
    return best;
  }

  IMPL.cstr = function (th, b, ins) {
    const s = ins.in, p = b.params, n = th.n, rx = compileReactions(th, p.reactions);
    const V = num(p.V, 1) * 1000; // L
    const v0 = s.F * th.vL(s.z) * 1000; // L/s
    const Cin = s.flows.map(f => f / v0); // mol/L
    const Ctot = sum(Cin), cpm = liquidCp(th, s.z, s.T); // J/mol/K
    const rhoCp = Ctot * cpm; // J/(L·K)
    const thermal = p.thermal || 'isotérmico', Tiso = C2K(num(p.T, K2C(s.T))), UA = num(p.UA, 0), Tj = C2K(num(p.Tj, 25));
    const mode = p.mode || 'permanente', batch = mode === 'batelada';
    const flowT = batch ? 0 : v0 / V;
    const rhs = (t, yv) => {
      const C = yv.slice(0, n), T = thermal === 'isotérmico' ? Tiso : yv[n];
      const r = rates(rx, C, T), d = new Array(n + 1).fill(0);
      for (let i = 0; i < n; i++) { d[i] = flowT * (Cin[i] - C[i]); for (let k = 0; k < rx.length; k++) d[i] += rx[k].nu[i] * r[k]; }
      if (thermal !== 'isotérmico') {
        let gen = 0; for (let k = 0; k < rx.length; k++) gen += -rx[k].dH * r[k];
        const qx = thermal === 'camisa' ? UA * (Tj - T) / V : 0;
        d[n] = flowT * (s.T - T) + (gen + qx) / rhoCp;
      }
      return d;
    };
    let y0;
    const sv = solventIndex(th, s, rx);
    if (batch || p.init === 'igual à alimentação') y0 = Cin.concat([thermal === 'isotérmico' ? Tiso : s.T]);
    else { const Cs = Cin.map(() => 0); Cs[sv] = 1 / (th.c[sv].mw * 1e-3 / th.c[sv].rho * 1000); y0 = Cs.concat([thermal === 'isotérmico' ? Tiso : s.T]); }
    const tau = batch ? 0 : V / v0;
    let tEnd = num(p.tEnd, 3600);
    const warn = [];
    let sol, yEnd;
    if (mode === 'permanente') {
      tEnd = Math.max(20 * tau, tEnd);
      sol = N.integrate(rhs, 0, Cin.concat([thermal === 'isotérmico' ? Tiso : s.T]), tEnd, { nOut: 200, rtol: 1e-7, atol: 1e-10 });
      yEnd = sol.y[sol.y.length - 1];
      const G = yv => rhs(0, yv).slice(0, thermal === 'isotérmico' ? n : n + 1);
      const yy = thermal === 'isotérmico' ? yEnd.slice(0, n) : yEnd.slice();
      const nr = N.newtonSystem(G, yy, { tol: 1e-12, lower: yy.map((v, i) => (i < n ? 0 : 200)) });
      if (nr.converged) { yEnd = thermal === 'isotérmico' ? nr.x.concat([Tiso]) : nr.x; }
      else warn.push('Estado estacionário obtido por integração no tempo (Newton não convergiu).');
    } else {
      sol = N.integrate(rhs, 0, y0, tEnd, { nOut: 300, rtol: 1e-7, atol: 1e-10 });
      yEnd = sol.y[sol.y.length - 1];
    }
    const Tout = thermal === 'isotérmico' ? Tiso : yEnd[n];
    const Cout = yEnd.slice(0, n).map(v => Math.max(v, 0));
    // batelada: a corrente de saída representa o conteúdo final processado na mesma taxa molar da carga
    const outFlows = batch ? Cout.map(c => c / sum(Cin) * s.F) : Cout.map(c => c * v0);
    const out = mkStream(th, outFlows, Tout, s.P);
    // carga térmica para isotérmico; balanço de energia
    let Qiso = 0; if (thermal === 'isotérmico') { let ext = 0; const r = rates(rx, Cout, Tout); for (let k = 0; k < rx.length; k++) ext += rx[k].dH * r[k] * V; Qiso = out.H - s.H + ext; }
    const res = [{ k: 'Tempo de residência τ', v: batch ? NaN : tau, u: 's' }, { k: 'Volume', v: V / 1000, u: 'm³' }, { k: 'Temperatura de saída', v: K2C(Tout), u: '°C' }];
    rx.forEach((r, k) => { if (r.key >= 0) res.push({ k: 'Conversão de ' + th.c[r.key].name + ' (R' + (k + 1) + ')', v: Cin[r.key] > 0 ? 1 - Cout[r.key] / Cin[r.key] : NaN, u: '' }); });
    if (thermal === 'isotérmico') res.push({ k: 'Carga térmica para manter T', v: kW(Qiso), u: 'kW' });
    if (thermal === 'camisa') res.push({ k: 'Calor trocado na camisa', v: kW(UA * (Tj - Tout)), u: 'kW' });
    const plots = [];
    if (sol && mode !== 'permanente') {
      const species = th.ids.map((id, i) => i).filter(i => i !== sv && (Cin[i] > 1e-9 || rx.some(r => r.nu[i] !== 0)));
      plots.push({ kind: 'timeC', title: 'CSTR ' + (batch ? 'batelada' : 'transiente') + ': concentrações × tempo', data: { t: sol.t, series: species.map(i => ({ name: th.c[i].name, v: sol.y.map(r => r[i]) })) } });
      if (thermal !== 'isotérmico') plots.push({ kind: 'timeT', title: 'CSTR: temperatura × tempo', data: { t: sol.t, T: sol.y.map(r => K2C(r[n])) } });
    } else if (sol) {
      const species = th.ids.map((id, i) => i).filter(i => i !== sv && (Cin[i] > 1e-9 || rx.some(r => r.nu[i] !== 0)));
      plots.push({ kind: 'timeC', title: 'CSTR: aproximação do estado estacionário (partida com alimentação)', data: { t: sol.t, series: species.map(i => ({ name: th.c[i].name, v: sol.y.map(r => r[i]) })) } });
    }
    return { out: { out }, res, warn, plots, duty: thermal === 'isotérmico' ? Qiso : (thermal === 'camisa' ? UA * (Tj - Tout) : 0), cstr: { Cin, Cout, v0, V } };
  };

  IMPL.pfr = function (th, b, ins) {
    const s = ins.in, p = b.params, n = th.n, rx = compileReactions(th, p.reactions);
    const Vt = num(p.V, 0.1) * 1000, Dm = num(p.D, 0.1), gas = p.phase === 'gasosa';
    const thermal = p.thermal || 'isotérmico', Tiso = C2K(num(p.T, K2C(s.T))), U = num(p.U, 0), Tw = C2K(num(p.Tw, 25));
    const aV = 4 / Dm / 1000; // m² por L
    const v0 = gas ? s.F * R * s.T / s.P * 1000 : s.F * th.vL(s.z) * 1000; // L/s
    const Cin = s.flows.map(f => f / v0);
    const cpF = gas ? th.cpIG(s.z, s.T) : liquidCp(th, s.z, s.T);
    const warn = [], plots = [];
    // regime permanente: dF/dV
    const rhsSS = (Vv, yv) => {
      const Fm = yv.slice(0, n), T = thermal === 'isotérmico' ? Tiso : yv[n];
      const Ft = sum(Fm), v = gas ? Ft * R * T / s.P * 1000 : v0;
      const C = Fm.map(f => f / v), r = rates(rx, C, T), d = new Array(n + 1).fill(0);
      for (let i = 0; i < n; i++) for (let k = 0; k < rx.length; k++) d[i] += rx[k].nu[i] * r[k];
      if (thermal !== 'isotérmico') {
        let gen = 0; for (let k = 0; k < rx.length; k++) gen += -rx[k].dH * r[k];
        const qx = thermal === 'parede' ? U * aV * (Tw - T) : 0;
        d[n] = (gen + qx) / (Ft * cpF);
      }
      return d;
    };
    const T0in = thermal === 'isotérmico' ? Tiso : s.T;
    const ss = N.integrate(rhsSS, 0, s.flows.concat([T0in]), Vt, { nOut: 100, rtol: 1e-8, atol: 1e-12 });
    const yE = ss.y[ss.y.length - 1];
    const Tout = thermal === 'isotérmico' ? Tiso : yE[n];
    const out = mkStream(th, yE.slice(0, n), Tout, s.P);
    const species = th.ids.map((id, i) => i).filter(i => Cin[i] > 1e-9 || rx.some(r => r.nu[i] !== 0)).filter(i => !(rx.every(r => r.nu[i] === 0) && s.z[i] > 0.5));
    plots.push({ kind: 'pfrSS', title: 'PFR permanente: vazões molares × volume', data: { V: ss.t.map(v => v / 1000), series: species.map(i => ({ name: th.c[i].name, v: ss.y.map(r => r[i] / KMOLH) })), T: thermal !== 'isotérmico' ? ss.y.map(r => K2C(r[n])) : null } });
    let Qiso = 0; if (thermal === 'isotérmico') { let ext = 0; for (let k = 0; k < rx.length; k++) { const key = rx[k].key; if (key >= 0 && rx[k].nu[key]) ext += rx[k].dH * (s.flows[key] - yE[key]) / -rx[k].nu[key]; } Qiso = out.H - s.H + ext; }
    const res = [{ k: 'Volume', v: Vt / 1000, u: 'm³' }, { k: 'Comprimento', v: Vt / 1000 / (Math.PI * Dm * Dm / 4), u: 'm' }, { k: 'Tempo espacial τ', v: Vt / v0, u: 's' }, { k: 'Temperatura de saída', v: K2C(Tout), u: '°C' }];
    rx.forEach((r, k) => { if (r.key >= 0) res.push({ k: 'Conversão de ' + th.c[r.key].name + ' (R' + (k + 1) + ')', v: s.flows[r.key] > 0 ? 1 - yE[r.key] / s.flows[r.key] : NaN, u: '' }); });
    if (thermal === 'isotérmico') res.push({ k: 'Carga térmica para manter T', v: kW(Qiso), u: 'kW' });
    // transiente: método das linhas (células em série, upwind)
    if (p.mode === 'transiente') {
      if (gas) warn.push('Transiente do PFR calculado com vazão volumétrica constante.');
      const Nc = clamp(Math.round(num(p.cells, 40)), 5, 120), dV = Vt / Nc, tEnd = num(p.tEnd, 120);
      const sv = solventIndex(th, s, rx), Csolv = 1 / (th.c[sv].mw * 1e-3 / th.c[sv].rho * 1000);
      const m = n + (thermal === 'isotérmico' ? 0 : 1);
      const y0 = [];
      for (let k = 0; k < Nc; k++) { for (let i = 0; i < n; i++) y0.push(gas ? 0 : (i === sv ? Csolv : 0)); if (m > n) y0.push(s.T); }
      const rhsT = (t, yv) => {
        const d = new Array(yv.length).fill(0);
        for (let k = 0; k < Nc; k++) {
          const o = k * m, C = yv.slice(o, o + n), T = m > n ? yv[o + n] : Tiso;
          const Cup = k === 0 ? Cin : yv.slice(o - m, o - m + n), Tup = k === 0 ? s.T : (m > n ? yv[o - m + n] : Tiso);
          const r = rates(rx, C, T);
          for (let i = 0; i < n; i++) { d[o + i] = v0 / dV * (Cup[i] - C[i]); for (let q = 0; q < rx.length; q++) d[o + i] += rx[q].nu[i] * r[q]; }
          if (m > n) { let gen = 0; for (let q = 0; q < rx.length; q++) gen += -rx[q].dH * r[q]; const qx = thermal === 'parede' ? U * aV * (Tw - T) : 0; const rc = sum(Cin) * cpF; d[o + n] = v0 / dV * (Tup - T) + (gen + qx) / rc; }
        }
        return d;
      };
      const tr = N.integrate(rhsT, 0, y0, tEnd, { nOut: 60, rtol: 1e-6, atol: 1e-9 });
      const key = rx.length && rx[0].key >= 0 ? rx[0].key : species[0];
      const Vgrid = []; for (let k = 0; k < Nc; k++) Vgrid.push((k + 1) * dV / 1000);
      const Cmat = tr.y.map(row => { const r0 = []; for (let k = 0; k < Nc; k++) r0.push(row[k * m + key]); return r0; });
      const Xmat = Cmat.map(r0 => r0.map(c => Math.max(0, Math.min(1, 1 - c / Cin[key]))));
      plots.push({ kind: 'surface', title: 'PFR transiente: concentração e conversão de ' + th.c[key].name, data: { t: tr.t, V: Vgrid, C: Cmat, X: Xmat, comp: th.c[key].name } });
      plots.push({ kind: 'timeC', title: 'PFR transiente: concentração na saída × tempo', data: { t: tr.t, series: species.map(i => ({ name: th.c[i].name, v: tr.y.map(row => row[(Nc - 1) * m + i]) })) } });
      res.push({ k: 'Concentração de ' + th.c[key].name + ' na saída em t final', v: Cmat[Cmat.length - 1][Nc - 1], u: 'mol/L' });
    }
    return { out: { out }, res, warn, plots, duty: Qiso };
  };

  IMPL.rconv = function (th, b, ins) {
    const s = ins.in, p = b.params, rx = compileReactions(th, p.reactions), n = th.n;
    const f = s.flows.slice(); let ext = 0; const res = [];
    rx.forEach((r, k) => {
      if (r.key < 0) throw new Error('Reação ' + (k + 1) + ' sem componente-chave');
      const X = clamp(r.X, 0, 1), xi = f[r.key] * X / -r.nu[r.key];
      for (let i = 0; i < n; i++) f[i] += r.nu[i] * xi;
      ext += r.dH * xi; res.push({ k: 'Avanço R' + (k + 1) + ' (' + r.label + ')', v: xi / KMOLH, u: 'kmol/h' });
    });
    let out, Q;
    if (p.thermal === 'adiabático') { out = streamPH(th, f, s.P, s.H - ext, s.T); Q = 0; }
    else { out = mkStream(th, f, C2K(num(p.T, K2C(s.T))), s.P); Q = out.H - s.H + ext; }
    res.push({ k: 'Temperatura de saída', v: K2C(out.T), u: '°C' }, { k: 'Carga térmica', v: kW(Q), u: 'kW' });
    return { out: { out }, res, duty: Q };
  };

  SF.units = { TYPES, IMPL, mkStream, streamPH, compileReactions, C2K, K2C, BAR, KMOLH, solveColumn };
})(typeof window !== 'undefined' ? window : globalThis);
