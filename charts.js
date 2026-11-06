/* SIMULA FÁCIL IA — gráficos (Plotly) com fonte 18 e separador decimal brasileiro */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const FS = 18;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#333';
  const PALETTE = ['#2563c9', '#d1495b', '#2e9e6b', '#e0a100', '#7b4fc9', '#00a3b4', '#c2185b', '#5d4037'];

  function baseLayout(title, xt, yt, extra) {
    const ink = css('--ink'), grid = css('--line');
    const ax = t => ({ title: { text: t, font: { size: FS } }, tickfont: { size: FS }, gridcolor: grid, zerolinecolor: grid, linecolor: ink, mirror: true, showline: true, ticks: 'outside' });
    return Object.assign({
      title: { text: title, font: { size: 20 }, x: 0.02, xanchor: 'left' },
      font: { size: FS, color: ink, family: 'IBM Plex Sans, Arial, sans-serif' },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', separators: ',.',
      margin: { l: 86, r: 24, t: 56, b: 76 }, xaxis: ax(xt), yaxis: ax(yt),
      legend: { font: { size: 16 }, bgcolor: 'rgba(255,255,255,0.75)', bordercolor: grid, borderwidth: 1 },
      hoverlabel: { font: { size: 15 } }
    }, extra || {});
  }
  const CFG = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['toImage', 'select2d', 'lasso2d', 'autoScale2d'] };

  function figure(p) {
    const d = p.data, T = [];
    switch (p.kind) {
      case 'mccabe': {
        T.push({ x: [0, 1], y: [0, 1], mode: 'lines', name: 'Linha 45°', line: { dash: 'dash', color: css('--muted'), width: 2 } });
        T.push({ x: d.eq.x, y: d.eq.y, mode: 'lines', name: 'Equilíbrio ELV', line: { color: '#1f3fbf', width: 3.5 } });
        T.push({ x: [d.xD, d.xi], y: [d.xD, d.yi], mode: 'lines', name: 'Reta de retificação', line: { color: '#d1302b', width: 2.5 } });
        T.push({ x: [d.xB, d.xi], y: [d.xB, d.yi], mode: 'lines', name: 'Reta de esgotamento', line: { color: '#d63dd6', width: 2.5 } });
        T.push({ x: [d.zF, d.xi], y: [d.zF, d.yi], mode: 'lines', name: 'Reta q (q = ' + d.q.toFixed(2).replace('.', ',') + ')', line: { color: '#1f9d55', width: 2.5, dash: 'dashdot' } });
        T.push({ x: d.path.x, y: d.path.y, mode: 'lines', name: 'Estágios (N = ' + d.nStages + ')', line: { color: css('--ink'), width: 1.6 } });
        if (d.az) T.push({ x: [d.az.x], y: [d.az.x], mode: 'markers', name: 'Azeótropo (x = ' + d.az.x.toFixed(3).replace('.', ',') + ')', marker: { color: '#e02020', size: 12 } });
        const L = baseLayout(p.title, 'Fração molar na fase líquida (x)', 'Fração molar na fase vapor (y)', { legend: { x: 0.42, y: 0.04, font: { size: 15 }, bgcolor: 'rgba(255,255,255,0.8)' } });
        L.xaxis.range = [0, 1]; L.yaxis.range = [0, 1]; L.yaxis.scaleanchor = 'x'; L.height = 600;
        L.annotations = [{ xref: 'paper', yref: 'paper', x: 0.5, y: -0.17, showarrow: false, font: { size: FS }, text: 'Razão de refluxo R = ' + d.R.toFixed(2).replace('.', ',') + (d.Rmin != null && isFinite(d.Rmin) && d.Rmin > 0 ? ' (Rmín ≈ ' + d.Rmin.toFixed(2).replace('.', ',') + ')' : '') }];
        L.margin.b = 110;
        return { data: T, layout: L, wide: false, tall: true };
      }
      case 'profileT':
        return { data: [{ x: d.T, y: d.stage, mode: 'lines+markers', name: 'T', line: { color: '#d1495b', width: 3 }, marker: { size: 7 } }], layout: Object.assign(baseLayout(p.title, 'Temperatura (°C)', 'Estágio (1 = condensador)'), {}), rev: true };
      case 'profileX':
        return { data: d.series.map((s, k) => ({ x: s.v, y: d.stage, mode: 'lines+markers', name: s.name, line: { color: PALETTE[k % 8], width: 3 }, marker: { size: 6 } })), layout: baseLayout(p.title, 'Fração molar no líquido', 'Estágio (1 = condensador)'), rev: true };
      case 'profileF':
        return { data: [{ x: d.L, y: d.stage, mode: 'lines+markers', name: 'Líquido L', line: { color: '#2563c9', width: 3 } }, { x: d.V, y: d.stage, mode: 'lines+markers', name: 'Vapor V', line: { color: '#e0a100', width: 3 } }], layout: baseLayout(p.title, 'Vazão (kmol/h)', 'Estágio (1 = condensador)'), rev: true };
      case 'TQ':
        return { data: [{ x: d.Q, y: d.Th, mode: 'lines+markers', name: 'Lado quente', line: { color: '#d1302b', width: 3 } }, { x: d.Q, y: d.Tc, mode: 'lines+markers', name: 'Lado frio', line: { color: '#2563c9', width: 3 } }], layout: baseLayout(p.title, 'Calor transferido acumulado (kW)', 'Temperatura (°C)') };
      case 'timeC':
        return { data: d.series.map((s, k) => ({ x: d.t, y: s.v, mode: 'lines', name: s.name, line: { color: PALETTE[k % 8], width: 3 } })), layout: baseLayout(p.title, 'Tempo t (s)', 'Concentração (mol/L)') };
      case 'timeT':
        return { data: [{ x: d.t, y: d.T, mode: 'lines', name: 'T', line: { color: '#d1495b', width: 3 } }], layout: baseLayout(p.title, 'Tempo t (s)', 'Temperatura (°C)') };
      case 'pfrSS': {
        const data = d.series.map((s, k) => ({ x: d.V, y: s.v, mode: 'lines', name: s.name, line: { color: PALETTE[k % 8], width: 3 } }));
        const L = baseLayout(p.title, 'Volume V (m³)', 'Vazão molar (kmol/h)');
        if (d.T) { data.push({ x: d.V, y: d.T, mode: 'lines', name: 'T (°C)', yaxis: 'y2', line: { color: '#d1495b', dash: 'dot', width: 3 } }); L.yaxis2 = { title: { text: 'Temperatura (°C)', font: { size: FS } }, tickfont: { size: FS }, overlaying: 'y', side: 'right' }; L.margin.r = 80; }
        return { data, layout: L };
      }
      case 'surface': {
        const ink = css('--ink');
        const sc = t => ({ title: { text: t, font: { size: FS } }, tickfont: { size: 15 }, gridcolor: css('--line'), color: ink });
        const data = [{ type: 'surface', x: d.V, y: d.t, z: d.C, surfacecolor: d.X, colorscale: 'Jet', cmin: 0, cmax: 1,
          colorbar: { title: { text: 'Conversão X', font: { size: FS }, side: 'right' }, tickfont: { size: FS }, len: 0.8 },
          contours: { z: { show: false } }, hovertemplate: 'V = %{x:.3f} m³<br>t = %{y:.1f} s<br>C = %{z:.3f} mol/L<extra></extra>' }];
        const L = baseLayout(p.title, '', '');
        delete L.xaxis; delete L.yaxis;
        L.scene = { xaxis: sc('Volume V (m³)'), yaxis: sc('Tempo t (s)'), zaxis: sc('C (mol/L)'), camera: { eye: { x: -1.6, y: -1.6, z: 0.9 } }, aspectmode: 'manual', aspectratio: { x: 1.3, y: 1.1, z: 0.8 } };
        L.margin = { l: 0, r: 0, t: 56, b: 0 }; L.height = 560;
        return { data, layout: L, wide: true, tall: true };
      }
      case 'stagesBar':
        return { data: d.series.map((s, k) => ({ x: d.stage, y: s.v, mode: 'lines+markers', name: s.name, line: { color: PALETTE[k % 8], width: 3 }, marker: { size: 9 } })), layout: baseLayout(p.title, 'Estágio', 'Fração') };
      case 'txy': {
        const L = baseLayout(p.title, 'Fração molar de ' + d.n1, 'Temperatura (°C)');
        const data = [{ x: d.x, y: d.T, mode: 'lines', name: 'Ponto de bolha (líquido)', line: { color: '#2563c9', width: 3 } }, { x: d.y, y: d.T, mode: 'lines', name: 'Ponto de orvalho (vapor)', line: { color: '#d1302b', width: 3 } }];
        if (d.az) data.push({ x: [d.az.x], y: [d.az.T], mode: 'markers', name: 'Azeótropo', marker: { color: '#e0a100', size: 13, line: { color: '#000', width: 1 } } });
        L.xaxis.range = [0, 1];
        return { data, layout: L };
      }
      case 'xy': {
        const L = baseLayout(p.title, 'x (' + d.n1 + ', líquido)', 'y (' + d.n1 + ', vapor)'); L.xaxis.range = [0, 1]; L.yaxis.range = [0, 1]; L.yaxis.scaleanchor = 'x';
        return { data: [{ x: [0, 1], y: [0, 1], mode: 'lines', name: '45°', line: { dash: 'dash', color: css('--muted') } }, { x: d.x, y: d.y, mode: 'lines', name: 'Equilíbrio', line: { color: '#1f3fbf', width: 3.5 } }], layout: L };
      }
      default: return null;
    }
  }

  function render(container, p, opts) {
    opts = opts || {};
    const f = figure(p); if (!f) return null;
    const card = document.createElement('div'); card.className = 'chart-card' + (f.wide ? ' wide' : '');
    const head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px 0 10px';
    head.innerHTML = '<span class="small muted" style="flex:1">' + (opts.source || '') + '</span>';
    const btn = document.createElement('button'); btn.textContent = 'Baixar PNG'; btn.className = 'ghost'; btn.style.fontSize = '12px';
    head.appendChild(btn); card.appendChild(head);
    const div = document.createElement('div'); div.style.height = (f.layout.height || 430) + 'px'; card.appendChild(div);
    container.appendChild(card);
    if (f.rev) f.layout.yaxis.autorange = 'reversed';
    if (!root.Plotly) { div.innerHTML = '<p class="chart-empty">Biblioteca de gráficos não carregou.</p>'; return card; }
    Plotly.newPlot(div, f.data, f.layout, CFG);
    btn.onclick = async () => {
      try {
        const url = await Plotly.toImage(div, { format: 'png', width: 1400, height: Math.round(1400 * (f.layout.height || 430) / Math.max(div.clientWidth, 500)), scale: 1 });
        const bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/png' });
        if (opts.save) opts.save((p.title || 'grafico').replace(/[^\w\-]+/g, '_').slice(0, 60) + '.png', blob);
      } catch (e) { if (opts.toast) opts.toast('Não foi possível gerar o PNG: ' + (e.message || e)); }
    };
    return card;
  }

  SF.charts = { render, figure, FS };
})(typeof window !== 'undefined' ? window : globalThis);
