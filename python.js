/* SIMULA FÁCIL IA — gerador de código Python (NumPy, SciPy, Matplotlib) a partir da simulação */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const TH = SF.thermo;
  const n2s = v => { if (v == null || !isFinite(v)) return 'np.nan'; return String(+(+v).toPrecision(10)); };
  const vec = a => 'np.array([' + a.map(n2s).join(', ') + '])';
  const mat = M => 'np.array([' + M.map(r => '[' + r.map(n2s).join(', ') + ']').join(',\n    ') + '])';
  const str = s => JSON.stringify(String(s));
  const list = a => '[' + a.map(str).join(', ') + ']';
  const ident = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 30) || 'bloco';

  function blockFn(st, b) {
    const names = {}; let out = null;
    st.blocks.forEach(x => { let nm = 'bloco_' + ident(x.name || x.id); if (names[nm]) { names[nm]++; nm += '_' + names[nm]; } else names[nm] = 1; if (x === b) out = nm; });
    return out;
  }

  function dataCode(st) {
    const ids = st.components, n = ids.length, cs = ids.map(id => TH.COMP[id]);
    const act = ['IDEAL', 'NRTL', 'WILSON', 'UNIQUAC', 'UNIFAC'].indexOf(st.model) >= 0;
    const A = [], B = [], C = []; for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); B.push(new Array(n).fill(0)); C.push(new Array(n).fill(0.3)); }
    const note = st.model === 'NRTL' ? 'parâmetros NRTL do simulador' : st.model === 'IDEAL' ? 'solução ideal (gama = 1)' : 'parâmetros NRTL equivalentes (regredidos) ao modelo ' + TH.MODELS[st.model];
    if (act && st.model !== 'IDEAL') {
      const th = new TH.Thermo(ids, 'NRTL', { binary: st.binary });
      th.act.forEach((i, ii) => th.act.forEach((j, jj) => { A[i][j] = th.P.a[ii][jj]; B[i][j] = th.P.b[ii][jj]; C[i][j] = th.P.c[ii][jj]; }));
    }
    return { act, note, code: [
      '# ---------------------------------------------------------------- dados dos componentes',
      'IDS = ' + list(ids),
      'NOMES = ' + list(cs.map(c => c.name)),
      'MW = ' + vec(cs.map(c => c.mw)) + '   # g/mol',
      'TC = ' + vec(cs.map(c => c.tc)) + '   # K',
      'PC = ' + vec(cs.map(c => c.pc)) + '   # Pa',
      'W = ' + vec(cs.map(c => c.w)) + '   # fator acêntrico',
      'NV = np.array([' + cs.map(c => (c.nv || c.solid ? 'True' : 'False')).join(', ') + '])   # não voláteis / sólidos',
      '# Antoine: log10(P/mmHg) = A - B/(C + t/°C); nan => Lee-Kesler',
      'ANT = ' + mat(cs.map(c => (c.ant ? c.ant : [NaN, NaN, NaN]))),
      '# ' + note + ': tau_ij = a_ij + b_ij/T ; G_ij = exp(-c_ij*tau_ij)',
      'A_NRTL = ' + mat(A),
      'B_NRTL = ' + mat(B),
      'C_NRTL = ' + mat(C),
      'MODELO = ' + str(TH.MODELS[st.model])].join('\n') };
  }

  const VLE = `
# ---------------------------------------------------------------- equilíbrio líquido-vapor
def psat(i, T):
    """Pressão de vapor (Pa): Antoine abaixo de Tc, Lee-Kesler caso contrário."""
    if NV[i]:
        return 1e-12
    if not np.isnan(ANT[i, 0]) and T < TC[i]:
        return 10 ** (ANT[i, 0] - ANT[i, 1] / (ANT[i, 2] + T - 273.15)) * 133.322368
    Tr = T / TC[i]
    f0 = 5.92714 - 6.09648 / Tr - 1.28862 * np.log(Tr) + 0.169347 * Tr ** 6
    f1 = 15.2518 - 15.6875 / Tr - 13.4721 * np.log(Tr) + 0.43577 * Tr ** 6
    return PC[i] * np.exp(f0 + W[i] * f1)


def gama_nrtl(a, b, c, x, T):
    """Coeficientes de atividade NRTL."""
    x = np.asarray(x, float)
    n = len(x)
    tau = a + b / T
    np.fill_diagonal(tau, 0.0)
    G = np.exp(-c * tau)
    S = G.T @ x
    Cc = (tau * G).T @ x
    lng = Cc / S
    for i in range(n):
        lng[i] += np.sum(x * G[i, :] / S * (tau[i, :] - Cc / S))
    return np.exp(lng)


def valores_K(x, T, P):
    """K = gama*Psat/P (vapor ideal); não voláteis com K = 0."""
    x = np.asarray(x, float)
    n = len(x)
    K = np.zeros(n)
    g = np.ones(n)
    idx = np.where(~NV)[0]
    if len(idx) > 1 and x[idx].sum() > 0:
        xs = x[idx] / x[idx].sum()
        g[idx] = gama_nrtl(A_NRTL[np.ix_(idx, idx)], B_NRTL[np.ix_(idx, idx)], C_NRTL[np.ix_(idx, idx)], xs, T)
    for i in idx:
        K[i] = g[i] * psat(i, T) / P
    return K


def ponto_bolha(x, P):
    """Temperatura de bolha (K) e composição do vapor incipiente."""
    x = np.asarray(x, float)
    f = lambda T: np.log(np.sum(valores_K(x, T, P) * x))
    Ts = np.linspace(150, 900, 151)
    fs = np.array([f(t) for t in Ts])
    k = np.where(fs[:-1] * fs[1:] <= 0)[0][0]
    T = brentq(f, Ts[k], Ts[k + 1], xtol=1e-10)
    K = valores_K(x, T, P)
    return T, K * x / np.sum(K * x)
`;

  const FLASH = `
def flash_TP(z, T, P):
    """Flash isotérmico: Rachford-Rice com atualização sucessiva de K."""
    z = np.asarray(z, float)
    x = z.copy()
    K = valores_K(x, T, P)
    beta = 0.0
    for _ in range(200):
        rr = lambda b: np.sum(z * (K - 1) / (1 + b * (K - 1)))
        if rr(0) <= 0:
            beta = 0.0
        elif np.sum(z * (K - 1) / np.maximum(K, 1e-30)) >= 0:
            beta = 1.0
        else:
            beta = brentq(rr, 0, 1 - 1e-12)
        x = z / (1 + beta * (K - 1)); x /= x.sum()
        y = K * x; y /= y.sum()
        Kn = valores_K(x, T, P)
        if np.max(np.abs(Kn - K) / np.maximum(K, 1e-30)) < 1e-10:
            K = Kn
            break
        K = Kn
    return beta, x, y
`;

  const PFD_HELPERS = `
# ---------------------------------------------------------------- desenho do fluxograma
AZUL, AMARELO, PREENCHE, CONTORNO = '#1f6feb', '#c99200', '#ffe6dc', '#ec6a4c'


def seta(ax, x0, y0, x1, y1, cor=AZUL):
    ax.annotate('', xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle='-|>', color=cor, lw=2, mutation_scale=16))
`;


  /* biblioteca de ícones em Python, gerada a partir das mesmas primitivas do simulador */
  const offP = (b, v) => (v >= 0 ? b + ' + ' + n2s(v) : b + ' - ' + n2s(-v));
  function primPy(p) {
    const st = SF.icons.STYLE[p.c] || SF.icons.STYLE.body;
    const fc = st.fill && st.fill !== 'none' ? "'" + st.fill + "'" : "'none'", ec = "'" + (st.stroke || '#000000') + "'", ls = st.dash ? ", ls='--'" : '';
    if (p.t === 'rect') return "ax.add_patch(FancyBboxPatch((" + offP('x', p.x) + ', ' + offP('y', p.y) + '), ' + n2s(p.w) + ', ' + n2s(p.h) + ", boxstyle='" + (p.r > 0 ? 'round,pad=0,rounding_size=' + n2s(p.r) : 'square,pad=0') + "', fc=" + fc + ', ec=' + ec + ', lw=' + st.lw + ls + ', zorder=z)); z += .01';
    if (p.t === 'circ') return 'ax.add_patch(Circle((' + offP('x', p.cx) + ', ' + offP('y', p.cy) + '), ' + n2s(p.r) + ', fc=' + fc + ', ec=' + ec + ', lw=' + st.lw + ', zorder=z)); z += .01';
    if (p.t === 'line') return 'ax.plot(x + ' + vec(p.pts.map(q => q[0])) + ', y + ' + vec(p.pts.map(q => q[1])) + ', color=' + ec + ', lw=' + st.lw + ls + ", solid_capstyle='round', zorder=z); z += .01";
    if (p.t === 'poly') return 'ax.add_patch(Polygon(np.column_stack((x + ' + vec(p.pts.map(q => q[0])) + ', y + ' + vec(p.pts.map(q => q[1])) + ')), closed=True, fc=' + fc + ', ec=' + ec + ', lw=' + st.lw + ', zorder=z)); z += .01';
    return 'ax.text(' + offP('x', p.x) + ', ' + offP('y', p.y - 4) + ', ' + str(p.s) + ", fontsize=8, fontweight='bold', color='" + (st.text || '#000000') + "', ha='center', va='center', zorder=z); z += .01";
  }
  function iconLibPy(types) {
    const L = ['def desenha_icone(ax, tipo, x, y):', '    """Ícones de processo no padrão análogo a Aspen Plus, HYSYS e DWSIM (mesmas formas do SIMULA FÁCIL IA)."""', '    z = 3.0'];
    types.forEach((t, k) => { L.push('    ' + (k ? 'elif' : 'if') + ' tipo == ' + str(t) + ':   # ' + (SF.units.TYPES[t] ? SF.units.TYPES[t].label : t)); SF.icons.prims(t).forEach(p => L.push('        ' + primPy(p))); });
    return L.join('\n');
  }

  function pfdCode(st, res) {
    const IC = SF.icons, P = SF.pfd;
    const bmap = {}; st.blocks.forEach(b => { bmap[b.id] = b; });
    const L = ['def desenha_pfd():', '    """Fluxograma do processo (coordenadas do editor; eixo y para baixo)."""',
      '    fig, ax = plt.subplots(figsize=(16, 8))'];
    st.streams.forEach(s => {
      const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return;
      const pts = P.route(P.portPos(a, s.fromPort), P.portPos(b, s.toPort), st.blocks, P.portOffset(st, s));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), n = pts.length, m = Math.floor((n - 1) / 2);
      L.push('    ax.plot([' + xs.map(n2s).join(', ') + '], [' + ys.map(n2s).join(', ') + '], color=AZUL, lw=2, zorder=1)');
      L.push('    seta(ax, ' + [xs[n - 2], ys[n - 2], xs[n - 1], ys[n - 1]].map(n2s).join(', ') + ')');
      L.push('    ax.text(' + n2s((xs[m] + xs[m + 1]) / 2) + ', ' + n2s((ys[m] + ys[m + 1]) / 2) + ', ' + str(s.name) + ", color=AZUL, fontsize=FSP, fontweight='bold', ha='center', va='center', bbox=dict(boxstyle='round,pad=0.25', fc='white', ec=AZUL), zorder=6)");
    });
    (res.extraStreams || []).forEach(x => {
      const b = bmap[x.from]; if (!b) return; const p = P.portPos(b, x.fromPort); const ex = p.x + p.dir[0] * 46, ey = p.y + p.dir[1] * 46;
      L.push('    seta(ax, ' + [p.x, p.y, ex, ey].map(n2s).join(', ') + ')');
      L.push('    ax.text(' + n2s(ex + 4) + ', ' + n2s(ey) + ', ' + str(x.name) + ", color=AZUL, fontsize=FSP, fontweight='bold', va='center')");
    });
    st.blocks.forEach(b => {
      const g = IC.G[b.type];
      L.push('    desenha_icone(ax, ' + str(b.type) + ', ' + n2s(b.x) + ', ' + n2s(b.y) + ')');
      L.push('    ax.text(' + n2s(b.x + P.nameX(b)) + ', ' + n2s(b.y + g.h + 16) + ', ' + str(b.name) + ", fontsize=FSP, fontweight='bold', ha='center', va='center', zorder=6)");
      const r = res.blocks[b.id]; if (!r) return;
      if (r.duties && (b.type === 'column' || b.type === 'column_short')) {
        L.push('    ax.text(' + n2s(b.x + 96) + ', ' + n2s(b.y - 14) + ', ' + str('Qc = ' + (r.duties.Qc / 1000).toFixed(1) + ' kW') + ", color=AMARELO, fontsize=FSP - 1, fontweight='bold', va='center', zorder=6)");
        L.push('    ax.text(' + n2s(b.x + 74) + ', ' + n2s(b.y + g.h + 34) + ', ' + str('Qr = ' + (r.duties.Qr / 1000).toFixed(1) + ' kW') + ", color=AMARELO, fontsize=FSP - 1, fontweight='bold', va='center', zorder=6)");
      } else if (r.duty != null && Math.abs(r.duty) > 1 && b.type !== 'feed') {
        L.push('    ax.text(' + n2s(b.x + g.w / 2) + ', ' + n2s(b.y + g.h + 34) + ', ' + str((r.power ? 'W = ' : 'Q = ') + (r.duty / 1000).toFixed(1) + ' kW') + ", color=AMARELO, fontsize=FSP - 1, fontweight='bold', ha='center', va='center', zorder=6)");
      }
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.blocks.forEach(b => { const g = IC.G[b.type]; x0 = Math.min(x0, b.x - 40); y0 = Math.min(y0, b.y - 40); x1 = Math.max(x1, b.x + g.w + 190); y1 = Math.max(y1, b.y + g.h + 50); });
    st.streams.forEach(s => { const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return; P.route(P.portPos(a, s.fromPort), P.portPos(b, s.toPort), st.blocks, P.portOffset(st, s)).forEach(q => { y1 = Math.max(y1, q[1] + 20); }); });
    const W = x1 - x0, H = y1 - y0, fw = 16, fh = Math.max(5, Math.min(11, fw * H / W + 1));
    L[2] = '    fig, ax = plt.subplots(figsize=(' + fw + ', ' + n2s(fh) + '))';
    L.push("    ax.set_xlim(" + n2s(x0) + ', ' + n2s(x1) + '); ax.set_ylim(' + n2s(y1) + ', ' + n2s(y0) + ")   # eixo y para baixo, como no editor",
      "    ax.set_aspect('equal'); ax.axis('off')",
      '    fig.suptitle(' + str(st.name + ' — fluxograma do processo') + ', fontsize=FS)', '    fig.tight_layout()', '    return fig');
    return L.join('\n');
  }

  function streamsCode(st, res) {
    const th = res.th;
    const L = st.streams.map(s => ({ name: s.name, s: res.streams[s.id] })).concat((res.extraStreams || []).map(x => ({ name: x.name, s: res.streams[x.id] }))).filter(r => r.s);
    return ['# ---------------------------------------------------------------- correntes (resultado do simulador)',
      'CORRENTES = {', '    "nome": ' + list(L.map(r => r.name)) + ',',
      '    "T_C": ' + vec(L.map(r => r.s.T - 273.15)) + ',', '    "P_bar": ' + vec(L.map(r => r.s.P / 1e5)) + ',',
      '    "vf": ' + vec(L.map(r => r.s.beta)) + ',', '    "F_kmol_h": ' + vec(L.map(r => r.s.F * 3.6)) + ',', '    "m_kg_h": ' + vec(L.map(r => r.s.mass * 3600)) + ',',
      '    "x": ' + mat(th.ids.map((id, i) => L.map(r => r.s.z[i]))) + ',', '}', '', '',
      'def imprime_correntes():',
      "    c = CORRENTES",
      "    print(f\"\\n{'Corrente':<26}\" + ''.join(f'{n:>14}' for n in c['nome']))",
      "    for rot, k in [('T (°C)', 'T_C'), ('P (bar)', 'P_bar'), ('Fração vaporizada', 'vf'), ('Vazão (kmol/h)', 'F_kmol_h'), ('Vazão (kg/h)', 'm_kg_h')]:",
      "        print(f'{rot:<26}' + ''.join(f'{v:14.4g}' for v in c[k]))",
      '    for i, nome in enumerate(NOMES):',
      "        print(f'{\"x \" + nome:<26}' + ''.join(f'{v:14.5f}' for v in c['x'][i]))"].join('\n');
  }

  const pr = (b, r) => ['    print(f"\\n== {' + str(b.name) + '} (resultados do simulador) ==")'].concat((r.res || []).map(x => '    print(f"  {' + str(x.k) + ':<48} ' + String((typeof x.v === 'number' ? +x.v.toPrecision(6) : x.v) + ' ' + (x.u || '')).replace(/[{}"\\]/g, '') + '")'));

  function blockCode(st, res, b, td) {
    const r = res.blocks[b.id]; if (!r) return null;
    const fn = blockFn(st, b), th = res.th, head = ['def ' + fn + '():', '    """' + b.name + ' — ' + SF.units.TYPES[b.type].label + '."""'].concat(pr(b, r));
    if (b.type === 'column' && r.plots && r.plots.find(p => p.kind === 'mccabe') && td.act) {
      const m = r.plots.find(p => p.kind === 'mccabe').data;
      const i1 = th.c.findIndex(c => c.name === m.light), i2 = th.c.findIndex(c => c.name === m.heavy);
      return head.concat([
        '    # McCabe-Thiele recalculado com o modelo de atividade (equilíbrio por ponto de bolha)',
        '    i1, i2 = ' + i1 + ', ' + i2 + '   # chave leve e pesada', '    P = ' + n2s(r.profile.P[0]) + '   # Pa',
        '    xD, xB, zF, q, R = ' + [m.xD, m.xB, m.zF, m.q, m.R].map(n2s).join(', '),
        '    xe = np.linspace(0, 1, 101)', '    ye = np.zeros_like(xe)',
        '    for k, xx in enumerate(xe):', '        x = np.zeros(len(IDS)); x[i1] = xx; x[i2] = 1 - xx',
        '        _, yv = ponto_bolha(x, P)', '        ye[k] = yv[i1] / (yv[i1] + yv[i2])',
        '    rol = lambda x: R / (R + 1) * x + xD / (R + 1)',
        '    xi = zF if abs(q - 1) < 1e-6 else (-zF / (q - 1) - xD / (R + 1)) / (R / (R + 1) - q / (q - 1))', '    yi = rol(xi)',
        '    sol = lambda x: xB + (yi - xB) / (xi - xB) * (x - xB)',
        '    d = ye - xe', '    kaz = next((k for k in range(1, len(xe) - 2) if d[k] * d[k + 1] < 0), None)',
        '    xmax = xe[kaz + 1] if kaz is not None else 1.0', '    sel = xe <= xmax',
        '    xs, ys, yv, N = [xD], [xD], xD, 0',
        '    while N < 200:', '        xn = float(np.interp(min(yv, ye[sel].max()), ye[sel], xe[sel]))', '        xs.append(xn); ys.append(yv); N += 1',
        '        if xn <= xB:', '            break', '        yv = rol(xn) if xn > xi else sol(xn)', '        xs.append(xn); ys.append(yv)',
        '        if len(xs) > 3 and abs(xs[-1] - xs[-3]) < 1e-7:', "            print('  Aviso: pinch — refluxo insuficiente para a separação.')", '            break',
        "    print(f'  Estágios teóricos (McCabe-Thiele gráfico): {N} (coluna rigorosa: " + m.nStages + " estágios)')",
        '    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(17, 8))',
        "    ax.plot([0, 1], [0, 1], 'k--', lw=1.5, label='Linha 45°')", "    ax.plot(xe, ye, 'b-', lw=3, label='Equilíbrio ELV')",
        "    ax.plot([xD, xi], [xD, yi], 'r-', lw=2.5, label='Reta de retificação')", "    ax.plot([xB, xi], [xB, yi], 'm-', lw=2.5, label='Reta de esgotamento')",
        "    ax.plot([zF, xi], [zF, yi], 'g-.', lw=2.5, label=f'Reta q (q = {q:.2f})')", "    ax.plot(xs, ys, 'k-', lw=1.5, label=f'Estágios (N = {N})')",
        '    if kaz is not None:', "        ax.plot(xe[kaz], ye[kaz], 'ro', ms=10, label='Azeótropo')",
        "    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect('equal'); ax.grid(True, alpha=.4)",
        "    ax.set_xlabel(f'Fração molar de {NOMES[i1]} no líquido (x)'); ax.set_ylabel(f'Fração molar de {NOMES[i1]} no vapor (y)')",
        "    ax.set_title(f'McCabe-Thiele ({NOMES[i1]}/{NOMES[i2]}) | R = {R:.2f}'); ax.legend(loc='lower right', fontsize=13)",
        '    # PFD da coluna com o ícone padrão (condensador, vaso de refluxo, refervedor)',
        "    ax2.set_xlim(-150, 300); ax2.set_ylim(-40, 270); ax2.set_aspect('equal'); ax2.invert_yaxis(); ax2.axis('off')",
        "    desenha_icone(ax2, 'column', 0, 0)",
        "    seta(ax2, -110, 115, 0, 115, '#0073cc'); ax2.text(-146, 104, f'ALIMENTAÇÃO\\n$z_F$ = {zF:.3f}', color='#0073cc', fontweight='bold', fontsize=14, va='bottom')",
        "    seta(ax2, 112, 46, 160, 46, 'g'); ax2.text(166, 46, f'DESTILADO\\n$x_D$ = {xD:.3f}', color='g', fontweight='bold', fontsize=14, va='center')",
        "    seta(ax2, 112, 208, 160, 208, '#990000'); ax2.text(166, 208, f'FUNDO\\n$x_B$ = {xB:.4f}', color='#990000', fontweight='bold', fontsize=14, va='center')",
        "    ax2.text(56, 80, f'R = {R:.2f}', color='r', fontsize=14)",
        "    ax2.set_title('Fluxograma da coluna')", '    fig.tight_layout()', '    return [fig]']).join('\n');
    }
    if (b.type === 'cstr' && r.cstr) {
      const p = b.params, rx = SF.units.compileReactions(th, p.reactions), c = r.cstr;
      const s = res.streams[(st.streams.find(x => x.to === b.id) || {}).id];
      const cpL = th.hL(s.z, s.T + 0.5, 101325) - th.hL(s.z, s.T - 0.5, 101325);
      const Cin = c.Cin, sv = Cin.indexOf(Math.max.apply(null, Cin));
      const C0 = p.mode === 'batelada' || p.init === 'igual à alimentação' ? Cin : Cin.map((v, i) => (i === sv ? v : 0));
      const thermal = p.thermal || 'isotérmico';
      return head.concat([
        '    # Balanços transientes do CSTR (solve_ivp, BDF). Concentrações em mol/L, tempo em s.',
        '    V, v0 = ' + n2s(c.V) + ', ' + n2s(p.mode === 'batelada' ? 0 : c.v0) + '   # L, L/s',
        '    Cin = ' + vec(Cin) + '   # mol/L', '    C0 = ' + vec(C0) + '   # condição inicial',
        '    nu = ' + mat(rx.map(q => q.nu)) + '   # reações x componentes', '    ordem = ' + mat(rx.map(q => q.ord)),
        '    k0, Ea, Tref, dH = ' + vec(rx.map(q => q.k)) + ', ' + vec(rx.map(q => q.Ea)) + ', ' + vec(rx.map(q => q.Tref)) + ', ' + vec(rx.map(q => q.dH)),
        '    Tin, Tiso, UA, Tj = ' + [s.T, SF.units.C2K(+p.T || 25), +p.UA || 0, SF.units.C2K(+p.Tj || 25)].map(n2s).join(', '),
        '    rhoCp = ' + n2s(Cin.reduce((a, v) => a + v, 0) * cpL) + '   # J/(L K)', '    modo = ' + str(thermal),
        '    tEnd = ' + n2s(p.mode === 'permanente' ? Math.max(20 * c.V / c.v0, +p.tEnd || 0) : (+p.tEnd || 3600)),
        '', '    def taxa(C, T):', '        return k0 * np.exp(-Ea / 8.314462618 * (1 / T - 1 / Tref)) * np.prod(np.maximum(C, 0) ** ordem, axis=1)',
        '', '    def rhs(t, y):', "        C, T = y[:-1], (Tiso if modo == 'isotérmico' else y[-1])", '        r = taxa(C, T)', '        dC = v0 / V * (Cin - C) + nu.T @ r',
        "        if modo == 'isotérmico':", '            dT = 0.0', "        elif modo == 'adiabático':", '            dT = v0 / V * (Tin - T) + np.sum(-dH * r) / rhoCp',
        '        else:', '            dT = v0 / V * (Tin - T) + (np.sum(-dH * r) + UA * (Tj - T) / V) / rhoCp', '        return np.append(dC, dT)',
        '', "    y0 = np.append(C0, Tiso if modo == 'isotérmico' else Tin)",
        "    s = solve_ivp(rhs, [0, tEnd], y0, method='BDF', rtol=1e-7, atol=1e-10, t_eval=np.linspace(0, tEnd, 400))",
        '    ativos = np.where(np.any(nu != 0, axis=0))[0]',
        '    fig, (a1, a2) = plt.subplots(1, 2, figsize=(16, 6.5))',
        '    for i in ativos:', '        a1.plot(s.t, s.y[i], lw=3, label=NOMES[i])',
        "    a1.set_xlabel('Tempo t (s)'); a1.set_ylabel('Concentração (mol/L)'); a1.set_title('CSTR: concentrações'); a1.grid(True, alpha=.4); a1.legend()",
        "    a2.plot(s.t, s.y[-1] - 273.15, 'r', lw=3); a2.set_xlabel('Tempo t (s)'); a2.set_ylabel('Temperatura (°C)'); a2.set_title('CSTR: temperatura'); a2.grid(True, alpha=.4)",
        "    print(f'  Python: C final = {np.round(s.y[:-1, -1], 4)} mol/L ; T final = {s.y[-1, -1] - 273.15:.2f} °C')",
        '    fig.tight_layout()', '    return [fig]']).join('\n');
    }
    if (b.type === 'pfr') {
      const p = b.params, rx = SF.units.compileReactions(th, p.reactions);
      const s = res.streams[(st.streams.find(x => x.to === b.id) || {}).id];
      const gas = p.phase === 'gasosa';
      const v0 = gas ? s.F * 8.314462618 * s.T / s.P * 1000 : s.F * th.vL(s.z) * 1000;
      const Cin = s.flows.map(f => f / v0), key = rx.length && rx[0].key >= 0 ? rx[0].key : Cin.indexOf(Math.max.apply(null, Cin));
      const Tiso = SF.units.C2K(+p.T || 25);
      const out = head.concat([
        '    # PFR em regime permanente (solve_ivp) e, se transiente, método das linhas com controles deslizantes.',
        '    P = dict(V=' + n2s(+p.V * 1000) + ', v0=' + n2s(v0) + ', Cin=' + vec(Cin) + ', key=' + key + ',',
        '             nu=' + mat(rx.map(q => q.nu)) + ',', '             ordem=' + mat(rx.map(q => q.ord)) + ',',
        '             kT=' + vec(rx.map(q => q.k * Math.exp(-q.Ea / 8.314462618 * (1 / Tiso - 1 / q.Tref)))) + ',   # constantes a ' + (Tiso - 273.15).toFixed(1) + ' °C',
        '             Nc=' + Math.max(10, Math.min(120, Math.round(+p.cells || 60))) + ', tEnd=' + n2s(+p.tEnd || 120) + ')',
        "    P['CA0'] = P['Cin'][P['key']]; P['k'] = P['kT'][0]",
        "    taxa = lambda C: P['kT'] * np.prod(np.maximum(C, 0) ** P['ordem'], axis=1)",
        "    s = solve_ivp(lambda V, C: P['nu'].T @ taxa(C) / P['v0'], [0, P['V']], P['Cin'], rtol=1e-8, atol=1e-12, t_eval=np.linspace(0, P['V'], 200))",
        "    ativos = np.where(np.any(P['nu'] != 0, axis=0))[0]",
        '    fig, ax = plt.subplots(figsize=(11, 6.5))', '    for i in ativos:', '        ax.plot(s.t, s.y[i], lw=3, label=NOMES[i])',
        "    ax.set_xlabel('Volume V (L)'); ax.set_ylabel('Concentração (mol/L)'); ax.grid(True, alpha=.4); ax.legend()",
        "    ax.set_title(f\"PFR permanente: $X_{{saída}}$ = {1 - s.y[P['key'], -1] / P['CA0']:.4f}\")", '    fig.tight_layout()',
        '    figs = [fig]']);
      if (p.mode === 'transiente') out.push('    figs.append(pfr_transiente(P, ' + str(b.name) + '))');
      out.push('    return figs');
      return out.join('\n');
    }
    if ((b.type === 'hx_shell' || b.type === 'hx_plate') && r.plots && r.plots[0]) {
      const d = r.plots[0].data;
      return head.concat(['    Q = ' + vec(d.Q) + '   # kW', '    Th = ' + vec(d.Th) + '   # °C', '    Tc = ' + vec(d.Tc) + '   # °C',
        '    dT1, dT2 = Th[-1] - Tc[-1], Th[0] - Tc[0]', '    mldt = (dT1 - dT2) / np.log(dT1 / dT2)',
        "    print(f'  Python: MLDT = {mldt:.3f} °C, carga = {Q[-1]:.2f} kW')",
        '    fig, ax = plt.subplots(figsize=(11, 6.5))', "    ax.plot(Q, Th, 'r-o', lw=3, label='Lado quente'); ax.plot(Q, Tc, 'b-o', lw=3, label='Lado frio')",
        "    ax.set_xlabel('Calor transferido acumulado (kW)'); ax.set_ylabel('Temperatura (°C)'); ax.set_title(" + str(b.name + ': perfil de temperatura') + "); ax.grid(True, alpha=.4); ax.legend()",
        '    fig.tight_layout()', '    return [fig]']).join('\n');
    }
    if (b.type === 'flash' && td.act && (b.params.mode === 'T e P' || !b.params.mode)) {
      const s = res.streams[(st.streams.find(x => x.to === b.id) || {}).id];
      return head.concat(['    z, T, P = ' + vec(s.z) + ', ' + n2s(SF.units.C2K(+b.params.T)) + ', ' + n2s(+b.params.P * 1e5),
        '    beta, x, y = flash_TP(z, T, P)', "    print(f'  Python: fração vaporizada = {beta:.5f}')",
        '    fig, ax = plt.subplots(figsize=(11, 6.5)); pos = np.arange(len(NOMES))',
        "    ax.bar(pos - 0.2, x, 0.4, label='Líquido x'); ax.bar(pos + 0.2, y, 0.4, label='Vapor y')",
        "    ax.set_xticks(pos); ax.set_xticklabels(NOMES); ax.set_ylabel('Fração molar'); ax.set_title(f'Flash: β = {beta:.3f}'); ax.legend(); ax.grid(True, axis='y', alpha=.4)",
        '    fig.tight_layout()', '    return [fig]']).join('\n');
    }
    if (b.type === 'column' && r.profile) {
      const p = r.profile;
      return head.concat(['    estagio = np.arange(1, ' + (p.T.length + 1) + ')', '    T = ' + vec(p.T.map(t => t - 273.15)), '    X = ' + mat(p.x),
        '    fig, (a1, a2) = plt.subplots(1, 2, figsize=(16, 6.5))', "    a1.plot(T, estagio, 'r-o', lw=3); a1.invert_yaxis(); a1.set_xlabel('Temperatura (°C)'); a1.set_ylabel('Estágio (1 = condensador)'); a1.set_title('Perfil de temperatura'); a1.grid(True, alpha=.4)",
        '    for i, nome in enumerate(NOMES):', "        a2.plot(X[:, i], estagio, '-o', lw=3, label=nome)",
        "    a2.invert_yaxis(); a2.set_xlabel('Fração molar no líquido'); a2.set_ylabel('Estágio'); a2.set_title('Perfil de composição'); a2.legend(); a2.grid(True, alpha=.4)",
        '    fig.tight_layout()', '    return [fig]']).join('\n');
    }
    if (b.type === 'feed' || b.type === 'product') return null;
    return head.concat(['    return []']).join('\n');
  }

  const PFR_TRANS = `
def pfr_transiente(P, nome):
    """PFR transiente por método das linhas, superfície 3D e controles deslizantes de v0, CA0 e k."""
    fig = plt.figure(figsize=(13, 10))
    ax = fig.add_axes([0.04, 0.27, 0.86, 0.68], projection='3d')
    cax = fig.add_axes([0.9, 0.35, 0.02, 0.5])
    sls = {}
    rot = {'v0': 'v0 (L/s)', 'CA0': 'CA0 (mol/L)', 'k': 'k (1/s)'}
    for i, nome_p in enumerate(['v0', 'CA0', 'k']):
        a = fig.add_axes([0.22, 0.17 - 0.06 * i, 0.55, 0.035])
        sls[nome_p] = Slider(a, rot[nome_p], 0.2 * P[nome_p], 3 * P[nome_p], valinit=P[nome_p])
        sls[nome_p].label.set_fontsize(15); sls[nome_p].valtext.set_fontsize(15)

    def calcula():
        Cin = P['Cin'].copy(); Cin[P['key']] = sls['CA0'].val
        kT = P['kT'].copy(); kT[0] = sls['k'].val
        n, Nc = len(Cin), P['Nc']; dV = P['V'] / Nc; fluxo = sls['v0'].val / dV
        taxa = lambda C: kT * np.prod(np.maximum(C, 0) ** P['ordem'], axis=1)

        def rhs(t, y):
            Y = y.reshape(Nc, n); dY = np.empty_like(Y)
            for k in range(Nc):
                Cup = Cin if k == 0 else Y[k - 1]
                dY[k] = fluxo * (Cup - Y[k]) + P['nu'].T @ taxa(Y[k])
            return dY.ravel()
        t = np.linspace(0, P['tEnd'], 61)
        s = solve_ivp(rhs, [0, P['tEnd']], np.zeros(n * Nc), method='BDF', t_eval=t, rtol=1e-6, atol=1e-9)
        CA = s.y.reshape(Nc, n, -1)[:, P['key'], :].T
        X = np.clip(1 - CA / sls['CA0'].val, 0, 1)
        return np.arange(1, Nc + 1) * dV, s.t, CA, X

    def desenha(_=None):
        Vg, t, CA, X = calcula()
        VV, TT = np.meshgrid(Vg, t)
        ax.clear()
        ax.plot_surface(VV, TT, CA, facecolors=cm.jet(X), rstride=1, cstride=1, linewidth=0, antialiased=False, shade=False)
        ax.set_xlabel('Volume V (L)', labelpad=14); ax.set_ylabel('Tempo t (s)', labelpad=14); ax.set_zlabel('$C_A$ (mol/L)', labelpad=12)
        ax.set_title('PFR transiente: concentração e conversão', fontsize=FS); ax.view_init(28, -130)
        fig.canvas.draw_idle()
    sm = cm.ScalarMappable(cmap=cm.jet, norm=plt.Normalize(0, 1)); sm.set_array([])
    cb = fig.colorbar(sm, cax=cax); cb.set_label('Conversão $X_A$', fontsize=FS)
    for s_ in sls.values():
        s_.on_changed(desenha)
    desenha()
    fig._sliders = sls   # mantém referência aos controles
    return fig
`;

  function generate(st, res, fn) {
    const td = dataCode(st), C = SF.CREDITS || {};
    const blocks = st.blocks.map(b => ({ b, code: blockCode(st, res, b, td) })).filter(x => x.code);
    const needVLE = td.act && blocks.some(x => /ponto_bolha|flash_TP/.test(x.code));
    const needFlash = blocks.some(x => /flash_TP/.test(x.code)), needPFR = blocks.some(x => /pfr_transiente\(P/.test(x.code));
    const head = ['#!/usr/bin/env python3', '# -*- coding: utf-8 -*-', '"""',
      (C.title || 'SIMULA FÁCIL IA') + ' – ' + (C.subtitle || 'Simulador de processos químicos'),
      'Código Python gerado em ' + new Date().toLocaleString('pt-BR') + '.', '',
      'Processo: ' + st.name,
      'Autor: ' + (C.author || '') + ' – ' + (C.course || ''), '       ' + (C.program || '') + ' & CLAUDE',
      'Livro: ' + (C.book || '') + ' (' + (C.publisher || '') + ', 2019)',
      'Modelo termodinâmico: ' + TH.MODELS[st.model] + (td.act ? ' (' + td.note + ')' : ' — recálculo de ELV não exportado para equações de estado'),
      'Componentes: ' + st.components.map(id => TH.COMP[id].name).join(', '), '',
      'Requisitos: Python 3.9+ com numpy, scipy e matplotlib  (pip install numpy scipy matplotlib)',
      'Execução:   python ' + fn + '.py      (defina SIMULA_SALVAR=1 para salvar as figuras em PNG)',
      'Todos os gráficos usam fonte 18 (variável FS).', '"""',
      'import os', 'import numpy as np', 'import matplotlib', 'import matplotlib.pyplot as plt', 'from matplotlib import cm',
      'from matplotlib.patches import Circle, FancyBboxPatch, Polygon', 'from matplotlib.widgets import Slider',
      'from scipy.integrate import solve_ivp', 'from scipy.optimize import brentq', '',
      'FS, FSP = 18, 12', "plt.rcParams.update({'font.size': FS, 'axes.titlesize': FS, 'axes.labelsize': FS, 'xtick.labelsize': FS,",
      "                     'ytick.labelsize': FS, 'legend.fontsize': 15, 'lines.linewidth': 2.5})", ''].join('\n');
    const main = ['def main():', "    print(" + str((C.title || 'SIMULA FÁCIL IA') + ' — ' + st.name) + ")", "    print('Modelo:', MODELO)", '    imprime_correntes()', '    figs = [desenha_pfd()]']
      .concat(blocks.map(x => '    figs += ' + blockFn(st, x.b) + '()'))
      .concat(["    if os.environ.get('SIMULA_SALVAR') == '1':", '        for k, f in enumerate(figs):', "            f.savefig(f'" + fn + "_fig{k + 1}.png', dpi=130)", '        print(f"{len(figs)} figuras salvas em PNG.")', '    plt.show()', '', '', "if __name__ == '__main__':", '    main()']).join('\n');
    const types = Array.from(new Set(st.blocks.map(b => b.type)));
    return [head, td.code, needVLE ? VLE : '', needFlash ? FLASH : '', '', streamsCode(st, res), PFD_HELPERS, iconLibPy(types), pfdCode(st, res), '']
      .concat(blocks.map(x => x.code + '\n')).concat(needPFR ? [PFR_TRANS] : []).concat(['', main]).filter(s => s !== null).join('\n\n').replace(/\n{4,}/g, '\n\n\n') + '\n';
  }

  function readme(st, fn) {
    const C = SF.CREDITS || {};
    return [(C.title || 'SIMULA FÁCIL IA') + ' – ' + (C.subtitle || '') + ' — pacote Python', '', 'Processo: ' + st.name, '', C.short || '', '',
      '1. Instale as bibliotecas:  pip install numpy scipy matplotlib', '2. Execute:  python ' + fn + '.py',
      '3. O terminal mostra a tabela de correntes; as janelas mostram o fluxograma e os gráficos (fonte 18).',
      '4. Para salvar as figuras em PNG: defina a variável de ambiente SIMULA_SALVAR=1 antes de executar.',
      '   Windows (PowerShell):  $env:SIMULA_SALVAR=1; python ' + fn + '.py', '   Linux/macOS:          SIMULA_SALVAR=1 python ' + fn + '.py', '',
      'Também funciona no Google Colab e no Jupyter (copie o conteúdo para uma célula e chame main()).', '',
      'Referência: ' + (C.bookRef || '')].join('\r\n');
  }

  SF.python = { generate, readme };
})(typeof window !== 'undefined' ? window : globalThis);
