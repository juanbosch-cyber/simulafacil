/* SIMULA FÁCIL IA — exemplos prontos */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const S = (id, from, fromPort, to, toPort, name) => ({ id, name: name || id, from, fromPort, to, toPort });
  const EX = [
    { key: 'etoh-mccabe', title: 'Destilação etanol/água — McCabe-Thiele (exemplo do PDF)', fs: {
      name: 'Destilação etanol-água', components: ['ethanol', 'water'], model: 'NRTL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Alimentação F', params: { T: 25, P: 1.01325, vf: 0, flow: 100, flowUnit: 'kmol/h', basis: 'molar', composition: { ethanol: 0.10, water: 0.90 } } },
        { id: 'T101', type: 'column', name: 'DC-01', params: { N: 20, feedStage: 10, R: 3.15, Dmode: 'Vazão D', D: 12.4, condenser: 'total', P: 1.01325, dP: 0 } },
        { id: 'D', type: 'product', name: 'Destilado D' }, { id: 'W', type: 'product', name: 'Fundo W' }],
      streams: [S('1', 'F', 'out', 'T101', 'feed', 'F'), S('2', 'T101', 'distillate', 'D', 'in', 'D'), S('3', 'T101', 'bottoms', 'W', 'in', 'W')] } },
    { key: 'extractive', title: 'Destilação extrativa etanol/água com etilenoglicol', fs: {
      name: 'Desidratação de etanol por destilação extrativa', components: ['ethanol', 'water', 'ethylene-glycol'], model: 'NRTL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Etanol hidratado', params: { T: 60, P: 1.2, flow: 100, flowUnit: 'kmol/h', composition: { ethanol: 0.85, water: 0.15 } } },
        { id: 'SV', type: 'feed', name: 'Etilenoglicol', params: { T: 80, P: 1.2, flow: 80, flowUnit: 'kmol/h', composition: { 'ethylene-glycol': 1 } } },
        { id: 'T101', type: 'column', name: 'T-101 extrativa', params: { N: 30, feedStage: 18, feed2Stage: 4, R: 0.8, Dmode: 'Vazão D', D: 84.8, condenser: 'total', P: 1.01325 } },
        { id: 'T102', type: 'column', name: 'T-102 recuperação', params: { N: 12, feedStage: 6, R: 0.8, Dmode: 'Vazão D', D: 15.2, condenser: 'total', P: 0.3 } },
        { id: 'E101', type: 'cooler', name: 'E-101', params: { mode: 'Temperatura de saída', T: 80 } }],
      streams: [S('1', 'F', 'out', 'T101', 'feed'), S('2', 'SV', 'out', 'T101', 'feed2'), S('3', 'T101', 'bottoms', 'T102', 'feed'), S('4', 'T102', 'bottoms', 'E101', 'in')] } },
    { key: 'hx', title: 'Trocadores de calor casco e tubo + placas', fs: {
      name: 'Recuperação de calor', components: ['water', 'ethanol'], model: 'NRTL',
      blocks: [
        { id: 'H', type: 'feed', name: 'Condensado quente', params: { T: 150, P: 5, flow: 10000, flowUnit: 'kg/h', basis: 'mássica', composition: { water: 1 } } },
        { id: 'C', type: 'feed', name: 'Mosto frio', params: { T: 20, P: 2, flow: 15000, flowUnit: 'kg/h', basis: 'mássica', composition: { water: 0.9, ethanol: 0.1 } } },
        { id: 'E1', type: 'hx_shell', name: 'E-101', params: { spec: 'T saída quente', value: 60, U: 800, shellPasses: '1', tubePasses: '2', tubeD: 19.05, tubeL: 4.88 } },
        { id: 'HW', type: 'feed', name: 'Água quente', params: { T: 120, P: 3, flow: 8000, flowUnit: 'kg/h', basis: 'mássica', composition: { water: 1 } } },
        { id: 'E2', type: 'hx_plate', name: 'E-102', params: { spec: 'T saída fria', value: 92, U: 3500, plateArea: 0.5 } }],
      streams: [S('1', 'H', 'out', 'E1', 'hot_in'), S('2', 'C', 'out', 'E1', 'cold_in'), S('3', 'E1', 'cold_out', 'E2', 'cold_in'), S('4', 'HW', 'out', 'E2', 'hot_in')] } },
    { key: 'cstr', title: 'CSTR transiente com camisa (A → B exotérmica)', fs: {
      name: 'CSTR com camisa', components: ['water', 'comp-A', 'comp-B'], model: 'NRTL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Alimentação', params: { T: 25, P: 1.5, flow: 2, flowUnit: 'L/s', basis: 'concentração (mol/L)', solvent: 'water', composition: { 'comp-A': 2 } } },
        { id: 'R', type: 'cstr', name: 'R-101', params: { V: 1, mode: 'transiente', thermal: 'camisa', T: 25, UA: 20000, Tj: 25, tEnd: 3000, init: 'solvente puro',
          reactions: [{ stoich: { 'comp-A': -1, 'comp-B': 1 }, orders: { 'comp-A': 1 }, k: 0.005, Tref: 25, Ea: 50, dH: -80 }] } }],
      streams: [S('1', 'F', 'out', 'R', 'in')] } },
    { key: 'pfr', title: 'PFR transiente (v₀ = 2 L/s, CA0 = 5 mol/L, k = 0,035 s⁻¹)', fs: {
      name: 'PFR transiente', components: ['water', 'comp-A', 'comp-B'], model: 'NRTL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Alimentação', params: { T: 25, P: 1.5, flow: 2, flowUnit: 'L/s', basis: 'concentração (mol/L)', solvent: 'water', composition: { 'comp-A': 5 } } },
        { id: 'R', type: 'pfr', name: 'R-101', params: { V: 0.1, D: 0.2, mode: 'transiente', phase: 'líquida', thermal: 'isotérmico', T: 25, tEnd: 80, cells: 60,
          reactions: [{ stoich: { 'comp-A': -1, 'comp-B': 1 }, orders: { 'comp-A': 1 }, k: 0.035, Tref: 25, Ea: 0, dH: 0 }] } }],
      streams: [S('1', 'F', 'out', 'R', 'in')] } },
    { key: 'flash', title: 'Flash com reciclo (benzeno/tolueno)', fs: {
      name: 'Flash com reciclo', components: ['benzene', 'toluene'], model: 'IDEAL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Alimentação', params: { T: 25, P: 1.5, flow: 100, flowUnit: 'kmol/h', composition: { benzene: 0.5, toluene: 0.5 } } },
        { id: 'M', type: 'mixer', name: 'MIX-101', params: {} },
        { id: 'H', type: 'heater', name: 'E-101', params: { mode: 'Temperatura de saída', T: 100, dP: 0.2 } },
        { id: 'V', type: 'flash', name: 'V-101', params: { mode: 'Adiabático', P: 1.01325 } },
        { id: 'S', type: 'splitter', name: 'DIV-101', params: { f1: 0.4, f2: 0.6 } },
        { id: 'P', type: 'pump', name: 'P-101', params: { P: 1.5, eff: 0.7 } }],
      streams: [S('1', 'F', 'out', 'M', 'in1'), S('2', 'M', 'out', 'H', 'in'), S('3', 'H', 'out', 'V', 'in'), S('4', 'V', 'liquid', 'S', 'in'), S('5', 'S', 'out1', 'P', 'in'), S('6', 'P', 'out', 'M', 'in2')] } },
    { key: 'lle', title: 'Extração líquido-líquido: acetona da água com tolueno', fs: {
      name: 'Extração L-L', components: ['acetone', 'water', 'toluene'], model: 'UNIFAC',
      blocks: [
        { id: 'F', type: 'feed', name: 'Solução aquosa', params: { T: 25, P: 1.2, flow: 100, flowUnit: 'kmol/h', composition: { acetone: 0.1, water: 0.9 } } },
        { id: 'S', type: 'feed', name: 'Tolueno', params: { T: 25, P: 1.2, flow: 30, flowUnit: 'kmol/h', composition: { toluene: 1 } } },
        { id: 'X', type: 'extractor', name: 'X-101', params: { N: 5, T: 25, P: 1.2 } }],
      streams: [S('1', 'F', 'out', 'X', 'feed'), S('2', 'S', 'out', 'X', 'solvent')] } },
    { key: 'leach', title: 'Lixiviação de óleo de soja com hexano (sólido-líquido)', fs: {
      name: 'Extração de óleo', components: ['inert-solid', 'soy-oil', 'n-hexane'], model: 'IDEAL',
      blocks: [
        { id: 'F', type: 'feed', name: 'Soja laminada', params: { T: 50, P: 1.01325, flow: 1000, flowUnit: 'kg/h', basis: 'mássica', composition: { 'inert-solid': 0.8, 'soy-oil': 0.2 } } },
        { id: 'S', type: 'feed', name: 'Hexano', params: { T: 50, P: 1.01325, flow: 1000, flowUnit: 'kg/h', basis: 'mássica', composition: { 'n-hexane': 1 } } },
        { id: 'X', type: 'leaching', name: 'X-101', params: { N: 4, r: 0.5, T: 50, P: 1.01325 } }],
      streams: [S('1', 'F', 'out', 'X', 'solids'), S('2', 'S', 'out', 'X', 'solvent')] } },
    { key: 'gas', title: 'Compressão, refrigeração e absorção de gás (Peng-Robinson)', fs: {
      name: 'Condicionamento de gás', components: ['methane', 'propane', 'n-butane', 'n-octane'], model: 'PR',
      blocks: [
        { id: 'F', type: 'feed', name: 'Gás bruto', params: { T: 30, P: 5, flow: 100, flowUnit: 'kmol/h', composition: { methane: 0.7, propane: 0.2, 'n-butane': 0.1 } } },
        { id: 'K', type: 'compressor', name: 'K-101', params: { P: 20, eff: 0.75 } },
        { id: 'E', type: 'cooler', name: 'E-101', params: { mode: 'Temperatura de saída', T: -10 } },
        { id: 'V', type: 'flash', name: 'V-101', params: { mode: 'Adiabático', P: 20 } },
        { id: 'O', type: 'feed', name: 'Óleo de absorção', params: { T: 30, P: 20, flow: 50, flowUnit: 'kmol/h', composition: { 'n-octane': 1 } } },
        { id: 'A', type: 'absorber', name: 'T-101', params: { N: 6, T: 30, P: 20 } },
        { id: 'VL', type: 'valve', name: 'VLV-101', params: { P: 5 } }],
      streams: [S('1', 'F', 'out', 'K', 'in'), S('2', 'K', 'out', 'E', 'in'), S('3', 'E', 'out', 'V', 'in'), S('4', 'V', 'vapor', 'A', 'gas_in'), S('5', 'O', 'out', 'A', 'liq_in'), S('6', 'V', 'liquid', 'VL', 'in')] } },
    { key: 'fug', title: 'Coluna shortcut BTX (Fenske–Underwood–Gilliland)', fs: {
      name: 'Shortcut BTX', components: ['benzene', 'toluene', 'p-xylene'], model: 'IDEAL',
      blocks: [
        { id: 'F', type: 'feed', name: 'BTX', params: { T: 90, vf: 0, P: 1.2, flow: 100, flowUnit: 'kmol/h', composition: { benzene: 0.4, toluene: 0.4, 'p-xylene': 0.2 } } },
        { id: 'C', type: 'column_short', name: 'T-101', params: { lk: 'benzene', hk: 'toluene', lkRec: 0.99, hkRec: 0.99, RRmin: 1.3, P: 1.01325 } }],
      streams: [S('1', 'F', 'out', 'C', 'feed')] } }
  ];
  SF.examples = EX;
})(typeof window !== 'undefined' ? window : globalThis);
