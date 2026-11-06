/* SIMULA FÁCIL IA — Termodinâmica
   Banco de componentes, pressão de vapor (Antoine / Lee-Kesler), modelos de coeficiente de atividade
   (Ideal, NRTL, Wilson, UNIQUAC, UNIFAC) e equações de estado cúbicas (Peng-Robinson, SRK),
   entalpias e algoritmos de flash (TP, PH, PVF, bolha, orvalho, ELL). Unidades internas SI: K, Pa, mol, J. */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const N = SF.num;
  const R = 8.314462618, T0 = 298.15, PATM = 101325;

  /* ------------------------------------------------------------------ banco de componentes
     mw g/mol; tc K; pc Pa; w fator acêntrico; tb K; rho kg/m3 (líquido ~25 °C); cp gás ideal J/mol/K = A+BT+CT²+DT³;
     dhv J/mol no ponto normal de ebulição; ant = Antoine log10(P/mmHg) = A − B/(C + t/°C); g = grupos UNIFAC. */
  const COMPONENTS = [
    { id: 'water', name: 'Água', formula: 'H2O', mw: 18.015, tc: 647.1, pc: 220.64e5, w: 0.345, tb: 373.15, rho: 997, cp: [32.24, 1.924e-3, 1.055e-5, -3.596e-9], dhv: 40660, ant: [8.07131, 1730.63, 233.426], g: { H2O: 1 } },
    { id: 'methanol', name: 'Metanol', formula: 'CH4O', mw: 32.042, tc: 512.6, pc: 80.97e5, w: 0.565, tb: 337.85, rho: 787, cp: [21.15, 7.092e-2, 2.587e-5, -2.852e-8], dhv: 35210, ant: [8.08097, 1582.271, 239.726], g: { CH3OH: 1 } },
    { id: 'ethanol', name: 'Etanol', formula: 'C2H6O', mw: 46.069, tc: 513.9, pc: 61.48e5, w: 0.645, tb: 351.44, rho: 785, cp: [9.014, 2.141e-1, -8.39e-5, 1.373e-9], dhv: 38560, ant: [8.20417, 1642.89, 230.300], g: { CH3: 1, CH2: 1, OH: 1 } },
    { id: '1-propanol', name: '1-Propanol', formula: 'C3H8O', mw: 60.096, tc: 536.8, pc: 51.75e5, w: 0.629, tb: 370.35, rho: 800, cp: [2.47, 3.325e-1, -1.855e-4, 4.296e-8], dhv: 41440, ant: [7.84767, 1499.21, 204.64], g: { CH3: 1, CH2: 2, OH: 1 } },
    { id: 'isopropanol', name: 'Isopropanol', formula: 'C3H8O', mw: 60.096, tc: 508.3, pc: 47.62e5, w: 0.665, tb: 355.4, rho: 781, cp: [32.43, 1.885e-1, 6.406e-5, -9.261e-8], dhv: 39850, ant: [8.87829, 2010.33, 252.636], g: { CH3: 2, CH: 1, OH: 1 } },
    { id: '1-butanol', name: '1-Butanol', formula: 'C4H10O', mw: 74.123, tc: 563.1, pc: 44.23e5, w: 0.590, tb: 390.9, rho: 806, cp: [3.266, 4.18e-1, -2.242e-4, 4.685e-8], dhv: 43290, ant: [7.47680, 1362.39, 178.77], g: { CH3: 1, CH2: 3, OH: 1 } },
    { id: 'ethylene-glycol', name: 'Etilenoglicol', formula: 'C2H6O2', mw: 62.068, tc: 720.0, pc: 82.0e5, w: 0.487, tb: 470.45, rho: 1110, cp: [35.70, 2.483e-1, -1.497e-4, 3.01e-8], dhv: 52500, ant: [8.0908, 2088.9, 203.5], g: { CH2: 2, OH: 2 } },
    { id: 'acetone', name: 'Acetona', formula: 'C3H6O', mw: 58.08, tc: 508.1, pc: 47.0e5, w: 0.307, tb: 329.2, rho: 784, cp: [6.301, 2.606e-1, -1.253e-4, 2.038e-8], dhv: 29100, ant: [7.11714, 1210.595, 229.664], g: { CH3: 1, CH3CO: 1 } },
    { id: 'acetic-acid', name: 'Ácido acético', formula: 'C2H4O2', mw: 60.052, tc: 591.95, pc: 57.86e5, w: 0.467, tb: 391.1, rho: 1045, cp: [4.84, 2.549e-1, -1.753e-4, 4.949e-8], dhv: 23700, ant: [7.38782, 1533.313, 222.309], g: { CH3: 1, COOH: 1 } },
    { id: 'ethyl-acetate', name: 'Acetato de etila', formula: 'C4H8O2', mw: 88.106, tc: 523.3, pc: 38.8e5, w: 0.366, tb: 350.2, rho: 897, cp: [7.235, 4.072e-1, -2.092e-4, 2.855e-8], dhv: 31940, ant: [7.10179, 1244.95, 217.88], g: { CH3: 1, CH2: 1, CH3COO: 1 } },
    { id: 'benzene', name: 'Benzeno', formula: 'C6H6', mw: 78.114, tc: 562.05, pc: 48.95e5, w: 0.210, tb: 353.2, rho: 876, cp: [-33.92, 4.739e-1, -3.017e-4, 7.13e-8], dhv: 30720, ant: [6.90565, 1211.033, 220.790], g: { ACH: 6 } },
    { id: 'toluene', name: 'Tolueno', formula: 'C7H8', mw: 92.141, tc: 591.75, pc: 41.08e5, w: 0.264, tb: 383.8, rho: 867, cp: [-24.35, 5.125e-1, -2.765e-4, 4.911e-8], dhv: 33180, ant: [6.95464, 1344.8, 219.482], g: { ACH: 5, ACCH3: 1 } },
    { id: 'p-xylene', name: 'p-Xileno', formula: 'C8H10', mw: 106.17, tc: 616.2, pc: 35.11e5, w: 0.322, tb: 411.5, rho: 861, cp: [-25.09, 6.042e-1, -3.374e-4, 6.82e-8], dhv: 35670, ant: [6.99052, 1453.43, 215.307], g: { ACH: 4, ACCH3: 2 } },
    { id: 'ethylbenzene', name: 'Etilbenzeno', formula: 'C8H10', mw: 106.17, tc: 617.2, pc: 36.06e5, w: 0.303, tb: 409.3, rho: 867, cp: [-43.1, 7.072e-1, -4.811e-4, 1.301e-7], dhv: 35570, ant: [6.95719, 1424.255, 213.206], g: { ACH: 5, ACCH2: 1, CH3: 1 } },
    { id: 'styrene', name: 'Estireno', formula: 'C8H8', mw: 104.15, tc: 636.0, pc: 38.4e5, w: 0.297, tb: 418.3, rho: 906, cp: [-28.25, 6.159e-1, -4.023e-4, 9.935e-8], dhv: 36820, ant: [7.06623, 1507.434, 214.985], g: { ACH: 5, AC: 1, 'CH2=CH': 1 } },
    { id: 'cyclohexane', name: 'Ciclohexano', formula: 'C6H12', mw: 84.16, tc: 553.5, pc: 40.73e5, w: 0.211, tb: 353.9, rho: 774, cp: [-54.54, 6.113e-1, -2.523e-4, 1.321e-8], dhv: 29970, ant: [6.84130, 1201.53, 222.65], g: { CH2: 6 } },
    { id: 'n-pentane', name: 'n-Pentano', formula: 'C5H12', mw: 72.15, tc: 469.7, pc: 33.70e5, w: 0.252, tb: 309.2, rho: 626, cp: [-3.626, 4.873e-1, -2.58e-4, 5.305e-8], dhv: 25790, ant: [6.87632, 1075.78, 233.205], g: { CH3: 2, CH2: 3 } },
    { id: 'n-hexane', name: 'n-Hexano', formula: 'C6H14', mw: 86.177, tc: 507.6, pc: 30.25e5, w: 0.301, tb: 341.9, rho: 655, cp: [-4.413, 5.82e-1, -3.119e-4, 6.494e-8], dhv: 28850, ant: [6.87601, 1171.17, 224.41], g: { CH3: 2, CH2: 4 } },
    { id: 'n-heptane', name: 'n-Heptano', formula: 'C7H16', mw: 100.2, tc: 540.2, pc: 27.4e5, w: 0.350, tb: 371.6, rho: 680, cp: [-5.146, 6.762e-1, -3.651e-4, 7.658e-8], dhv: 31770, ant: [6.89385, 1264.37, 216.636], g: { CH3: 2, CH2: 5 } },
    { id: 'n-octane', name: 'n-Octano', formula: 'C8H18', mw: 114.23, tc: 568.7, pc: 24.9e5, w: 0.399, tb: 398.8, rho: 699, cp: [-6.096, 7.712e-1, -4.195e-4, 8.855e-8], dhv: 34410, ant: [6.91868, 1351.99, 209.155], g: { CH3: 2, CH2: 6 } },
    { id: 'methane', name: 'Metano', formula: 'CH4', mw: 16.043, tc: 190.6, pc: 45.99e5, w: 0.012, tb: 111.7, rho: 422, cp: [19.25, 5.213e-2, 1.197e-5, -1.132e-8], dhv: 8170 },
    { id: 'ethane', name: 'Etano', formula: 'C2H6', mw: 30.07, tc: 305.3, pc: 48.72e5, w: 0.100, tb: 184.6, rho: 544, cp: [5.409, 1.781e-1, -6.938e-5, 8.713e-9], dhv: 14700 },
    { id: 'propane', name: 'Propano', formula: 'C3H8', mw: 44.097, tc: 369.8, pc: 42.48e5, w: 0.152, tb: 231.1, rho: 493, cp: [-4.224, 3.063e-1, -1.586e-4, 3.215e-8], dhv: 19040 },
    { id: 'n-butane', name: 'n-Butano', formula: 'C4H10', mw: 58.123, tc: 425.1, pc: 37.96e5, w: 0.200, tb: 272.7, rho: 573, cp: [9.487, 3.313e-1, -1.108e-4, -2.822e-9], dhv: 22440 },
    { id: 'isobutane', name: 'Isobutano', formula: 'C4H10', mw: 58.123, tc: 407.8, pc: 36.4e5, w: 0.184, tb: 261.4, rho: 551, cp: [-1.39, 3.847e-1, -1.846e-4, 2.895e-8], dhv: 21300 },
    { id: 'ethylene', name: 'Etileno', formula: 'C2H4', mw: 28.054, tc: 282.3, pc: 50.4e5, w: 0.087, tb: 169.4, rho: 568, cp: [3.806, 1.566e-1, -8.348e-5, 1.755e-8], dhv: 13530 },
    { id: 'propylene', name: 'Propeno', formula: 'C3H6', mw: 42.081, tc: 364.9, pc: 46.0e5, w: 0.142, tb: 225.5, rho: 505, cp: [3.71, 2.345e-1, -1.16e-4, 2.205e-8], dhv: 18420 },
    { id: 'hydrogen', name: 'Hidrogênio', formula: 'H2', mw: 2.016, tc: 33.19, pc: 13.13e5, w: -0.216, tb: 20.3, rho: 71, cp: [27.14, 9.274e-3, -1.381e-5, 7.645e-9], dhv: 904 },
    { id: 'nitrogen', name: 'Nitrogênio', formula: 'N2', mw: 28.014, tc: 126.2, pc: 33.98e5, w: 0.037, tb: 77.35, rho: 806, cp: [31.15, -1.357e-2, 2.68e-5, -1.168e-8], dhv: 5580 },
    { id: 'oxygen', name: 'Oxigênio', formula: 'O2', mw: 31.999, tc: 154.6, pc: 50.43e5, w: 0.022, tb: 90.2, rho: 1141, cp: [28.11, -3.68e-6, 1.746e-5, -1.065e-8], dhv: 6820 },
    { id: 'co2', name: 'Dióxido de carbono', formula: 'CO2', mw: 44.01, tc: 304.1, pc: 73.83e5, w: 0.224, tb: 194.7, rho: 770, cp: [19.80, 7.344e-2, -5.602e-5, 1.715e-8], dhv: 16700 },
    { id: 'co', name: 'Monóxido de carbono', formula: 'CO', mw: 28.01, tc: 132.9, pc: 34.99e5, w: 0.045, tb: 81.7, rho: 789, cp: [30.87, -1.285e-2, 2.789e-5, -1.272e-8], dhv: 6040 },
    { id: 'ammonia', name: 'Amônia', formula: 'NH3', mw: 17.031, tc: 405.4, pc: 113.53e5, w: 0.257, tb: 239.8, rho: 603, cp: [27.31, 2.383e-2, 1.707e-5, -1.185e-8], dhv: 23350, ant: [7.36050, 926.132, 240.17] },
    { id: 'sucrose', name: 'Sacarose (soluto não volátil)', formula: 'C12H22O11', mw: 342.3, rho: 1587, nv: true, cpl: 425 },
    { id: 'soy-oil', name: 'Óleo de soja (trioleína)', formula: 'C57H104O6', mw: 885.4, rho: 915, nv: true, cpl: 1680 },
    { id: 'comp-A', name: 'Componente genérico A (soluto, M=100)', formula: 'A', mw: 100, rho: 1000, nv: true, cpl: 200 },
    { id: 'comp-B', name: 'Componente genérico B (soluto, M=100)', formula: 'B', mw: 100, rho: 1000, nv: true, cpl: 200 },
    { id: 'comp-C', name: 'Componente genérico C (soluto, M=200)', formula: 'C', mw: 200, rho: 1000, nv: true, cpl: 400 },
    { id: 'comp-D', name: 'Componente genérico D (soluto, M=50)', formula: 'D', mw: 50, rho: 1000, nv: true, cpl: 100 },
    { id: 'inert-solid', name: 'Sólido inerte (farelo/torta)', formula: '(C6H10O5)n', mw: 162.14, rho: 1500, solid: true, cpl: 210 }
  ];
  const COMP = {}; COMPONENTS.forEach(c => { COMP[c.id] = c; });

  /* ------------------------------------------------------------------ UNIFAC (VLE original, Hansen et al. 1991) */
  const UNIFAC_SUB = { CH3: [1, 0.9011, 0.848], CH2: [1, 0.6744, 0.540], CH: [1, 0.4469, 0.228], C: [1, 0.2195, 0.0],
    'CH2=CH': [2, 1.3454, 1.176], ACH: [3, 0.5313, 0.400], AC: [3, 0.3652, 0.120], ACCH3: [4, 1.2663, 0.968], ACCH2: [4, 1.0396, 0.660],
    OH: [5, 1.0, 1.200], CH3OH: [6, 1.4311, 1.432], H2O: [7, 0.92, 1.400], CH3CO: [9, 1.6724, 1.488], CH3COO: [11, 1.9031, 1.728], COOH: [20, 1.3013, 1.224] };
  const UA = {
    1: { 2: 86.02, 3: 61.13, 4: 76.50, 5: 986.5, 6: 697.2, 7: 1318, 9: 476.4, 11: 232.1, 20: 663.5 },
    2: { 1: -35.36, 3: 38.81, 4: 74.15, 5: 524.1, 6: 787.6, 7: 270.6, 9: 182.6, 11: 37.85, 20: 318.9 },
    3: { 1: -11.12, 2: 3.446, 4: 167.0, 5: 636.1, 6: 637.4, 7: 903.8, 9: 25.77, 11: 5.994, 20: 537.4 },
    4: { 1: -69.70, 2: -113.6, 3: -146.8, 5: 803.2, 6: 603.3, 7: 5695, 9: -52.10, 11: 5688, 20: 872.3 },
    5: { 1: 156.4, 2: 457.0, 3: 89.60, 4: 25.82, 6: -137.1, 7: 353.5, 9: 84.00, 11: 101.1, 20: 199.0 },
    6: { 1: 16.51, 2: -12.52, 3: -50.00, 4: -44.50, 5: 249.1, 7: -181.0, 9: 23.39, 11: -10.72, 20: -202.0 },
    7: { 1: 300.0, 2: 496.1, 3: 362.3, 4: 377.6, 5: -229.1, 6: 289.6, 9: -195.4, 11: 72.87, 20: -14.09 },
    9: { 1: 26.76, 2: 42.92, 3: 140.1, 4: 365.8, 5: 164.5, 6: 108.7, 7: 472.5, 11: -213.7, 20: 669.4 },
    11: { 1: 114.8, 2: 132.1, 3: 85.84, 4: -170.0, 5: 245.4, 6: 249.6, 7: 200.8, 9: 372.2, 20: 660.2 },
    20: { 1: 315.3, 2: 1264, 3: 62.32, 4: 89.86, 5: -151.0, 6: 339.8, 7: -66.17, 9: -256.3, 11: -338.5 }
  };

  function makeUnifac(comps) {
    const subs = []; comps.forEach(c => Object.keys(c.g || {}).forEach(s => { if (subs.indexOf(s) < 0) subs.push(s); }));
    const nu = comps.map(c => subs.map(s => (c.g && c.g[s]) || 0));
    const Rk = subs.map(s => UNIFAC_SUB[s][1]), Qk = subs.map(s => UNIFAC_SUB[s][2]), mk = subs.map(s => UNIFAC_SUB[s][0]);
    const r = nu.map(v => v.reduce((s, n, k) => s + n * Rk[k], 0)), q = nu.map(v => v.reduce((s, n, k) => s + n * Qk[k], 0));
    const amn = subs.map((s, i) => subs.map((t, j) => (mk[i] === mk[j] ? 0 : ((UA[mk[i]] && UA[mk[i]][mk[j]]) || 0))));
    function lnGamma(Xg, T) { // Xg: frações de grupo
      const ng = subs.length; const sQX = Xg.reduce((s, v, k) => s + v * Qk[k], 0);
      const th = Xg.map((v, k) => v * Qk[k] / sQX);
      const psi = amn.map(row => row.map(a => Math.exp(-a / T)));
      const out = new Array(ng);
      for (let k = 0; k < ng; k++) {
        let s1 = 0; for (let m = 0; m < ng; m++) s1 += th[m] * psi[m][k];
        let s2 = 0; for (let m = 0; m < ng; m++) { let den = 0; for (let n2 = 0; n2 < ng; n2++) den += th[n2] * psi[n2][m]; s2 += th[m] * psi[k][m] / den; }
        out[k] = Qk[k] * (1 - Math.log(s1) - s2);
      }
      return out;
    }
    const pureCache = {};
    function gamma(x, T) {
      const nc = comps.length, z = 10;
      const key = T.toFixed(4); let pure = pureCache[key];
      if (!pure) {
        pure = nu.map(v => { const tot = v.reduce((a, b) => a + b, 0); const X = v.map(n => n / tot); const lg = lnGamma(X, T); return lg.map((g, k) => (v[k] ? g : 0)); });
        pureCache[key] = pure;
      }
      const sx = x.reduce((a, b) => a + b, 0);
      const rx = x.reduce((s, v, i) => s + v * r[i], 0), qx = x.reduce((s, v, i) => s + v * q[i], 0);
      const l = r.map((ri, i) => (z / 2) * (ri - q[i]) - (ri - 1)); const lx = x.reduce((s, v, i) => s + v * l[i], 0);
      let totG = 0; const Xg = new Array(subs.length).fill(0);
      for (let i = 0; i < nc; i++) for (let k = 0; k < subs.length; k++) { Xg[k] += x[i] * nu[i][k]; totG += x[i] * nu[i][k]; }
      for (let k = 0; k < subs.length; k++) Xg[k] /= totG;
      const lgMix = lnGamma(Xg, T);
      const res = new Array(nc);
      for (let i = 0; i < nc; i++) {
        const phi = r[i] / rx * sx, the = q[i] / qx * sx; // Φi/xi e θi/xi
        const lnC = Math.log(phi) + (z / 2) * q[i] * Math.log(the / phi) + l[i] - phi * lx / sx;
        let lnR = 0; for (let k = 0; k < subs.length; k++) if (nu[i][k]) lnR += nu[i][k] * (lgMix[k] - pure[i][k]);
        res[i] = Math.exp(lnC + lnR);
      }
      return res;
    }
    return { gamma, r, q, subs };
  }

  /* ------------------------------------------------------------------ banco NRTL (forma Aspen: τij = aij + bij/T, α = cij) */
  const NRTL_DB = {
    'ethanol|water': { a12: -0.8009, a21: 3.4578, b12: 246.18, b21: -586.0809, c: 0.3, src: 'Banco NRTL (APV)' },
    'methanol|water': { a12: -0.693, a21: 2.7322, b12: 172.9871, b21: -617.2687, c: 0.3, src: 'Banco NRTL (APV)' },
    'acetone|water': { a12: 6.3981, a21: 0.0544, b12: -1808.991, b21: 419.9716, c: 0.3, src: 'Banco NRTL (APV)' },
    // estimativas a partir de γ∞ típicos da literatura (o UNIFAC original não capta o desvio negativo água/etilenoglicol)
    'ethylene-glycol|water': { a12: 0, a21: 0, b12: -546.5, b21: 765.0, c: 0.3, src: 'Estimativa NRTL (γ∞ de literatura)' },
    'ethanol|ethylene-glycol': { a12: 0, a21: 0, b12: 17.4, b21: 261.2, c: 0.3, src: 'Estimativa NRTL (γ∞ de literatura)' }
  };
  const KIJ_DB = { 'co2|methane': 0.0919, 'co2|ethane': 0.1322, 'co2|propane': 0.1241, 'co2|n-butane': 0.1333, 'methane|nitrogen': 0.0311, 'nitrogen|ethane': 0.0515, 'nitrogen|co2': -0.017, 'hydrogen|methane': 0.0156, 'methane|water': 0.4850, 'ethane|water': 0.4920, 'propane|water': 0.5525, 'co2|water': 0.1896 };
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /* ------------------------------------------------------------------ pressão de vapor */
  function psatComp(c, T) {
    if (c.nv || c.solid) return 1e-12;
    if (c.ant && T < c.tc) { const t = T - 273.15; return Math.pow(10, c.ant[0] - c.ant[1] / (c.ant[2] + t)) * 133.322368; }
    const Tr = T / c.tc; // Lee-Kesler
    const f0 = 5.92714 - 6.09648 / Tr - 1.28862 * Math.log(Tr) + 0.169347 * Math.pow(Tr, 6);
    const f1 = 15.2518 - 15.6875 / Tr - 13.4721 * Math.log(Tr) + 0.43577 * Math.pow(Tr, 6);
    return c.pc * Math.exp(f0 + c.w * f1);
  }
  const TCP_MIN = 200, TCP_MAX = 1500; // faixa de validade do polinômio de Cp; extrapolação linear em H fora dela
  function hPoly(c, T) { const [A, B, C, D] = c.cp; return A * (T - T0) + B / 2 * (T * T - T0 * T0) + C / 3 * (T ** 3 - T0 ** 3) + D / 4 * (T ** 4 - T0 ** 4); }
  function cpPoly(c, T) { const [A, B, C, D] = c.cp; return A + B * T + C * T * T + D * T ** 3; }
  function hIGcomp(c, T) {
    if (c.nv || c.solid) return c.cpl * (T - T0);
    if (T > TCP_MAX) return hPoly(c, TCP_MAX) + cpPoly(c, TCP_MAX) * (T - TCP_MAX);
    if (T < TCP_MIN) return hPoly(c, TCP_MIN) + cpPoly(c, TCP_MIN) * (T - TCP_MIN);
    return hPoly(c, T);
  }
  function cpIGcomp(c, T) { if (c.nv || c.solid) return c.cpl; return cpPoly(c, Math.max(TCP_MIN, Math.min(TCP_MAX, T))); }
  function dHvapComp(c, T) {
    if (c.nv || c.solid) return 0;
    if (T >= c.tc) return 0;
    return c.dhv * Math.pow((1 - T / c.tc) / (1 - c.tb / c.tc), 0.38);
  }

  /* ------------------------------------------------------------------ modelos de atividade (forma genérica) */
  function nrtlGamma(x, T, P) { // P: {a,b,c} matrizes n×n
    const n = x.length, tau = [], G = [];
    for (let i = 0; i < n; i++) { tau.push([]); G.push([]); for (let j = 0; j < n; j++) { const t = i === j ? 0 : P.a[i][j] + P.b[i][j] / T; tau[i].push(t); G[i].push(Math.exp(-P.c[i][j] * t)); } }
    const out = new Array(n);
    const S = [], C = [];
    for (let j = 0; j < n; j++) { let s = 0, c = 0; for (let k = 0; k < n; k++) { s += G[k][j] * x[k]; c += x[k] * tau[k][j] * G[k][j]; } S.push(s); C.push(c); }
    for (let i = 0; i < n; i++) {
      let lg = C[i] / S[i];
      for (let j = 0; j < n; j++) lg += x[j] * G[i][j] / S[j] * (tau[i][j] - C[j] / S[j]);
      out[i] = Math.exp(lg);
    }
    return out;
  }
  function wilsonGamma(x, T, P) { // ln Λij = a + b/T
    const n = x.length, L = [];
    for (let i = 0; i < n; i++) { L.push([]); for (let j = 0; j < n; j++) L[i].push(i === j ? 1 : Math.exp(P.a[i][j] + P.b[i][j] / T)); }
    const S = []; for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += x[j] * L[i][j]; S.push(s); }
    const out = new Array(n);
    for (let i = 0; i < n; i++) { let t = 0; for (let k = 0; k < n; k++) t += x[k] * L[k][i] / S[k]; out[i] = Math.exp(1 - Math.log(S[i]) - t); }
    return out;
  }
  function uniquacGamma(x, T, P) { // τij = exp(a + b/T)
    const n = x.length, z = 10, r = P.r, q = P.q;
    const rx = x.reduce((s, v, i) => s + v * r[i], 0), qx = x.reduce((s, v, i) => s + v * q[i], 0);
    const phi = x.map((v, i) => v * r[i] / rx), th = x.map((v, i) => v * q[i] / qx);
    const l = r.map((ri, i) => (z / 2) * (ri - q[i]) - (ri - 1)); const lx = x.reduce((s, v, i) => s + v * l[i], 0);
    const tau = []; for (let i = 0; i < n; i++) { tau.push([]); for (let j = 0; j < n; j++) tau[i].push(i === j ? 1 : Math.exp(P.a[i][j] + P.b[i][j] / T)); }
    const S = []; for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += th[k] * tau[k][j]; S.push(s); }
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const pr = r[i] / rx, tr = q[i] / qx;
      const lnC = Math.log(pr) + (z / 2) * q[i] * Math.log(tr / pr) + l[i] - pr * lx;
      let t2 = 0; for (let j = 0; j < n; j++) t2 += th[j] * tau[i][j] / S[j];
      const lnR = q[i] * (1 - Math.log(S[i]) - t2);
      out[i] = Math.exp(lnC + lnR);
    }
    return out;
  }

  /* Ajuste de parâmetros binários (NRTL/Wilson/UNIQUAC) a um modelo de referência em duas temperaturas */
  const XS = [1e-5, 0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 1 - 1e-5];
  function fitBinary(modelName, refGamma, T1, T2, extra) {
    const fitAt = (T) => {
      const ref = XS.map(x1 => refGamma([x1, 1 - x1], T).map(Math.log));
      const ginf = [Math.exp(ref[0][0]), Math.exp(ref[XS.length - 1][1])];
      const alpha = Math.max(ginf[0], ginf[1]) > 15 ? 0.2 : 0.3;
      const model = (p, x) => {
        if (modelName === 'NRTL') return nrtlGamma(x, T, { a: [[0, p[0]], [p[1], 0]], b: [[0, 0], [0, 0]], c: [[0, alpha], [alpha, 0]] });
        if (modelName === 'WILSON') return wilsonGamma(x, T, { a: [[0, p[0]], [p[1], 0]], b: [[0, 0], [0, 0]] });
        return uniquacGamma(x, T, { a: [[0, p[0]], [p[1], 0]], b: [[0, 0], [0, 0]], r: extra.r, q: extra.q });
      };
      const obj = (p) => {
        let s = 0;
        for (let k = 0; k < XS.length; k++) {
          const g = model(p, [XS[k], 1 - XS[k]]);
          const e1 = Math.log(g[0]) - ref[k][0], e2 = Math.log(g[1]) - ref[k][1];
          if (!isFinite(e1) || !isFinite(e2)) return 1e9;
          s += e1 * e1 + e2 * e2;
        }
        return s;
      };
      const starts = modelName === 'NRTL' ? [[0, 0], [1, 1], [2, 0], [0, 2], [3, -1], [-1, 3], [4, 4]] : [[0, 0], [-1, -1], [1, -1], [-1, 1], [-2, 0], [0, -2]];
      let best = null;
      starts.forEach(s0 => { const r = N.nelderMead(obj, s0, { maxIter: 500, tol: 1e-12 }); if (!best || r.f < best.f) best = r; });
      return { p: best.x, alpha, err: best.f };
    };
    const f1 = fitAt(T1), f2 = fitAt(T2);
    const inv = 1 / T1 - 1 / T2;
    const b12 = (f1.p[0] - f2.p[0]) / inv, b21 = (f1.p[1] - f2.p[1]) / inv;
    return { a12: f1.p[0] - b12 / T1, a21: f1.p[1] - b21 / T1, b12, b21, c: Math.min(f1.alpha, f2.alpha), rms: Math.sqrt((f1.err + f2.err) / (4 * XS.length)) };
  }

  /* ------------------------------------------------------------------ equações cúbicas */
  function cubicRoots(c2, c1, c0) {
    const p = c1 - c2 * c2 / 3, q = 2 * c2 ** 3 / 27 - c2 * c1 / 3 + c0;
    const disc = q * q / 4 + p ** 3 / 27, roots = [];
    if (disc > 0) { const s = Math.sqrt(disc); roots.push(Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) - c2 / 3); }
    else { const r = Math.sqrt(-(p ** 3) / 27), phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r)))), m = 2 * Math.cbrt(r);
      for (let k = 0; k < 3; k++) roots.push(m * Math.cos((phi + 2 * Math.PI * k) / 3) - c2 / 3); }
    return roots.sort((a, b) => a - b);
  }

  /* ------------------------------------------------------------------ classe Thermo */
  const MODELS = {
    IDEAL: 'Ideal (Raoult)', NRTL: 'NRTL', WILSON: 'Wilson', UNIQUAC: 'UNIQUAC', UNIFAC: 'UNIFAC (preditivo)', PR: 'Peng-Robinson', SRK: 'Soave-Redlich-Kwong'
  };

  function Thermo(compIds, model, opts) {
    opts = opts || {};
    this.ids = compIds.slice();
    this.c = compIds.map(id => { if (!COMP[id]) throw new Error('Componente desconhecido: ' + id); return COMP[id]; });
    this.n = this.c.length; this.model = model || 'NRTL';
    this.isEOS = this.model === 'PR' || this.model === 'SRK';
    this.act = []; this.c.forEach((c, i) => { if (!c.nv && !c.solid) this.act.push(i); });
    this.warnings = []; this.pairInfo = [];
    this.userBinary = opts.binary || {};
    this.kijUser = opts.kij || {};
    this._setup();
  }
  Thermo.prototype._setup = function () {
    const act = this.act.map(i => this.c[i]), na = act.length, self = this;
    if (this.isEOS) {
      this.kij = act.map((ci, i) => act.map((cj, j) => { if (i === j) return 0; const k = pairKey(ci.id, cj.id); return this.kijUser[k] != null ? this.kijUser[k] : (KIJ_DB[k] || 0); }));
      for (let i = 0; i < na; i++) for (let j = i + 1; j < na; j++) this.pairInfo.push({ i: act[i].id, j: act[j].id, src: this.kij[i][j] ? 'kij do banco' : 'kij = 0', kij: this.kij[i][j] });
      return;
    }
    if (this.model === 'IDEAL') return;
    const allGroups = act.every(c => c.g);
    if (this.model === 'UNIFAC') {
      const sub = act.filter(c => c.g);
      if (sub.length < na) this.warnings.push('UNIFAC: componentes sem grupos (' + act.filter(c => !c.g).map(c => c.name).join(', ') + ') tratados como ideais.');
      this.unifacIdx = []; act.forEach((c, k) => { if (c.g) this.unifacIdx.push(k); });
      this.unifac = makeUnifac(sub);
      return;
    }
    // NRTL / WILSON / UNIQUAC: parâmetros binários
    const P = { a: [], b: [], c: [] };
    for (let i = 0; i < na; i++) { P.a.push(new Array(na).fill(0)); P.b.push(new Array(na).fill(0)); P.c.push(new Array(na).fill(0.3)); }
    if (this.model === 'UNIQUAC') {
      P.r = act.map(c => (c.g ? makeUnifac([c]).r[0] : estimateRQ(c)[0]));
      P.q = act.map(c => (c.g ? makeUnifac([c]).q[0] : estimateRQ(c)[1]));
    }
    for (let i = 0; i < na; i++) for (let j = i + 1; j < na; j++) {
      const ci = act[i], cj = act[j], key = pairKey(ci.id, cj.id), flip = ci.id > cj.id;
      let src = '', pr = null;
      const user = this.userBinary[this.model + ':' + key];
      if (user) { pr = Object.assign({}, user); src = 'Informado pelo usuário'; }
      else {
        const db = NRTL_DB[key];
        const refGamma = db ? (x, T) => nrtlGamma(x, T, { a: [[0, db.a12], [db.a21, 0]], b: [[0, db.b12], [db.b21, 0]], c: [[0, db.c], [db.c, 0]] })
          : (ci.g && cj.g) ? (function () { const u = makeUnifac([COMP[key.split('|')[0]], COMP[key.split('|')[1]]]); return u.gamma; })() : null;
        if (this.model === 'NRTL' && db) { pr = { a12: db.a12, a21: db.a21, b12: db.b12, b21: db.b21, c: db.c }; src = db.src; }
        else if (refGamma) {
          const c1 = COMP[key.split('|')[0]], c2 = COMP[key.split('|')[1]];
          let T1 = Math.min(c1.tb, c2.tb), T2 = Math.max(c1.tb, c2.tb);
          if (T2 - T1 < 20) { T1 -= 10; T2 += 10; }
          T1 = Math.max(250, T1); T2 = Math.min(600, T2, Math.min(c1.tc, c2.tc) - 5);
          if (T2 - T1 < 10) T1 = T2 - 20;
          const extra = this.model === 'UNIQUAC' ? { r: [c1, c2].map(c => (c.g ? makeUnifac([c]).r[0] : estimateRQ(c)[0])), q: [c1, c2].map(c => (c.g ? makeUnifac([c]).q[0] : estimateRQ(c)[1])) } : null;
          pr = cachedFit(this.model, key, refGamma, T1, T2, extra);
          src = (db ? 'Regredido do banco NRTL' : 'Estimado por UNIFAC') + ' (rms ln γ = ' + pr.rms.toFixed(3) + ')';
        } else { pr = { a12: 0, a21: 0, b12: 0, b21: 0, c: 0.3 }; src = 'Sem dados — ideal'; this.warnings.push('Par ' + ci.name + '/' + cj.name + ' sem parâmetros: assumido ideal.'); }
      }
      // pr está na ordem alfabética da chave; ajusta para a ordem (i,j)
      const a12 = flip ? pr.a21 : pr.a12, a21 = flip ? pr.a12 : pr.a21, b12 = flip ? pr.b21 : pr.b12, b21 = flip ? pr.b12 : pr.b21;
      P.a[i][j] = a12; P.a[j][i] = a21; P.b[i][j] = b12; P.b[j][i] = b21; P.c[i][j] = P.c[j][i] = pr.c != null ? pr.c : 0.3;
      this.pairInfo.push({ i: ci.id, j: cj.id, src, a12, a21, b12, b21, c: P.c[i][j] });
    }
    this.P = P;
  };
  const FIT_CACHE = {};
  function cachedFit(model, key, ref, T1, T2, extra) {
    const k = model + ':' + key; if (!FIT_CACHE[k]) FIT_CACHE[k] = fitBinary(model, ref, T1, T2, extra); return FIT_CACHE[k];
  }
  function estimateRQ(c) { const v = c.mw / c.rho * 1e3; return [v / 15.17 * 0.66, v / 15.17 * 0.66 * 0.85]; } // Bondi aproximado

  Thermo.prototype.comp = function (i) { return this.c[i]; };
  Thermo.prototype.psat = function (i, T) { return psatComp(this.c[i], T); };
  Thermo.prototype.gamma = function (x, T) {
    const n = this.n, out = new Array(n).fill(1);
    if (this.isEOS || this.model === 'IDEAL' || this.act.length < 2) return out;
    let s = 0; this.act.forEach(i => { s += x[i]; });
    if (s <= 0) return out;
    const xa = this.act.map(i => Math.max(x[i], 0) / s);
    let g;
    if (this.model === 'NRTL') g = nrtlGamma(xa, T, this.P);
    else if (this.model === 'WILSON') g = wilsonGamma(xa, T, this.P);
    else if (this.model === 'UNIQUAC') g = uniquacGamma(xa, T, this.P);
    else if (this.model === 'UNIFAC') {
      g = new Array(xa.length).fill(1);
      if (this.unifacIdx.length > 1) {
        let ss = 0; this.unifacIdx.forEach(k => { ss += xa[k]; });
        if (ss > 0) { const gu = this.unifac.gamma(this.unifacIdx.map(k => xa[k] / ss), T); this.unifacIdx.forEach((k, m) => { g[k] = gu[m]; }); }
      }
    }
    this.act.forEach((i, k) => { out[i] = isFinite(g[k]) ? g[k] : 1; });
    return out;
  };

  /* EOS: coeficientes de fugacidade e entalpia residual */
  Thermo.prototype._eosParams = function (T) {
    const isPR = this.model === 'PR', act = this.act.map(i => this.c[i]);
    const Oa = isPR ? 0.45724 : 0.42748, Ob = isPR ? 0.07780 : 0.08664;
    return act.map(c => {
      const m = isPR ? 0.37464 + 1.54226 * c.w - 0.26992 * c.w * c.w : 0.480 + 1.574 * c.w - 0.176 * c.w * c.w;
      const sq = 1 + m * (1 - Math.sqrt(T / c.tc)), alpha = sq * sq, ac = Oa * R * R * c.tc * c.tc / c.pc;
      return { a: ac * alpha, da: -ac * m * sq / Math.sqrt(T * c.tc), b: Ob * R * c.tc / c.pc };
    });
  };
  Thermo.prototype._eos = function (xfull, T, P, phase) {
    const act = this.act; let s = 0; act.forEach(i => { s += xfull[i]; });
    const x = act.map(i => (s > 0 ? xfull[i] / s : 1 / act.length)), n = x.length, pr = this._eosParams(T), isPR = this.model === 'PR';
    let a = 0, da = 0, b = 0; const sa = new Array(n).fill(0);
    for (let i = 0; i < n; i++) { b += x[i] * pr[i].b; for (let j = 0; j < n; j++) {
      const aij = Math.sqrt(pr[i].a * pr[j].a) * (1 - this.kij[i][j]);
      a += x[i] * x[j] * aij; sa[i] += x[j] * aij;
      da += x[i] * x[j] * (1 - this.kij[i][j]) * 0.5 * Math.sqrt(pr[i].a * pr[j].a) * (pr[i].da / pr[i].a + pr[j].da / pr[j].a);
    } }
    const A = a * P / (R * R * T * T), B = b * P / (R * T);
    const roots = isPR ? cubicRoots(-(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B ** 3)) : cubicRoots(-1, A - B - B * B, -A * B);
    const valid = roots.filter(z => z > B);
    const Z = phase === 'V' ? valid[valid.length - 1] : valid[0];
    const lnphi = new Array(n); let Hres;
    if (isPR) {
      const s2 = Math.SQRT2, L = Math.log((Z + (1 + s2) * B) / (Z + (1 - s2) * B));
      for (let i = 0; i < n; i++) lnphi[i] = pr[i].b / b * (Z - 1) - Math.log(Z - B) - A / (2 * s2 * B) * (2 * sa[i] / a - pr[i].b / b) * L;
      Hres = R * T * (Z - 1) + (T * da - a) / (2 * s2 * b) * L;
    } else {
      const L = Math.log(1 + B / Z);
      for (let i = 0; i < n; i++) lnphi[i] = pr[i].b / b * (Z - 1) - Math.log(Z - B) - A / B * (2 * sa[i] / a - pr[i].b / b) * L;
      Hres = R * T * (Z - 1) + (T * da - a) / b * L;
    }
    const phi = new Array(this.n).fill(1); act.forEach((i, k) => { phi[i] = Math.exp(lnphi[k]); });
    return { phi, Z, Hres, frac: s };
  };

  Thermo.prototype.K = function (T, P, x, y) {
    const n = this.n, K = new Array(n);
    if (this.isEOS) {
      const L = this._eos(x, T, P, 'L'), V = this._eos(y, T, P, 'V');
      for (let i = 0; i < n; i++) K[i] = (this.c[i].nv || this.c[i].solid) ? 1e-20 : L.phi[i] / V.phi[i];
      return K;
    }
    const g = this.gamma(x, T);
    for (let i = 0; i < n; i++) K[i] = (this.c[i].nv || this.c[i].solid) ? 1e-20 : g[i] * this.psat(i, T) / P;
    return K;
  };
  Thermo.prototype.Kwilson = function (T, P) {
    return this.c.map(c => (c.nv || c.solid) ? 1e-20 : c.pc / P * Math.exp(5.373 * (1 + c.w) * (1 - c.tc / T)));
  };

  /* entalpias molares (J/mol) */
  Thermo.prototype.hL = function (x, T, P) {
    let h = 0; const c = this.c;
    if (this.isEOS) {
      for (let i = 0; i < this.n; i++) h += x[i] * ((c[i].nv || c[i].solid) ? hIGcomp(c[i], T) : hIGcomp(c[i], T));
      const e = this._eos(x, T, P || PATM, 'L'); h += e.frac * e.Hres; return h;
    }
    for (let i = 0; i < this.n; i++) h += x[i] * (hIGcomp(c[i], T) - dHvapComp(c[i], T));
    return h;
  };
  Thermo.prototype.hV = function (y, T, P) {
    let h = 0; for (let i = 0; i < this.n; i++) h += y[i] * hIGcomp(this.c[i], T);
    if (this.isEOS) { const e = this._eos(y, T, P || PATM, 'V'); h += e.frac * e.Hres; }
    return h;
  };
  Thermo.prototype.cpIG = function (y, T) { let s = 0; for (let i = 0; i < this.n; i++) s += y[i] * cpIGcomp(this.c[i], T); return s; };
  Thermo.prototype.mw = function (x) { let s = 0; for (let i = 0; i < this.n; i++) s += x[i] * this.c[i].mw; return s; };
  Thermo.prototype.rhoL = function (x) { let v = 0; for (let i = 0; i < this.n; i++) v += x[i] * this.c[i].mw * 1e-3 / this.c[i].rho; return this.mw(x) * 1e-3 / v; }; // kg/m3
  Thermo.prototype.vL = function (x) { let v = 0; for (let i = 0; i < this.n; i++) v += x[i] * this.c[i].mw * 1e-3 / this.c[i].rho; return v; }; // m3/mol
  Thermo.prototype.rhoV = function (y, T, P) { let Z = 1; if (this.isEOS) Z = this._eos(y, T, P, 'V').Z; return P * this.mw(y) * 1e-3 / (Z * R * T); };

  /* ------------------------------------------------------------------ flashes */
  function rachfordRice(z, K) {
    let f0 = 0, f1 = 0;
    for (let i = 0; i < z.length; i++) { if (z[i] <= 0) continue; f0 += z[i] * (K[i] - 1); f1 += z[i] * (K[i] - 1) / K[i]; }
    if (f0 <= 0) return 0; if (f1 >= 0) return 1;
    let lo = 0, hi = 1, b = 0.5;
    for (let it = 0; it < 200; it++) {
      let f = 0, df = 0;
      for (let i = 0; i < z.length; i++) { if (z[i] <= 0) continue; const d = 1 + b * (K[i] - 1); f += z[i] * (K[i] - 1) / d; df -= z[i] * (K[i] - 1) ** 2 / (d * d); }
      if (f > 0) lo = b; else hi = b;
      let bn = b - f / df; if (!(bn > lo && bn < hi)) bn = 0.5 * (lo + hi);
      if (Math.abs(bn - b) < 1e-14) { b = bn; break; }
      b = bn;
    }
    return b;
  }
  Thermo.prototype.flashTP = function (z, T, P) {
    const n = this.n; let K = this.isEOS ? this.Kwilson(T, P) : this.K(T, P, z, z);
    let beta = 0, x = z.slice(), y = z.slice();
    if (this.act.length === 0) return { T, P, beta: 0, x: z.slice(), y: z.slice(), K, phase: 'L' };
    for (let it = 0; it < 300; it++) {
      beta = rachfordRice(z, K);
      for (let i = 0; i < n; i++) { const d = 1 + beta * (K[i] - 1); x[i] = z[i] / d; y[i] = K[i] * x[i]; }
      if (beta === 1) { for (let i = 0; i < n; i++) { y[i] = z[i]; x[i] = z[i] / K[i]; } }
      x = N.normalize(x); y = N.normalize(y);
      const Kn = this.K(T, P, x, y);
      let err = 0; for (let i = 0; i < n; i++) if (z[i] > 0) err = Math.max(err, Math.abs(Kn[i] - K[i]) / Math.max(K[i], 1e-30));
      const damp = it > 60 ? 0.5 : 1;
      K = Kn.map((v, i) => damp * v + (1 - damp) * K[i]);
      if (err < 1e-10) break;
    }
    beta = rachfordRice(z, K);
    for (let i = 0; i < n; i++) { const d = 1 + beta * (K[i] - 1); x[i] = z[i] / d; y[i] = K[i] * x[i]; }
    if (beta === 1) for (let i = 0; i < n; i++) { y[i] = z[i]; x[i] = z[i] / K[i]; }
    x = N.normalize(x); y = N.normalize(y);
    if (this.isEOS) { // solução trivial (K → 1): identifica a fase pela temperatura pseudocrítica / volume reduzido
      let trivial = true; for (let i = 0; i < n; i++) if (z[i] > 0 && !(this.c[i].nv || this.c[i].solid) && Math.abs(Math.log(K[i])) > 1e-4) trivial = false;
      if (trivial) {
        let Tpc = 0, s = 0; this.act.forEach(i => { Tpc += z[i] * this.c[i].tc; s += z[i]; }); Tpc /= s;
        const e = this._eos(z, T, P, 'V'), pr = this._eosParams(T); let bmix = 0; this.act.forEach((i, k) => { bmix += z[i] / s * pr[k].b; });
        const vapor = T > Tpc || (e.Z * R * T / P) / bmix > 1.75;
        beta = vapor ? 1 : 0; x = z.slice(); y = z.slice();
      }
    }
    if (beta === 0) x = z.slice(); if (beta === 1) y = z.slice();
    return { T, P, beta, x, y, K, phase: beta <= 0 ? 'L' : beta >= 1 ? 'V' : 'LV' };
  };
  Thermo.prototype.enthalpy = function (f) { return (1 - f.beta) * this.hL(f.x, f.T, f.P) + f.beta * this.hV(f.y, f.T, f.P); };

  Thermo.prototype.bubbleT = function (x, P, Tg) {
    const self = this; let y = x.slice();
    const g = (T) => { let K = self.K(T, P, x, y), S = 0; for (let it = 0; it < 50; it++) { S = 0; for (let i = 0; i < self.n; i++) S += x[i] * K[i]; const yn = x.map((v, i) => v * K[i] / S); if (!self.isEOS) { y = yn; break; } let e = 0; yn.forEach((v, i) => { e = Math.max(e, Math.abs(v - y[i])); }); y = yn; K = self.K(T, P, x, y); if (e < 1e-10) break; } return Math.log(S); };
    Tg = Tg || this.guessT(x);
    const br = N.bracket(g, Tg - 5, Tg + 5, 40, 2500); if (!br) throw new Error('Ponto de bolha não encontrado');
    const T = N.brent(g, br[0], br[1], 1e-8); g(T);
    return { T, y: N.normalize(y) };
  };
  Thermo.prototype.dewT = function (y, P, Tg) {
    const self = this; let x = y.slice();
    if (this.c.some((c, i) => (c.nv || c.solid) && y[i] > 1e-12)) throw new Error('Ponto de orvalho indefinido (componente não volátil)');
    const g = (T) => { let S = 0; for (let it = 0; it < 80; it++) { const K = self.K(T, P, x, y); S = 0; for (let i = 0; i < self.n; i++) S += y[i] / K[i]; const xn = y.map((v, i) => v / K[i] / S); let e = 0; xn.forEach((v, i) => { e = Math.max(e, Math.abs(v - x[i])); }); x = xn; if (e < 1e-10) break; } return -Math.log(S); };
    Tg = Tg || this.guessT(y) + 5;
    const br = N.bracket(g, Tg - 5, Tg + 5, 40, 2500); if (!br) throw new Error('Ponto de orvalho não encontrado');
    const T = N.brent(g, br[0], br[1], 1e-8); g(T);
    return { T, x: N.normalize(x) };
  };
  Thermo.prototype.guessT = function (z) { let s = 0, w = 0; this.c.forEach((c, i) => { if (!c.nv && !c.solid) { s += z[i] * c.tb; w += z[i]; } }); return w > 0 ? s / w : 373; };

  Thermo.prototype.flashPH = function (z, P, H, Tg) {
    const self = this; Tg = Tg || this.guessT(z);
    const f = (T) => self.enthalpy(self.flashTP(z, T, P)) - H;
    const br = N.bracket(f, Tg - 10, Tg + 10, 30, 3000); if (!br) throw new Error('Flash PH sem solução');
    const T = N.brent(f, br[0], br[1], 1e-7);
    return this.flashTP(z, T, P);
  };
  Thermo.prototype.flashPVF = function (z, P, vf) {
    if (vf <= 1e-9) { const b = this.bubbleT(z, P); return this.flashTP(z, b.T - 1e-6, P); }
    const self = this, Tb = this.bubbleT(z, P).T; let Td;
    try { Td = vf >= 1 - 1e-9 ? this.dewT(z, P).T : this.dewT(z, P).T; } catch (e) { Td = Tb + 600; }
    if (vf >= 1 - 1e-9) return this.flashTP(z, Td + 1e-6, P);
    const T = N.brent(T => self.flashTP(z, T, P).beta - vf, Tb, Td, 1e-8);
    return this.flashTP(z, T, P);
  };

  /* Separação líquido-líquido (ELL) a T, P. Retorna null se a mistura for monofásica. */
  Thermo.prototype.flashLL = function (z, T) {
    if (this.isEOS || this.model === 'IDEAL' || this.model === 'WILSON') return null;
    const n = this.n, act = this.act;
    // candidatos: pares com maior γ∞
    let best = null;
    for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
      const i = act[a], j = act[b];
      const xi = new Array(n).fill(0); xi[i] = 1 - 1e-6; xi[j] = 1e-6; const gj = this.gamma(xi, T)[j];
      const xj = new Array(n).fill(0); xj[j] = 1 - 1e-6; xj[i] = 1e-6; const gi = this.gamma(xj, T)[i];
      const s = Math.log(gi) + Math.log(gj); if (!best || s > best.s) best = { s, i, j };
    }
    if (!best || best.s < 3) return null;
    let xI = z.map((v, k) => (k === best.i ? 0.9 : v * 0.1 + 1e-6)), xII = z.map((v, k) => (k === best.j ? 0.9 : v * 0.1 + 1e-6));
    this.c.forEach((c, k) => { if (c.solid) { xI[k] = 0; xII[k] = 0; } });
    xI = N.normalize(xI); xII = N.normalize(xII);
    let beta = 0.5, K;
    for (let it = 0; it < 500; it++) {
      const gI = this.gamma(xI, T), gII = this.gamma(xII, T);
      K = gII.map((g, k) => (this.c[k].solid ? 1e-20 : g / gI[k])); // xI = K xII
      beta = rachfordRice(z, K);
      if (beta <= 0 || beta >= 1) return null;
      const nI = z.map((v, k) => K[k] * v / (1 + beta * (K[k] - 1))), nII = z.map((v, k) => v / (1 + beta * (K[k] - 1)));
      const xIn = N.normalize(nI), xIIn = N.normalize(nII);
      let e = 0; for (let k = 0; k < n; k++) e = Math.max(e, Math.abs(xIn[k] - xI[k]), Math.abs(xIIn[k] - xII[k]));
      xI = xIn.map((v, k) => 0.7 * v + 0.3 * xI[k]); xII = xIIn.map((v, k) => 0.7 * v + 0.3 * xII[k]);
      if (e < 1e-10) break;
    }
    let d = 0; for (let k = 0; k < n; k++) d = Math.max(d, Math.abs(xI[k] - xII[k]));
    if (d < 1e-3) return null;
    return { beta, xI, xII, K };
  };

  /* Diagramas Txy / xy e detecção de azeótropo para um par binário a P */
  Thermo.prototype.binaryTxy = function (i, j, P, npts) {
    npts = npts || 41; const out = { x: [], y: [], T: [] };
    let Tg;
    for (let k = 0; k < npts; k++) {
      const x1 = k / (npts - 1); const z = new Array(this.n).fill(0); z[i] = x1; z[j] = 1 - x1;
      const b = this.bubbleT(z, P, Tg); Tg = b.T;
      out.x.push(x1); out.y.push(b.y[i]); out.T.push(b.T);
    }
    return out;
  };
  Thermo.prototype.azeotrope = function (i, j, P) {
    const d = this.binaryTxy(i, j, P, 61), diff = d.x.map((x, k) => d.y[k] - x);
    for (let k = 1; k < diff.length - 2; k++) {
      if (diff[k] * diff[k + 1] < 0) {
        const self = this;
        const f = (x1) => { const z = new Array(self.n).fill(0); z[i] = x1; z[j] = 1 - x1; return self.bubbleT(z, P, d.T[k]).y[i] - x1; };
        const xa = N.brent(f, d.x[k], d.x[k + 1], 1e-8); const z = new Array(this.n).fill(0); z[i] = xa; z[j] = 1 - xa;
        const T = this.bubbleT(z, P, d.T[k]).T;
        return { x: xa, T, type: T < Math.min(d.T[0], d.T[d.T.length - 1]) ? 'mínimo (positivo)' : 'máximo (negativo)' };
      }
    }
    return null;
  };

  SF.thermo = { R, T0, PATM, COMPONENTS, COMP, MODELS, Thermo, psatComp, hIGcomp, dHvapComp, rachfordRice, pairKey, NRTL_DB, makeUnifac, nrtlGamma };
})(typeof window !== 'undefined' ? window : globalThis);
