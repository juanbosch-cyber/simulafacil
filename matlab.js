/* SIMULA FÁCIL IA — gerador de código MATLAB / GNU Octave a partir da simulação */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const TH = SF.thermo;
  const n2s = v => { if (v == null || !isFinite(v)) return 'NaN'; const s = (+v).toPrecision(10); return String(+s); };
  const vec = a => '[' + a.map(n2s).join(' ') + ']';
  const mat = M => '[' + M.map(r => r.map(n2s).join(' ')).join('; ') + ']';
  const str = s => "'" + String(s).replace(/'/g, "''") + "'";
  const cell = a => '{' + a.map(str).join(', ') + '}';
  const fnName = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'bloco';

  function thermoData(st) {
    const ids = st.components, n = ids.length, cs = ids.map(id => TH.COMP[id]);
    const act = ['IDEAL', 'NRTL', 'WILSON', 'UNIQUAC', 'UNIFAC'].indexOf(st.model) >= 0;
    const A = [], B = [], C = []; for (let i = 0; i < n; i++) { A.push(new Array(n).fill(0)); B.push(new Array(n).fill(0)); C.push(new Array(n).fill(0.3)); }
    let note = st.model === 'NRTL' ? 'parâmetros NRTL do simulador' : st.model === 'IDEAL' ? 'solução ideal (γ = 1)' : 'parâmetros NRTL equivalentes (regredidos) ao modelo ' + TH.MODELS[st.model];
    if (act && st.model !== 'IDEAL') {
      const th = new TH.Thermo(ids, 'NRTL', { binary: st.binary });
      th.act.forEach((i, ii) => th.act.forEach((j, jj) => { A[i][j] = th.P.a[ii][jj]; B[i][j] = th.P.b[ii][jj]; C[i][j] = th.P.c[ii][jj]; }));
    }
    return {
      act, note,
      code: [
        'function D = dados()',
        '% Componentes e propriedades (mesmos dados do simulador).',
        'D.ids   = ' + cell(ids) + ';',
        'D.nomes = ' + cell(cs.map(c => c.name)) + ';',
        'D.MW  = ' + vec(cs.map(c => c.mw)) + ';          % g/mol',
        'D.Tc  = ' + vec(cs.map(c => c.tc)) + ';          % K',
        'D.Pc  = ' + vec(cs.map(c => c.pc)) + ';          % Pa',
        'D.w   = ' + vec(cs.map(c => c.w)) + ';           % fator acêntrico',
        'D.Tb  = ' + vec(cs.map(c => c.tb)) + ';          % K',
        'D.rho = ' + vec(cs.map(c => c.rho)) + ';         % kg/m3 (líquido)',
        'D.nv  = logical(' + vec(cs.map(c => (c.nv || c.solid ? 1 : 0))) + ');   % não voláteis / sólidos',
        '% Antoine: log10(P/mmHg) = A - B/(C + t/°C); NaN => Lee-Kesler',
        'D.ant = ' + mat(cs.map(c => (c.ant ? c.ant : [NaN, NaN, NaN]))) + ';',
        '% Modelo de atividade: ' + note + '. tau_ij = a_ij + b_ij/T ; G_ij = exp(-c_ij*tau_ij)',
        'D.a = ' + mat(A) + ';',
        'D.b = ' + mat(B) + ';',
        'D.c = ' + mat(C) + ';',
        'D.modelo = ' + str(TH.MODELS[st.model]) + ';',
        'end'].join('\n')
    };
  }

  const VLE_FUNCS = `
function P = psat(D, i, T)
% Pressão de vapor (Pa): Antoine abaixo de Tc, Lee-Kesler caso contrário.
if D.nv(i), P = 1e-12; return; end
if ~isnan(D.ant(i,1)) && T < D.Tc(i)
    P = 10.^(D.ant(i,1) - D.ant(i,2)./(D.ant(i,3) + T - 273.15)) * 133.322368;
else
    Tr = T./D.Tc(i);
    f0 = 5.92714 - 6.09648./Tr - 1.28862*log(Tr) + 0.169347*Tr.^6;
    f1 = 15.2518 - 15.6875./Tr - 13.4721*log(Tr) + 0.43577*Tr.^6;
    P = D.Pc(i)*exp(f0 + D.w(i)*f1);
end
end

function g = gama_nrtl(a, b, c, x, T)
% Coeficientes de atividade NRTL.
x = x(:); n = numel(x);
tau = a + b./T; tau(1:n+1:end) = 0;
G = exp(-c.*tau);
S = G.'*x;
C = (tau.*G).'*x;
lng = C./S;
for i = 1:n
    lng(i) = lng(i) + sum(x.*G(i,:).'./S.*(tau(i,:).' - C./S));
end
g = exp(lng);
end

function K = valores_K(D, x, T, P)
% K = gama*Psat/P (gama-phi, vapor ideal); não voláteis com K = 0.
x = x(:); n = numel(x); K = zeros(n,1); v = ~D.nv(:);
g = ones(n,1);
if sum(v) > 1 && sum(x(v)) > 0
    xs = x(v)/sum(x(v));
    g(v) = gama_nrtl(D.a(v,v), D.b(v,v), D.c(v,v), xs, T);
end
for i = find(v).'
    K(i) = g(i)*psat(D, i, T)/P;
end
end

function [T, y] = ponto_bolha(D, x, P)
% Temperatura de bolha (K) e composição do vapor incipiente.
x = x(:);
f = @(T) log(sum(valores_K(D, x, T, P).*x));
Ts = linspace(150, 900, 151); fs = arrayfun(f, Ts);
k = find(fs(1:end-1).*fs(2:end) <= 0, 1);
T = fzero(f, [Ts(k) Ts(k+1)]);
K = valores_K(D, x, T, P); y = K.*x/sum(K.*x);
end
`;

  const FLASH_FUNC = `
function [beta, x, y] = flash_TP(D, z, T, P)
% Flash isotérmico: Rachford-Rice com atualização sucessiva de K (gama depende de x).
z = z(:); x = z; K = valores_K(D, x, T, P);
for it = 1:200
    rr = @(b) sum(z.*(K-1)./(1 + b*(K-1)));
    if rr(0) <= 0, beta = 0; elseif sum(z.*(K-1)./max(K,1e-30)) >= 0, beta = 1; else, beta = fzero(rr, [0 1-1e-12]); end
    x = z./(1 + beta*(K-1)); x = x/sum(x); y = K.*x; y = y/sum(y);
    Kn = valores_K(D, x, T, P);
    if max(abs(Kn - K)./max(K,1e-30)) < 1e-10, K = Kn; break; end
    K = Kn;
end
end
`;

  const PFD_HEAD = `
function seta(x2, y2, dx, dy, cor)
% Ponta de seta triangular em (x2,y2) apontando na direção (dx,dy).
L = 9; W = 5; n = hypot(dx, dy); if n == 0, return; end
ux = dx/n; uy = dy/n;
px = [x2, x2 - L*ux + W*uy, x2 - L*ux - W*uy];
py = [y2, y2 - L*uy - W*ux, y2 - L*uy + W*ux];
patch(px, py, cor, 'EdgeColor', cor);
end
`;


  /* biblioteca de ícones em MATLAB, gerada a partir das mesmas primitivas do simulador */
  const rgbM = hex => '[' + [1, 3, 5].map(k => (parseInt(hex.substr(k, 2), 16) / 255).toFixed(3)).join(' ') + ']';
  const off = (b, v) => (v >= 0 ? b + '+' + n2s(v) : b + '-' + n2s(-v));
  function primMatlab(p) {
    const st = SF.icons.STYLE[p.c] || SF.icons.STYLE.body;
    const fc = st.fill === 'none' || !st.fill ? "'none'" : rgbM(st.fill), ec = rgbM(st.stroke || '#000000'), ls = st.dash ? ", 'LineStyle', '--'" : '';
    if (p.t === 'rect') { const cv = p.r > 0 ? '[' + n2s(Math.min(1, 2 * p.r / p.w)) + ' ' + n2s(Math.min(1, 2 * p.r / p.h)) + ']' : '[0 0]';
      return "rectangle('Position', [" + off('x', p.x) + ' ' + off('y', p.y) + ' ' + n2s(p.w) + ' ' + n2s(p.h) + "], 'Curvature', " + cv + ", 'FaceColor', " + fc + ", 'EdgeColor', " + ec + ", 'LineWidth', " + st.lw + ls + ');'; }
    if (p.t === 'circ') return "rectangle('Position', [" + off('x', p.cx - p.r) + ' ' + off('y', p.cy - p.r) + ' ' + n2s(2 * p.r) + ' ' + n2s(2 * p.r) + "], 'Curvature', [1 1], 'FaceColor', " + fc + ", 'EdgeColor', " + ec + ", 'LineWidth', " + st.lw + ');';
    if (p.t === 'line') return 'plot(x + ' + vec(p.pts.map(q => q[0])) + ', y + ' + vec(p.pts.map(q => q[1])) + ", 'Color', " + ec + ", 'LineWidth', " + st.lw + ls + ');';
    if (p.t === 'poly') return 'patch(x + ' + vec(p.pts.map(q => q[0])) + ', y + ' + vec(p.pts.map(q => q[1])) + ', ' + fc + ", 'EdgeColor', " + ec + ", 'LineWidth', " + st.lw + ');';
    return 'text(' + off('x', p.x) + ', ' + off('y', p.y - 4) + ', ' + str(p.s) + ", 'FontSize', 9, 'FontWeight', 'bold', 'Color', " + rgbM(st.text || '#000000') + ", 'HorizontalAlignment', 'center');";
  }
  function iconLibMatlab(types) {
    const L = ['function desenha_icone(tipo, x, y)', '% Ícones de processo no padrão análogo a Aspen Plus, HYSYS e DWSIM (mesmas formas do SIMULA FÁCIL IA).', 'switch tipo'];
    types.forEach(t => { L.push('    case ' + str(t) + '   % ' + (SF.units.TYPES[t] ? SF.units.TYPES[t].label : t)); SF.icons.prims(t).forEach(p => L.push('        ' + primMatlab(p))); });
    L.push('end', 'end');
    return L.join('\n');
  }

  function pfdCode(st, res) {
    const IC = SF.icons, P = SF.pfd;
    const bmap = {}; st.blocks.forEach(b => { bmap[b.id] = b; });
    const lines = ['function desenha_pfd(FS, FSP)', '% Fluxograma do processo (coordenadas do editor; eixo y para baixo).',
      "fig = figure('Name', 'Fluxograma do processo', 'Color', 'w', 'Position', [60 60 1300 760]); hold on; axis equal; axis off; set(gca, 'YDir', 'reverse');",
      "azul = [0.145 0.388 0.788]; amarelo = [0.79 0.57 0];"];
    st.streams.forEach(s => {
      const a = bmap[s.from], b = bmap[s.to]; if (!a || !b) return;
      const pts = P.route(P.portPos(a, s.fromPort), P.portPos(b, s.toPort), st.blocks, P.portOffset(st, s));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const n = pts.length, m = Math.floor((n - 1) / 2);
      lines.push("plot(" + vec(xs) + ", " + vec(ys) + ", 'Color', azul, 'LineWidth', 2); seta(" + n2s(xs[n - 1]) + ", " + n2s(ys[n - 1]) + ", " + n2s(xs[n - 1] - xs[n - 2]) + ", " + n2s(ys[n - 1] - ys[n - 2]) + ", azul);");
      lines.push("text(" + n2s((xs[m] + xs[m + 1]) / 2) + ", " + n2s((ys[m] + ys[m + 1]) / 2) + ", " + str(s.name) + ", 'FontSize', FSP, 'Color', azul, 'FontWeight', 'bold', 'BackgroundColor', 'w', 'EdgeColor', azul, 'HorizontalAlignment', 'center');");
    });
    (res.extraStreams || []).forEach(x => {
      const b = bmap[x.from]; if (!b) return; const p = P.portPos(b, x.fromPort); const ex = p.x + p.dir[0] * 46, ey = p.y + p.dir[1] * 46;
      lines.push("plot([" + n2s(p.x) + " " + n2s(ex) + "], [" + n2s(p.y) + " " + n2s(ey) + "], 'Color', azul, 'LineWidth', 2); seta(" + n2s(ex) + ", " + n2s(ey) + ", " + n2s(p.dir[0]) + ", " + n2s(p.dir[1]) + ", azul);");
      lines.push("text(" + n2s(ex + 4) + ", " + n2s(ey) + ", " + str(x.name) + ", 'FontSize', FSP, 'Color', azul, 'FontWeight', 'bold');");
    });
    st.blocks.forEach(b => {
      const g = IC.G[b.type];
      lines.push("desenha_icone(" + str(b.type) + ", " + n2s(b.x) + ", " + n2s(b.y) + ");");
      lines.push("text(" + n2s(b.x + P.nameX(b)) + ", " + n2s(b.y + g.h + 16) + ", " + str(b.name) + ", 'FontSize', FSP, 'FontWeight', 'bold', 'HorizontalAlignment', 'center');");
      const r = res.blocks[b.id]; if (!r) return;
      if (r.duties && (b.type === 'column' || b.type === 'column_short')) {
        lines.push("text(" + n2s(b.x + 96) + ", " + n2s(b.y - 14) + ", " + str('Qc = ' + (r.duties.Qc / 1000).toFixed(1) + ' kW') + ", 'FontSize', FSP-2, 'Color', amarelo, 'FontWeight', 'bold');");
        lines.push("text(" + n2s(b.x + 74) + ", " + n2s(b.y + g.h + 34) + ", " + str('Qr = ' + (r.duties.Qr / 1000).toFixed(1) + ' kW') + ", 'FontSize', FSP-2, 'Color', amarelo, 'FontWeight', 'bold');");
      } else if (r.duty != null && Math.abs(r.duty) > 1 && b.type !== 'feed') {
        lines.push("text(" + n2s(b.x + g.w / 2) + ", " + n2s(b.y + g.h + 34) + ", " + str((r.power ? 'W = ' : 'Q = ') + (r.duty / 1000).toFixed(1) + ' kW') + ", 'FontSize', FSP-2, 'Color', amarelo, 'FontWeight', 'bold', 'HorizontalAlignment', 'center');");
      }
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    st.blocks.forEach(b => { const g = IC.G[b.type]; x0 = Math.min(x0, b.x - 40); y0 = Math.min(y0, b.y - 40); x1 = Math.max(x1, b.x + g.w + 190); y1 = Math.max(y1, b.y + g.h + 50); });
    lines.push('axis([' + [x0, x1, y0, y1].map(n2s).join(' ') + ']);   % eixo y para baixo, como no editor');
    lines.push("title(" + str(st.name + ' — fluxograma do processo') + ", 'FontSize', FS);", 'hold off;', 'end');
    return lines.join('\n');
  }

  function streamTableCode(st, res) {
    const th = res.th;
    const L = st.streams.map(s => ({ name: s.name, s: res.streams[s.id] })).concat((res.extraStreams || []).map(x => ({ name: x.name, s: res.streams[x.id] }))).filter(r => r.s);
    return ['function C = tabela_correntes()', '% Resultados das correntes calculados pelo SIMULA FÁCIL IA.',
      'C.nomes = ' + cell(L.map(r => r.name)) + ';',
      'C.T   = ' + vec(L.map(r => r.s.T - 273.15)) + ';   % °C',
      'C.P   = ' + vec(L.map(r => r.s.P / 1e5)) + ';      % bar',
      'C.vf  = ' + vec(L.map(r => r.s.beta)) + ';         % fração vaporizada',
      'C.F   = ' + vec(L.map(r => r.s.F * 3.6)) + ';      % kmol/h',
      'C.m   = ' + vec(L.map(r => r.s.mass * 3600)) + ';  % kg/h',
      'C.x   = ' + mat(th.ids.map((id, i) => L.map(r => r.s.z[i]))) + ';   % frações molares (linhas = componentes)',
      'end', '',
      'function imprime_correntes(C, D)',
      "fprintf('\\n%-24s', 'Corrente'); fprintf('%14s', C.nomes{:}); fprintf('\\n');",
      "lin = {'T (°C)', C.T; 'P (bar)', C.P; 'Fração vaporizada', C.vf; 'Vazão (kmol/h)', C.F; 'Vazão (kg/h)', C.m};",
      "for k = 1:size(lin,1), fprintf('%-24s', lin{k,1}); fprintf('%14.4g', lin{k,2}); fprintf('\\n'); end",
      "for i = 1:numel(D.nomes), fprintf('%-24s', ['x ' D.nomes{i}]); fprintf('%14.5f', C.x(i,:)); fprintf('\\n'); end",
      'end'].join('\n');
  }

  function blockFn(st, b) { // nome de função único por bloco
    const names = {}; let out = null;
    st.blocks.forEach(x => { let nm = 'bloco_' + fnName(x.name || x.id); if (names[nm]) { names[nm]++; nm += '_' + names[nm]; } else names[nm] = 1; if (x === b) out = nm; });
    return out;
  }
  function blockCode(st, res, b, td) {
    const r = res.blocks[b.id]; if (!r) return null;
    const fname = blockFn(st, b), th = res.th, out = [];
    const header = '% ' + b.name + ' — ' + SF.units.TYPES[b.type].label;
    const resLines = (r.res || []).map(x => "fprintf('  %-48s %s\\n', " + str(x.k) + ", " + str((typeof x.v === 'number' ? (+x.v.toPrecision(6)).toString() : x.v) + ' ' + (x.u || '')) + ");");
    const printRes = ["fprintf('\\n== %s (resultados do simulador) ==\\n', " + str(b.name) + ");"].concat(resLines);
    if ((b.type === 'column') && r.plots && r.plots.find(p => p.kind === 'mccabe') && td.act) {
      const m = r.plots.find(p => p.kind === 'mccabe').data;
      const i1 = th.c.findIndex(c => c.name === m.light), i2 = th.c.findIndex(c => c.name === m.heavy);
      out.push('function ' + fname + '(D, FS)', header, '% McCabe-Thiele recalculado com o modelo de atividade (equilíbrio por ponto de bolha) e PFD da coluna.', printRes.join('\n'),
        'i1 = ' + (i1 + 1) + '; i2 = ' + (i2 + 1) + ';   % chave leve e pesada', 'P  = ' + n2s(res.blocks[b.id].profile.P[0]) + ';   % Pa',
        'xD = ' + n2s(m.xD) + '; xB = ' + n2s(m.xB) + '; zF = ' + n2s(m.zF) + '; q = ' + n2s(m.q) + '; R = ' + n2s(m.R) + ';',
        'xe = linspace(0, 1, 101); ye = zeros(size(xe)); Te = ye;',
        'for k = 1:numel(xe)', '    x = zeros(numel(D.ids),1); x(i1) = xe(k); x(i2) = 1 - xe(k);', '    [Te(k), yv] = ponto_bolha(D, x, P); ye(k) = yv(i1)/(yv(i1) + yv(i2));', 'end',
        '% retas de operação e reta q', 'ROL = @(x) R/(R+1)*x + xD/(R+1);',
        'if abs(q - 1) < 1e-6, xi = zF; else, xi = (-zF/(q-1) - xD/(R+1))/(R/(R+1) - q/(q-1)); end', 'yi = ROL(xi);',
        'SOL = @(x) xB + (yi - xB)/(xi - xB)*(x - xB);',
        '% degraus (método gráfico, vazões molares constantes)',
        'dd = ye - xe; kaz = []; for k = 2:numel(xe)-2, if dd(k)*dd(k+1) < 0, kaz = k; break; end, end',
        'xmax = 1; if ~isempty(kaz), xmax = xe(kaz+1); end',
        'sel = xe <= xmax; xs = [xD]; ys = [xD]; yv = xD; N = 0;',
        'while N < 200', '    xn = interp1(ye(sel), xe(sel), min(yv, max(ye(sel))));', '    xs(end+1) = xn; ys(end+1) = yv; N = N + 1;',
        '    if xn <= xB, break; end', '    if xn > xi, yv = ROL(xn); else, yv = SOL(xn); end', '    xs(end+1) = xn; ys(end+1) = yv;',
        '    if abs(xs(end) - xs(end-2)) < 1e-7, warning(\'Pinch: refluxo insuficiente para a separação.\'); break; end', 'end',
        "fprintf('  Estágios teóricos (McCabe-Thiele gráfico): %d (coluna rigorosa: %d estágios)\\n', N, " + m.nStages + ");",
        "fig = figure('Name', " + str(b.name + ' — McCabe-Thiele') + ", 'Color', 'w', 'Position', [80 80 1350 640]);",
        'subplot(1, 2, 1); hold on; box on; grid on;',
        "plot([0 1], [0 1], 'k--', 'LineWidth', 1.5);",
        "plot(xe, ye, 'b-', 'LineWidth', 3);",
        "plot([xD xi], [xD yi], 'r-', 'LineWidth', 2.5);",
        "plot([xB xi], [xB yi], 'm-', 'LineWidth', 2.5);",
        "plot([zF xi], [zF yi], 'g-.', 'LineWidth', 2.5);",
        "plot(xs, ys, 'k-', 'LineWidth', 1.5);",
        "leg = {'Linha 45°', 'Equilíbrio ELV', 'Reta de retificação', 'Reta de esgotamento', sprintf('Reta q (q = %.2f)', q), sprintf('Estágios (N = %d)', N)};",
        "if ~isempty(kaz), plot(xe(kaz), ye(kaz), 'ro', 'MarkerFaceColor', 'r', 'MarkerSize', 10); leg{end+1} = 'Azeótropo'; end",
        "legend(leg, 'Location', 'southeast', 'FontSize', 14); axis([0 1 0 1]); axis square;",
        "xlabel(['Fração molar de ' D.nomes{i1} ' no líquido (x)'], 'FontSize', FS); ylabel(['Fração molar de ' D.nomes{i1} ' no vapor (y)'], 'FontSize', FS);",
        "title(sprintf('McCabe-Thiele (%s/%s) | R = %.2f', D.nomes{i1}, D.nomes{i2}, R), 'FontSize', FS); set(gca, 'FontSize', FS);",
        '% PFD da coluna com o ícone padrão (condensador, vaso de refluxo, refervedor)',
        "subplot(1, 2, 2); hold on; axis equal; axis([-150 300 -40 270]); set(gca, 'YDir', 'reverse'); axis off;",
        "desenha_icone('column', 0, 0);",
        "plot([-110 0], [115 115], 'Color', [0 0.45 0.8], 'LineWidth', 2.5); seta(0, 115, 1, 0, [0 0.45 0.8]);",
        "plot([112 160], [46 46], 'Color', [0 0.5 0], 'LineWidth', 2.5); seta(160, 46, 1, 0, [0 0.5 0]);",
        "plot([112 160], [208 208], 'Color', [0.6 0 0], 'LineWidth', 2.5); seta(160, 208, 1, 0, [0.6 0 0]);",
        "text(-146, 100, sprintf('ALIMENTAÇÃO\\nz_F = %.3f', zF), 'Color', [0 0.45 0.8], 'FontWeight', 'bold', 'FontSize', 14);",
        "text(166, 46, sprintf('DESTILADO\\nx_D = %.3f', xD), 'Color', [0 0.5 0], 'FontWeight', 'bold', 'FontSize', 14);",
        "text(166, 208, sprintf('FUNDO\\nx_B = %.4f', xB), 'Color', [0.6 0 0], 'FontWeight', 'bold', 'FontSize', 14);",
        "text(56, 80, sprintf('R = %.2f', R), 'Color', 'r', 'FontSize', 14);",
        "title('Fluxograma da coluna', 'FontSize', FS);", 'end');
      return out.join('\n');
    }
    if (b.type === 'cstr' && r.cstr) {
      const p = b.params, rx = SF.units.compileReactions(th, p.reactions), c = r.cstr;
      const s = res.streams[(st.streams.find(x => x.to === b.id) || {}).id];
      const cpL = (th.hL(s.z, s.T + 0.5, 101325) - th.hL(s.z, s.T - 0.5, 101325));
      const Cin = c.Cin, sv = Cin.indexOf(Math.max.apply(null, Cin));
      const C0 = p.mode === 'batelada' || p.init === 'igual à alimentação' ? Cin : Cin.map((v, i) => (i === sv ? v : 0));
      const thermal = p.thermal || 'isotérmico';
      out.push('function ' + fname + '(D, FS)', header, '% Balanços transientes do CSTR (ode15s). Concentrações em mol/L, tempo em s.', printRes.join('\n'),
        'V   = ' + n2s(c.V) + ';         % L', 'v0  = ' + n2s(p.mode === 'batelada' ? 0 : c.v0) + ';   % L/s',
        'Cin = ' + vec(Cin) + ';   % mol/L', 'C0  = ' + vec(C0) + ';   % condição inicial (mol/L)',
        'nu  = ' + mat(rx.map(q => q.nu)) + ';   % estequiometria (reações x componentes)',
        'ord = ' + mat(rx.map(q => q.ord)) + ';', 'k0  = ' + vec(rx.map(q => q.k)) + ';   % em Tref', 'Ea  = ' + vec(rx.map(q => q.Ea)) + ';   % J/mol',
        'Tref = ' + vec(rx.map(q => q.Tref)) + ';   % K', 'dH  = ' + vec(rx.map(q => q.dH)) + ';   % J/mol',
        'Tin = ' + n2s(s.T) + '; Tiso = ' + n2s(SF.units.C2K(+p.T || 25)) + '; UA = ' + n2s(+p.UA || 0) + '; Tj = ' + n2s(SF.units.C2K(+p.Tj || 25)) + ';',
        'rhoCp = ' + n2s(Cin.reduce((a, v) => a + v, 0) * cpL) + ';   % J/(L K)', "modo = " + str(thermal) + ";",
        'tEnd = ' + n2s(p.mode === 'permanente' ? Math.max(20 * c.V / c.v0, +p.tEnd || 0) : (+p.tEnd || 3600)) + ';',
        "taxa = @(C, T) k0(:).*exp(-Ea(:)/8.314462618.*(1./T - 1./Tref(:))).*prod(max(repmat(C(:).', numel(k0), 1), 0).^ord, 2);",
        'y0 = [C0(:); Tin]; if strcmp(modo, \'isotérmico\'), y0(end) = Tiso; end',
        'f = @(t, y) cstr_rhs(y, v0, V, Cin(:), Tin, nu, taxa, dH(:), rhoCp, modo, Tiso, UA, Tj);',
        "[t, Y] = ode15s(f, [0 tEnd], y0, odeset('RelTol', 1e-7, 'AbsTol', 1e-10));",
        'ativos = find(any(nu ~= 0, 1));',
        "fig = figure('Name', " + str(b.name + ' — CSTR') + ", 'Color', 'w', 'Position', [80 80 1300 560]);",
        "subplot(1, 2, 1); plot(t, Y(:, ativos), 'LineWidth', 3); grid on; legend(D.nomes(ativos), 'Location', 'best');",
        "xlabel('Tempo t (s)'); ylabel('Concentração (mol/L)'); title('CSTR: concentrações'); set(gca, 'FontSize', FS);",
        "subplot(1, 2, 2); plot(t, Y(:, end) - 273.15, 'r', 'LineWidth', 3); grid on; xlabel('Tempo t (s)'); ylabel('Temperatura (°C)'); title('CSTR: temperatura'); set(gca, 'FontSize', FS);",
        "fprintf('  MATLAB: C final = %s mol/L ; T final = %.2f °C\\n', mat2str(Y(end, 1:end-1), 4), Y(end, end) - 273.15);", 'end');
      return out.join('\n');
    }
    if (b.type === 'pfr') {
      const p = b.params, rx = SF.units.compileReactions(th, p.reactions);
      const sId = (st.streams.find(x => x.to === b.id) || {}).id, s = res.streams[sId];
      const gas = p.phase === 'gasosa';
      const v0 = gas ? s.F * 8.314462618 * s.T / s.P * 1000 : s.F * th.vL(s.z) * 1000;
      const Cin = s.flows.map(f => f / v0), key = rx.length && rx[0].key >= 0 ? rx[0].key : Cin.indexOf(Math.max.apply(null, Cin));
      const Tiso = SF.units.C2K(+p.T || 25);
      out.push('function ' + fname + '(D, FS)', header, '% PFR em regime permanente (ode45) e transiente por método das linhas (ode15s) com controles deslizantes.', printRes.join('\n'),
        'P.V   = ' + n2s(+p.V * 1000) + ';    % L', 'P.v0  = ' + n2s(v0) + ';    % L/s', 'P.Cin = ' + vec(Cin) + ';   % mol/L', 'P.key = ' + (key + 1) + ';   % reagente-chave',
        'P.CA0 = P.Cin(P.key);', 'P.nu  = ' + mat(rx.map(q => q.nu)) + ';', 'P.ord = ' + mat(rx.map(q => q.ord)) + ';',
        'P.kT  = ' + vec(rx.map(q => q.k * Math.exp(-q.Ea / 8.314462618 * (1 / Tiso - 1 / q.Tref)))) + ';   % constantes a T = ' + (Tiso - 273.15).toFixed(1) + ' °C',
        'P.k   = P.kT(1);', 'P.Nc  = ' + Math.max(10, Math.min(120, Math.round(+p.cells || 60))) + ';   % células', 'P.tEnd = ' + n2s(+p.tEnd || 120) + ';',
        '% --- regime permanente isotérmico: dC/dtau', "taxaP = @(C) P.kT(:).*prod(max(repmat(C(:).', numel(P.kT), 1), 0).^P.ord, 2);",
        "[Vv, Cv] = ode45(@(V, C) (P.nu.'*taxaP(C))/P.v0, [0 P.V], P.Cin(:));",
        "fig = figure('Name', " + str(b.name + ' — PFR permanente') + ", 'Color', 'w', 'Position', [80 80 900 560]); ativos = find(any(P.nu ~= 0, 1));",
        "plot(Vv, Cv(:, ativos), 'LineWidth', 3); grid on; legend(D.nomes(ativos), 'Location', 'best'); xlabel('Volume V (L)'); ylabel('Concentração (mol/L)');",
        "title(sprintf('PFR permanente: X_{saída} = %.4f', 1 - Cv(end, P.key)/P.CA0)); set(gca, 'FontSize', FS);",
        p.mode === 'transiente' ? 'pfr_transiente(P, FS, ' + str(b.name) + ');' : '% (regime transiente desativado no simulador; chame pfr_transiente(P, FS, nome) se desejar)', 'end');
      return out.join('\n');
    }
    if ((b.type === 'hx_shell' || b.type === 'hx_plate') && r.plots && r.plots[0]) {
      const d = r.plots[0].data;
      out.push('function ' + fname + '(D, FS)', header, '% Perfil T x Q (calculado pelo simulador com flashes PH ao longo do trocador) e verificação da MLDT.', printRes.join('\n'),
        'Q = ' + vec(d.Q) + ';   % kW', 'Th = ' + vec(d.Th) + ';  % °C', 'Tc = ' + vec(d.Tc) + ';  % °C',
        'dT1 = Th(end) - Tc(end); dT2 = Th(1) - Tc(1); MLDT = (dT1 - dT2)/log(dT1/dT2);',
        "fprintf('  MATLAB: MLDT = %.3f °C, carga = %.2f kW\\n', MLDT, Q(end));",
        "figure('Name', " + str(b.name + ' — T x Q') + ", 'Color', 'w', 'Position', [80 80 900 560]);",
        "plot(Q, Th, 'r-o', Q, Tc, 'b-o', 'LineWidth', 3); grid on; legend('Lado quente', 'Lado frio', 'Location', 'best');",
        "xlabel('Calor transferido acumulado (kW)'); ylabel('Temperatura (°C)'); title(" + str(b.name + ': perfil de temperatura') + "); set(gca, 'FontSize', FS);", 'end');
      return out.join('\n');
    }
    if (b.type === 'flash' && td.act && (b.params.mode === 'T e P' || !b.params.mode)) {
      const sId = (st.streams.find(x => x.to === b.id) || {}).id, s = res.streams[sId];
      out.push('function ' + fname + '(D, FS)', header, '% Flash TP recalculado (Rachford-Rice + NRTL/Antoine).', printRes.join('\n'),
        'z = ' + vec(s.z) + '; T = ' + n2s(SF.units.C2K(+b.params.T)) + '; P = ' + n2s((+b.params.P) * 1e5) + ';',
        '[beta, x, y] = flash_TP(D, z, T, P);', "fprintf('  MATLAB: fração vaporizada = %.5f\\n', beta);",
        "figure('Name', " + str(b.name + ' — flash') + ", 'Color', 'w'); bar([x(:) y(:)]); set(gca, 'XTickLabel', D.nomes, 'FontSize', FS); legend('Líquido x', 'Vapor y'); ylabel('Fração molar'); title(sprintf('Flash: \\\\beta = %.3f', beta)); grid on;", 'end');
      return out.join('\n');
    }
    if (b.type === 'column' && r.profile) {
      const pr = r.profile;
      out.push('function ' + fname + '(D, FS)', header, '% Perfis da coluna rigorosa (método MESH do simulador).', printRes.join('\n'),
        'estagio = 1:' + pr.T.length + ';', 'T = ' + vec(pr.T.map(t => t - 273.15)) + ';', 'X = ' + mat(pr.x) + ';',
        "figure('Name', " + str(b.name + ' — perfis') + ", 'Color', 'w', 'Position', [80 80 1300 560]);",
        "subplot(1, 2, 1); plot(T, estagio, 'r-o', 'LineWidth', 3); set(gca, 'YDir', 'reverse', 'FontSize', FS); grid on; xlabel('Temperatura (°C)'); ylabel('Estágio (1 = condensador)'); title('Perfil de temperatura');",
        "subplot(1, 2, 2); plot(X, estagio, '-o', 'LineWidth', 3); set(gca, 'YDir', 'reverse', 'FontSize', FS); grid on; xlabel('Fração molar no líquido'); ylabel('Estágio'); legend(D.nomes, 'Location', 'best'); title('Perfil de composição');", 'end');
      return out.join('\n');
    }
    if (b.type === 'feed' || b.type === 'product') return null;
    out.push('function ' + fname + '(D, FS)', header, printRes.join('\n'), 'end');
    return out.join('\n');
  }

  const CSTR_RHS = `
function dy = cstr_rhs(y, v0, V, Cin, Tin, nu, taxa, dH, rhoCp, modo, Tiso, UA, Tj)
C = y(1:end-1); T = y(end); if strcmp(modo, 'isotérmico'), T = Tiso; end
r = taxa(C, T);
dC = v0/V*(Cin - C) + nu.'*r;
switch modo
    case 'isotérmico', dT = 0;
    case 'adiabático', dT = v0/V*(Tin - T) + sum(-dH.*r)/rhoCp;
    otherwise,         dT = v0/V*(Tin - T) + (sum(-dH.*r) + UA*(Tj - T)/V)/rhoCp;
end
dy = [dC; dT];
end
`;

  const PFR_TRANS = `
function pfr_transiente(P, FS, nome)
% PFR transiente por método das linhas com controles deslizantes de v0, CA0 e k.
fig = figure('Name', [nome ' — PFR transiente'], 'Color', 'w', 'Position', [60 40 1150 820]);
ax = axes('Parent', fig, 'Position', [0.09 0.34 0.74 0.6]);
setappdata(fig, 'P', P); setappdata(fig, 'FS', FS);
campos = {'v0', 'CA0', 'k'}; rot = {'Vazão v0 (L/s)', 'Conc. CA0 (mol/L)', 'Constante k (1/s)'};
for i = 1:3
    v = P.(campos{i});
    uicontrol(fig, 'Style', 'text', 'Units', 'normalized', 'Position', [0.06 0.21-0.07*(i-1) 0.27 0.045], 'String', sprintf('%s: %.4g', rot{i}, v), 'FontSize', 14, 'HorizontalAlignment', 'left', 'BackgroundColor', 'w', 'Tag', ['lbl_' campos{i}]);
    uicontrol(fig, 'Style', 'slider', 'Units', 'normalized', 'Position', [0.34 0.215-0.07*(i-1) 0.42 0.04], 'Min', 0.2*v, 'Max', 3*v, 'Value', v, 'Tag', ['sl_' campos{i}], 'Callback', @(src, evt) pfr_atualiza(fig, ax));
end
pfr_atualiza(fig, ax);
end

function pfr_atualiza(fig, ax)
P = getappdata(fig, 'P'); FS = getappdata(fig, 'FS');
campos = {'v0', 'CA0', 'k'}; rot = {'Vazão v0 (L/s)', 'Conc. CA0 (mol/L)', 'Constante k (1/s)'};
for i = 1:3
    P.(campos{i}) = get(findobj(fig, 'Tag', ['sl_' campos{i}]), 'Value');
    set(findobj(fig, 'Tag', ['lbl_' campos{i}]), 'String', sprintf('%s: %.4g', rot{i}, P.(campos{i})));
end
Cin = P.Cin(:); Cin(P.key) = P.CA0; kT = P.kT(:); kT(1) = P.k;
n = numel(Cin); Nc = P.Nc; dV = P.V/Nc;
C0 = zeros(n*Nc, 1);
taxa = @(C) kT.*prod(max(repmat(C(:).', numel(kT), 1), 0).^P.ord, 2);
f = @(t, y) mol_rhs(y, Cin, n, Nc, P.v0/dV, P.nu, taxa);
tv = linspace(0, P.tEnd, 61);
[t, Y] = ode15s(f, tv, C0, odeset('RelTol', 1e-6, 'AbsTol', 1e-9));
CA = Y(:, P.key:n:end);
X = max(0, min(1, 1 - CA/P.CA0));
Vg = (1:Nc)*dV;
cla(ax); surf(ax, Vg, t, CA, X, 'EdgeColor', 'none'); colormap(ax, jet); caxis(ax, [0 1]);
cb = colorbar(ax); ylabel(cb, 'Conversão X_A', 'FontSize', FS);
xlabel(ax, 'Volume V (L)'); ylabel(ax, 'Tempo t (s)'); zlabel(ax, 'Concentração C_A (mol/L)');
title(ax, 'PFR transiente: concentração e conversão'); set(ax, 'FontSize', FS); view(ax, [-130 28]); grid(ax, 'on');
end

function dy = mol_rhs(y, Cin, n, Nc, fluxo, nu, taxa)
Y = reshape(y, n, Nc); dY = zeros(n, Nc);
for k = 1:Nc
    if k == 1, Cup = Cin; else, Cup = Y(:, k-1); end
    dY(:, k) = fluxo*(Cup - Y(:, k)) + nu.'*taxa(Y(:, k));
end
dy = dY(:);
end
`;

  function generate(st, res, fn) {
    const td = thermoData(st);
    const blocks = st.blocks.map(b => ({ b, code: blockCode(st, res, b, td) })).filter(x => x.code);
    const needVLE = td.act && blocks.some(x => /ponto_bolha|flash_TP/.test(x.code));
    const needFlash = blocks.some(x => /flash_TP/.test(x.code));
    const needCSTR = blocks.some(x => /cstr_rhs/.test(x.code)), needPFR = blocks.some(x => /pfr_transiente\(P/.test(x.code));
    const head = [
      'function ' + fn + '()',
      '% ' + fn.toUpperCase() + '  Código gerado pelo SIMULA FÁCIL IA em ' + new Date().toLocaleString('pt-BR') + '.',
      '%   Processo: ' + st.name,
      '%   Autor: ' + SF.CREDITS.author + ' – ' + SF.CREDITS.course,
      '%          ' + SF.CREDITS.program + ' & CLAUDE',
      '%   Livro: ' + SF.CREDITS.book + ' (' + SF.CREDITS.publisher + ', 2019)',
      '%   Modelo termodinâmico: ' + TH.MODELS[st.model] + (td.act ? ' (' + td.note + ')' : ' — recálculo de ELV não exportado para equações de estado'),
      '%   Componentes: ' + st.components.map(id => TH.COMP[id].name).join(', '),
      '%   Compatível com MATLAB R2016b+ e GNU Octave 6+ (salve como ' + fn + '.m e execute).',
      '%   Todos os gráficos usam fonte 18 (variável FS). FSP controla os rótulos do fluxograma.',
      'clc; close all;',
      'FS = 18; FSP = 14;',
      "set(0, 'DefaultAxesFontSize', FS); set(0, 'DefaultTextFontSize', FS); set(0, 'DefaultLineLineWidth', 2);",
      'D = dados();',
      'C = tabela_correntes();',
      "fprintf('SIMULA FÁCIL IA — %s\\nModelo: %s\\n', " + str(st.name) + ", D.modelo);",
      'imprime_correntes(C, D);',
      'desenha_pfd(FS, FSP);'
    ].concat(blocks.map(x => blockFn(st, x.b) + '(D, FS);'), ['end', '']);
    const types = Array.from(new Set(st.blocks.map(b => b.type)));
    const parts = [head.join('\n'), td.code, streamTableCode(st, res), pfdCode(st, res), PFD_HEAD, iconLibMatlab(types)]
      .concat(blocks.map(x => x.code))
      .concat(needVLE ? [VLE_FUNCS] : []).concat(needFlash ? [FLASH_FUNC] : []).concat(needCSTR ? [CSTR_RHS] : []).concat(needPFR ? [PFR_TRANS] : []);
    return parts.join('\n\n') + '\n';
  }

  function readme(st, fn) {
    return ['SIMULA FÁCIL IA – Simulador de processos químicos — pacote MATLAB/Octave', '', 'Processo: ' + st.name, '', SF.CREDITS.short, 'Livro: ' + SF.CREDITS.bookRef, '',
      '1. Extraia ' + fn + '.m numa pasta e abra essa pasta no MATLAB (R2016b ou superior) ou no GNU Octave (6 ou superior).',
      '2. Execute:  ' + fn, '3. A janela de comandos mostra a tabela de correntes; as figuras mostram o fluxograma e os gráficos (fonte 18).',
      '4. Para exportar as figuras: print(gcf, \'-dpng\', \'-r150\', \'figura.png\').', '',
      'O arquivo ' + fn + '_projeto.json reabre este processo no SIMULA FÁCIL IA (botão Abrir).',
      'Para compilar um executável: MATLAB Compiler (mcc -m ' + fn + '.m). Para publicar na web com o App Designer, use o MATLAB Web App Server.'].join('\r\n');
  }

  SF.matlab = { generate, readme };
})(typeof window !== 'undefined' ? window : globalThis);
