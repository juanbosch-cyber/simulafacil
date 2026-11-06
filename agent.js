/* SIMULA FÁCIL IA — agente de IA (Claude) com leitura de figuras e ferramentas que montam, alteram e simulam o fluxograma */
(function (root) {
  'use strict';
  const SF = root.SF = root.SF || {};
  const U = SF.units, TH = SF.thermo;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r4 = v => (typeof v === 'number' && isFinite(v) ? +v.toPrecision(5) : v);

  /* ---------------- markdown mínimo e seguro */
  function md(src) {
    const blocks = []; let t = esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => { blocks.push('<pre><code>' + code.replace(/\n$/, '') + '</code></pre>'); return '\u0000' + (blocks.length - 1) + '\u0000'; });
    const inline = s => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    const lines = t.split('\n'), out = []; let list = null, table = null;
    const flushList = () => { if (list) { out.push('<' + list.t + '>' + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + '</' + list.t + '>'); list = null; } };
    const flushTable = () => { if (table) { out.push('<table>' + table.map((r, k) => '<tr>' + r.map(c => (k ? '<td>' : '<th>') + inline(c.trim()) + (k ? '</td>' : '</th>')).join('') + '</tr>').join('') + '</table>'); table = null; } };
    lines.forEach(line => {
      if (/^\s*\|.*\|\s*$/.test(line)) { flushList(); if (/^\s*\|[\s:\-|]+\|\s*$/.test(line)) return; (table = table || []).push(line.trim().slice(1, -1).split('|')); return; }
      flushTable();
      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (!list || list.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); return; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (!list || list.t !== 'ol') { flushList(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); return; }
      flushList();
      if ((m = line.match(/^#{1,4}\s+(.*)$/))) { out.push('<p><b>' + inline(m[1]) + '</b></p>'); return; }
      if (line.trim() === '') { out.push(''); return; }
      out.push('<p>' + inline(line) + '</p>');
    });
    flushList(); flushTable();
    return out.join('').replace(/\u0000(\d+)\u0000/g, (m, k) => blocks[+k]);
  }

  /* ---------------- catálogo para o prompt */
  function catalog() {
    const comps = TH.COMPONENTS.map(c => c.id + ' = ' + c.name + (c.tb ? ' (Teb ' + (c.tb - 273.15).toFixed(1) + ' °C)' : c.solid ? ' (sólido inerte)' : ' (não volátil)')).join('\n');
    const types = Object.keys(U.TYPES).map(k => {
      const t = U.TYPES[k];
      const ps = t.params.map(f => f.k + (f.u ? ' [' + f.u + ']' : '') + (f.options ? ' {' + f.options.join(' | ') + '}' : '') + (f.type === 'composition' ? ' {id: valor}' : f.type === 'compfrac' ? ' {id: fração}' : f.type === 'reactions' ? ' [lista de reações]' : f.type === 'comp' ? ' (id de componente)' : '') + (f.def !== undefined && f.def !== '' && typeof f.def !== 'object' ? ' = ' + f.def : '')).join('; ');
      return '- ' + k + ' — ' + t.label + ' | entradas: ' + (t.ins.join(', ') || '—') + ' | saídas: ' + (t.outs.join(', ') || '—') + (ps ? ' | params: ' + ps : '');
    }).join('\n');
    return '## Componentes disponíveis (id = nome)\n' + comps + '\n\n## Tipos de bloco (portas e parâmetros)\n' + types +
      '\n\n## Modelos termodinâmicos\n' + Object.keys(TH.MODELS).map(k => k + ' = ' + TH.MODELS[k]).join('; ') +
      '\n\n## Reações (params.reactions)\nCada reação: {"stoich": {"id": ν, ...} (negativo = reagente), "orders": {"id": ordem}, "k": constante em Tref (unidades de mol/L e s), "Tref": °C, "Ea": kJ/mol, "dH": kJ/mol (negativo = exotérmica)}. No reator de conversão use {"stoich", "key": id, "conversion": 0–1, "dH"}. Para problemas didáticos use comp-A, comp-B, comp-C, comp-D (solutos genéricos) dissolvidos em água e alimentação com basis "concentração (mol/L)", flowUnit "L/s" e composition em mol/L.' +
      '\n\n## Convenções da coluna rigorosa\nEstágio 1 = condensador, estágio N = refervedor. Dmode "Vazão D" usa D em kmol/h; "D/F" usa razão. feed2 é para solvente/arrastador (extrativa: perto do topo). Especificação de projeto opcional: specComp + specType + specValue + specVary (R ou D).';
  }
  const RULES = 'Você é o agente do SIMULA FÁCIL IA, simulador de processos químicos no navegador inspirado no Aspen Plus e no DWSIM. O software foi criado pelo Prof. Juan Canellas Bosch Neto (Curso de Engenharia Química – UFSJ; PPGEQ-DEQUI-CAP-UFSJ), autor do livro "Modelagem e Simulação de Processos Dinâmicos" (Editora Appris, 2019), com coautoria do CLAUDE (Anthropic); informe isso se perguntarem sobre a autoria e indique o livro a quem quiser aprofundar a modelagem dinâmica. Converse em português do Brasil com o engenheiro, entenda o processo (texto e figuras), sugira operações unitárias, modelo termodinâmico, condições e especificações, e use as ferramentas para montar e simular o fluxograma. O motor numérico do simulador faz os cálculos rigorosos (ELV com NRTL/UNIQUAC/UNIFAC/PR, colunas MESH por ponto de bolha + Newton, reatores com integração de EDOs). Nunca invente resultados: rode a simulação e cite os números retornados.\n\n' +
    'Regras:\n1. Use somente ids de componentes e tipos/portas de bloco do catálogo. Se faltar um componente, diga qual e proponha substituto.\n2. Modelo: NRTL ou UNIQUAC para líquidos polares e azeótropos; UNIFAC se faltar dado; Peng-Robinson/SRK para gases, hidrocarbonetos leves e alta pressão; Ideal só para misturas quase ideais.\n3. Para montar do zero use construir_fluxograma com TODOS os blocos e correntes (cada alimentação é um bloco feed; saídas sem ligação viram produtos). Para ajustes use modificar_fluxograma. As duas ferramentas já simulam e devolvem o resumo.\n4. Se a simulação falhar, leia o erro, corrija a especificação e tente de novo (no máximo duas tentativas) antes de responder.\n5. Azeótropos (ex.: etanol/água ~0,89 a 1 atm): avise o limite e sugira destilação extrativa (etilenoglicol), azeotrópica heterogênea (ciclohexano + decantador), variação de pressão, peneira molecular ou pervaporação.\n6. Depois de simular: interprete pureza, recuperação, cargas térmicas e convergência, e dê de 2 a 4 sugestões concretas e quantificadas de melhoria.\n7. Figuras: descreva em uma ou duas frases o que identificou (equipamentos, correntes, condições) e monte o fluxograma correspondente; assuma valores típicos para dados ausentes e diga quais assumiu.\n8. Pedidos de código: MATLAB/Octave → chame abrir_codigo_matlab; Python → chame abrir_codigo_python (ambos geram o programa completo com fluxograma nos ícones padrão e gráficos com fonte 18). Para trechos específicos escreva um bloco ```matlab (set(0,\'DefaultAxesFontSize\',18)) ou ```python (plt.rcParams[\'font.size\'] = 18).\n9. Pedido de fluxograma final ou relatório: chame abrir_fluxograma_final.\n10. Seja conciso: frases curtas, listas curtas, números com unidade e vírgula decimal. Perguntas só conceituais dispensam ferramentas.\n\nUnidades dos parâmetros: T °C, P bar, vazões kmol/h (ou kg/h, L/s), cargas kW, volume m³, tempo s.\n\n';

  /* ---------------- resumo do estado e dos resultados */
  function stateSummary(st) {
    return JSON.stringify({ nome: st.name, componentes: st.components, modelo: st.model,
      blocos: st.blocks.map(b => ({ id: b.id, tipo: b.type, nome: b.name, params: b.params })),
      correntes: st.streams.map(s => ({ nome: s.name, de: s.from, porta_saida: s.fromPort, para: s.to, porta_entrada: s.toPort })) });
  }
  function resultSummary(app) {
    const st = app.getState(), res = app.getResults();
    if (!res) return { status: 'não simulado' };
    if (!res.ok) return { status: 'erro', erros: res.errors.map(e => e.msg) };
    const th = res.th, t = app.totals();
    return {
      status: res.converged ? 'convergido' : 'reciclo não convergiu', tempo_ms: res.ms, avisos: res.warnings,
      energia_kW: { aquecimento: r4(t.heat / 1000), resfriamento: r4(-t.cool / 1000), potencia: r4(t.power / 1000) },
      correntes: app.streamList().map(r => {
        const x = {}; th.ids.forEach((id, i) => { if (r.s.z[i] > 1e-5) x[id] = r4(r.s.z[i]); });
        return { nome: r.name, de: r.from, para: r.to || 'produto', T_C: r4(r.s.T - 273.15), P_bar: r4(r.s.P / 1e5), vf: r4(r.s.beta), F_kmol_h: r4(r.s.F * 3.6), m_kg_h: r4(r.s.mass * 3600), x };
      }),
      blocos: st.blocks.filter(b => b.type !== 'feed' && b.type !== 'product').map(b => {
        const r = res.blocks[b.id]; const o = {}; (r && r.res || []).forEach(x => { o[x.k] = (typeof x.v === 'number' ? r4(x.v) : x.v) + (x.u ? ' ' + x.u : ''); });
        return { id: b.id, nome: b.name, tipo: b.type, resultados: o };
      })
    };
  }

  /* ---------------- validação e montagem */
  function normBlock(b, app) {
    const type = b.tipo || b.type; if (!U.TYPES[type]) throw new Error('tipo de bloco desconhecido "' + type + '"');
    return { id: String(b.id), type, name: b.nome || b.name || String(b.id), params: Object.assign(app.defaultParams(type), b.params || {}) };
  }
  function normStream(s, k) { return { id: 'S' + (k + 1) + '_' + Math.random().toString(36).slice(2, 6), name: String(s.nome || s.name || (k + 1)), from: s.de || s.from, fromPort: s.porta_saida || s.fromPort, to: s.para || s.to, toPort: s.porta_entrada || s.toPort }; }
  function validate(fs) {
    const errs = [], ids = new Set(fs.blocks.map(b => b.id));
    fs.components.forEach(c => { if (!TH.COMP[c]) errs.push('componente desconhecido: ' + c); });
    if (!TH.MODELS[fs.model]) errs.push('modelo desconhecido: ' + fs.model);
    fs.streams.forEach(s => {
      const a = fs.blocks.find(b => b.id === s.from), b = fs.blocks.find(x => x.id === s.to);
      if (!a) errs.push('corrente ' + s.name + ': origem ' + s.from + ' não existe');
      else if (U.TYPES[a.type].outs.indexOf(s.fromPort) < 0) errs.push('corrente ' + s.name + ': ' + a.type + ' não tem saída "' + s.fromPort + '" (saídas: ' + U.TYPES[a.type].outs.join(', ') + ')');
      if (!b) errs.push('corrente ' + s.name + ': destino ' + s.to + ' não existe');
      else if (U.TYPES[b.type].ins.indexOf(s.toPort) < 0) errs.push('corrente ' + s.name + ': ' + b.type + ' não tem entrada "' + s.toPort + '" (entradas: ' + U.TYPES[b.type].ins.join(', ') + ')');
    });
    if (ids.size !== fs.blocks.length) errs.push('ids de bloco repetidos');
    if (errs.length) throw new Error('Fluxograma inválido: ' + errs.join('; '));
  }

  function makeTools(app, ui) {
    const runAndSummarize = () => { const r = app.run(); app.switchTab('agent'); return resultSummary(app); };
    return [
      { name: 'construir_fluxograma', description: 'Substitui o fluxograma atual por um novo (componentes, modelo, blocos e correntes), posiciona automaticamente, simula e devolve o resumo dos resultados ou os erros.',
        inputSchema: { type: 'object', properties: {
          nome: { type: 'string' }, componentes: { type: 'array', items: { type: 'string' } }, modelo: { type: 'string' },
          blocos: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, tipo: { type: 'string' }, nome: { type: 'string' }, params: { type: 'object' } }, required: ['id', 'tipo'] } },
          correntes: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, de: { type: 'string' }, porta_saida: { type: 'string' }, para: { type: 'string' }, porta_entrada: { type: 'string' } }, required: ['de', 'porta_saida', 'para', 'porta_entrada'] } } },
          required: ['componentes', 'modelo', 'blocos', 'correntes'] },
        execute: (input) => {
          ui.tool('Montando o fluxograma…');
          const fs = { name: String(input.nome || 'Processo do agente'), components: (input.componentes || []).map(String), model: String(input.modelo || 'NRTL'), binary: {} };
          fs.blocks = (input.blocos || []).map(b => normBlock(b, { defaultParams: t => { const st = app.getState(); const saved = st.components; st.components = fs.components; try { return app.defaultParams(t); } finally { st.components = saved; } } }));
          fs.streams = (input.correntes || []).map(normStream);
          validate(fs);
          app.load(fs); ui.tool('Simulando ' + fs.blocks.length + ' equipamentos…');
          return runAndSummarize();
        } },
      { name: 'modificar_fluxograma', description: 'Altera o fluxograma atual (parâmetros, blocos, correntes, componentes ou modelo), simula e devolve o resumo. Parâmetros informados são mesclados aos existentes.',
        inputSchema: { type: 'object', properties: {
          alterar: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, nome: { type: 'string' }, params: { type: 'object' } }, required: ['id'] } },
          adicionar_blocos: { type: 'array', items: { type: 'object' } }, adicionar_correntes: { type: 'array', items: { type: 'object' } },
          remover_blocos: { type: 'array', items: { type: 'string' } }, remover_correntes: { type: 'array', items: { type: 'string' } },
          componentes: { type: 'array', items: { type: 'string' } }, modelo: { type: 'string' }, nome: { type: 'string' } } },
        execute: (input) => {
          ui.tool('Ajustando o fluxograma…');
          const fs = JSON.parse(JSON.stringify(app.getState()));
          if (input.componentes) fs.components = input.componentes.map(String);
          if (input.modelo) fs.model = String(input.modelo);
          if (input.nome) fs.name = String(input.nome);
          (input.remover_blocos || []).forEach(id => { fs.blocks = fs.blocks.filter(b => b.id !== id); fs.streams = fs.streams.filter(s => s.from !== id && s.to !== id); });
          (input.remover_correntes || []).forEach(n => { fs.streams = fs.streams.filter(s => s.name !== String(n) && s.id !== String(n)); });
          (input.adicionar_blocos || []).forEach(b => { const nb = normBlock(b, app); if (fs.blocks.some(x => x.id === nb.id)) throw new Error('bloco ' + nb.id + ' já existe'); fs.blocks.push(nb); });
          (input.alterar || []).forEach(a => { const b = fs.blocks.find(x => x.id === a.id); if (!b) throw new Error('bloco ' + a.id + ' não existe'); if (a.nome) b.name = a.nome; Object.assign(b.params, a.params || {}); });
          (input.adicionar_correntes || []).forEach((s, k) => { const ns = normStream(s, fs.streams.length + k); fs.streams = fs.streams.filter(x => !(x.to === ns.to && x.toPort === ns.toPort) && !(x.from === ns.from && x.fromPort === ns.fromPort)); fs.streams.push(ns); });
          validate(fs);
          app.load(fs, !(input.adicionar_blocos || []).length);
          ui.tool('Simulando…');
          return runAndSummarize();
        } },
      { name: 'diagrama_binario', description: 'Calcula o equilíbrio líquido-vapor de um par (Txy) a uma pressão, detecta azeótropo e mostra os gráficos ao usuário. Retorna azeótropo e 11 pontos (x, y, T).',
        inputSchema: { type: 'object', properties: { comp1: { type: 'string' }, comp2: { type: 'string' }, pressao_bar: { type: 'number' }, modelo: { type: 'string' } }, required: ['comp1', 'comp2'] },
        execute: (input) => {
          const a = String(input.comp1), b = String(input.comp2), P = (+input.pressao_bar || 1.01325) * 1e5, model = String(input.modelo || app.getState().model);
          if (!TH.COMP[a] || !TH.COMP[b]) throw new Error('componente desconhecido');
          ui.tool('Calculando ELV ' + TH.COMP[a].name + '/' + TH.COMP[b].name + '…');
          const th = new TH.Thermo([a, b], model), d = th.binaryTxy(0, 1, P, 51); let az = null; try { az = th.azeotrope(0, 1, P); } catch (e) { /* */ }
          app.renderCharts(null, [{ kind: 'txy', title: 'Txy ' + TH.COMP[a].name + '/' + TH.COMP[b].name + ' (' + TH.MODELS[model] + ')', data: { x: d.x, y: d.y, T: d.T.map(T => T - 273.15), n1: TH.COMP[a].name, az: az ? { x: az.x, T: az.T - 273.15 } : null } },
            { kind: 'xy', title: 'xy ' + TH.COMP[a].name + '/' + TH.COMP[b].name, data: { x: d.x, y: d.y, n1: TH.COMP[a].name } }], 'Equilíbrio líquido-vapor');
          const pts = []; for (let k = 0; k <= 50; k += 5) pts.push({ x: r4(d.x[k]), y: r4(d.y[k]), T_C: r4(d.T[k] - 273.15) });
          return { azeotropo: az ? { x1: r4(az.x), T_C: r4(az.T - 273.15), tipo: az.type } : null, pontos: pts, modelo: model };
        } },
      { name: 'detalhes_bloco', description: 'Retorna resultados detalhados de um bloco já simulado: tabela de resultados, perfis por estágio (colunas) e correntes ligadas.',
        inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        execute: (input) => {
          const res = app.getResults(); if (!res || !res.ok) throw new Error('não há simulação válida');
          const r = res.blocks[String(input.id)]; if (!r) throw new Error('bloco não encontrado');
          const out = { resultados: (r.res || []).map(x => x.k + ': ' + (typeof x.v === 'number' ? r4(x.v) : x.v) + ' ' + (x.u || '')), avisos: r.warn || [] };
          if (r.profile) { const th = res.th; out.perfil = r.profile.T.map((T, j) => { const o = { estagio: j + 1, T_C: r4(T - 273.15), L_kmol_h: r4(r.profile.L[j] * 3.6), V_kmol_h: r4(r.profile.V[j] * 3.6) }; th.ids.forEach((id, i) => { if (r.profile.x[j][i] > 1e-4) o['x_' + id] = r4(r.profile.x[j][i]); }); return o; }); }
          app.renderCharts(String(input.id));
          return out;
        } },
      { name: 'abrir_codigo_matlab', description: 'Abre para o usuário a função MATLAB/Octave completa gerada a partir da simulação atual (fluxograma, recálculo dos blocos e gráficos com fonte 18), com botões para copiar ou baixar.', inputSchema: { type: 'object', properties: {} },
        execute: () => { app.openMatlab(); return 'janela do código MATLAB aberta'; } },
      { name: 'abrir_codigo_python', description: 'Abre para o usuário o script Python completo (NumPy, SciPy, Matplotlib) gerado a partir da simulação atual, com fluxograma nos ícones padrão e gráficos com fonte 18, com botões para copiar ou baixar.', inputSchema: { type: 'object', properties: {} },
        execute: () => { app.openPython(); return 'janela do código Python aberta'; } },
      { name: 'abrir_fluxograma_final', description: 'Abre para o usuário o fluxograma final com tabela de correntes e resultados, com download em PNG, SVG, HTML e CSV.', inputSchema: { type: 'object', properties: {} },
        execute: () => { app.openReport(); return 'fluxograma final aberto'; } }
    ];
  }

  /* ---------------- interface do chat */
  function init(app) {
    const chat = $('#chat'), input = $('#chatInput'), form = $('#composer'), note = $('#agentNote');
    const history = []; let attachments = [], ctl = null, sample = null, limits = null, busy = false;
    const QUICK = ['Monte a destilação etanol/água do PDF e explique o McCabe-Thiele', 'Como obter etanol anidro a 99,5%? Monte a melhor opção', 'Analise os resultados atuais e sugira otimizações', 'Qual modelo termodinâmico devo usar?', 'Gere o código MATLAB e Python deste processo'];
    const qp = $('#quickPrompts'); QUICK.forEach(q => { const b = document.createElement('button'); b.type = 'button'; b.textContent = q; b.onclick = () => { input.value = q; send(); }; qp.appendChild(b); });

    function add(kind, html) { const d = document.createElement('div'); d.className = 'msg ' + kind; d.innerHTML = html; chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d; }
    add('bot', md('Olá! Sou o agente do **SIMULA FÁCIL IA**. Descreva o processo (vazões, composições, temperaturas, pureza desejada) ou anexe uma figura do fluxograma, e eu monto, simulo e sugiro melhorias. Um exemplo de destilação etanol/água já está carregado.'));

    function renderAttach() {
      const row = $('#attachRow'); row.innerHTML = ''; row.hidden = !attachments.length;
      attachments.forEach((f, k) => { const d = document.createElement('div'); d.className = 'att'; const img = document.createElement('img'); img.src = URL.createObjectURL(f); img.alt = f.name || 'figura'; const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Remover'; x.onclick = () => { attachments.splice(k, 1); renderAttach(); }; d.appendChild(img); d.appendChild(x); row.appendChild(d); });
    }
    function addFiles(files) {
      if (!limits || !limits.images) { note.textContent = 'Envio de figuras indisponível nesta visualização.'; return; }
      Array.from(files).forEach(f => { if (limits.images.mediaTypes.indexOf(f.type) >= 0 && attachments.length < limits.images.maxCount) attachments.push(f); });
      renderAttach();
    }
    $('#imgInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
    input.addEventListener('paste', e => { const fs = Array.from(e.clipboardData && e.clipboardData.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } });
    form.addEventListener('dragover', e => { e.preventDefault(); form.classList.add('drop'); });
    form.addEventListener('dragleave', () => form.classList.remove('drop'));
    form.addEventListener('drop', e => { e.preventDefault(); form.classList.remove('drop'); addFiles(e.dataTransfer.files); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    form.addEventListener('submit', e => { e.preventDefault(); send(); });
    $('#stopBtn').onclick = () => { if (ctl) ctl.abort(); };

    function setBusy(b) { busy = b; $('#sendBtn').disabled = b; $('#stopBtn').hidden = !b; }
    const ERR = { rate_limited: 'Limite de uso atingido. Tente novamente em alguns instantes.', session_expired: 'Sessão expirada: entre novamente no Claude.', refused: 'O pedido não pôde ser atendido. Reformule a mensagem.', empty_completion: 'O agente não produziu resposta. Simplifique o pedido.', upstream_error: 'Falha temporária de conexão. Tente novamente.', image_rejected: 'Figura não aceita (tipo ou tamanho). Use PNG ou JPEG menor.', prompt_too_large: 'Conversa longa demais: comece uma nova.' };

    async function send() {
      const text = input.value.trim(); if (busy || (!text && !attachments.length)) return;
      $('#quickPrompts').hidden = true;
      if (!sample) { const url = (window.SIMULAFACIL_CONFIG && window.SIMULAFACIL_CONFIG.claudeUrl) || ''; add('sys', 'O agente de IA funciona na versão aberta no Claude.' + (url ? ' <a href="' + url + '" target="_blank" rel="noopener">Abrir a versão com o agente</a>.' : '') + ' O simulador continua disponível aqui.'); return; }
      const imgs = attachments.slice(); attachments = []; renderAttach(); input.value = '';
      const u = add('user', md(text || '(figura anexada)')); imgs.forEach(f => { const im = document.createElement('img'); im.src = URL.createObjectURL(f); im.alt = 'figura anexada'; u.appendChild(im); });
      const userTurn = (text || 'Analise a figura anexada e monte o fluxograma correspondente.') + (imgs.length ? '\n[' + imgs.length + ' figura(s) anexada(s) a esta mensagem]' : '');
      const bot = add('bot', ''); const tools = document.createElement('div'); const body = document.createElement('div'); bot.appendChild(tools); bot.appendChild(body);
      body.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
      const ui = { tool: msg => { const t = document.createElement('div'); t.className = 'tool'; t.textContent = '⚙ ' + msg; tools.appendChild(t); chat.scrollTop = chat.scrollHeight; } };
      const st = app.getState();
      const ctxTurn = 'Estado atual do simulador (JSON):\n' + stateSummary(st) + '\n\nResultados da última simulação:\n' + JSON.stringify(resultSummary(app)) + '\n\nMensagem do usuário:\n' + userTurn;
      const turns = [{ role: 'user', content: RULES + catalog() }].concat(history.slice(-12), [{ role: 'user', content: ctxTurn }]);
      ctl = new AbortController(); setBusy(true);
      try {
        const opts = { signal: ctl.signal, cache: false, modelTier: $('#tierSel').value, onText: ({ text: t }) => { body.innerHTML = md(t); chat.scrollTop = chat.scrollHeight; } };
        if (limits && limits.tools) { delete opts.cache; opts.tools = makeTools(app, ui); }
        if (imgs.length) opts.images = imgs;
        if (!opts.tools) turns[0] = { role: 'user', content: turns[0].content + '\n\nATENÇÃO: nesta visualização as ferramentas não estão disponíveis. Para montar ou alterar o fluxograma, termine a resposta com um bloco ```json contendo {"acao": "construir_fluxograma" | "modificar_fluxograma", "args": {...mesmos campos das ferramentas...}}.' };
        const res = await sample(turns, opts);
        body.innerHTML = md(res.text);
        if (!opts.tools) { // executa a ação descrita em JSON, se houver
          const m = res.text.match(/```json\s*([\s\S]*?)```/);
          if (m) { try { const act = JSON.parse(m[1]); const tool = makeTools(app, ui).find(t => t.name === act.acao); if (tool) { const out = tool.execute(act.args || {}); ui.tool('Ação executada: ' + act.acao + ' → ' + (out.status || 'ok')); } } catch (err) { ui.tool('Não foi possível executar a ação: ' + err.message); } }
        }
        if (res.truncated) body.insertAdjacentHTML('beforeend', '<p class="small muted">Resposta interrompida pelo limite de tamanho — peça a continuação.</p>');
        history.push({ role: 'user', content: userTurn }, { role: 'assistant', content: res.text });
      } catch (e) {
        if (e && e.text) body.innerHTML = md(e.text); else body.innerHTML = '';
        const code = e && e.code;
        if (code === 'cancelled') body.insertAdjacentHTML('beforeend', '<p class="small muted">Interrompido.</p>');
        else if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') { add('sys', 'O uso do Claude não foi autorizado nesta página. O simulador continua funcionando normalmente.'); sample = null; }
        else if (code === 'images_unavailable') add('sys', 'Envio de figuras indisponível nesta visualização; descreva o processo em texto.');
        else add('sys', ERR[code] || ('Erro do agente: ' + ((e && e.message) || code || e)));
        if (e && e.text) history.push({ role: 'user', content: userTurn }, { role: 'assistant', content: e.text });
      } finally { setBusy(false); ctl = null; }
    }

    // capacidade "sample" do Claude
    (async () => {
      try { sample = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch (e) { sample = null; }
      if (!sample) {
        $('#attachBtn').hidden = true;
        const url = (window.SIMULAFACIL_CONFIG && window.SIMULAFACIL_CONFIG.claudeUrl) || '';
        note.innerHTML = 'O agente de IA funciona na versão do simulador aberta dentro do Claude (é preciso entrar com uma conta do Claude).' + (url ? ' <a href="' + url + '" target="_blank" rel="noopener"><b>Abrir a versão com o agente IA</b></a>' : '');
        if (url && !window.claude) add('sys', 'Esta é a versão aberta do simulador: tudo funciona aqui, menos a conversa com o agente de IA. <a href="' + url + '" target="_blank" rel="noopener">Abrir a versão com o agente no Claude</a>.');
        return;
      }
      try { limits = await sample.limits(); } catch (e) { limits = null; }
      if (!limits || !limits.images) $('#attachBtn').hidden = true; else $('#imgInput').accept = limits.images.mediaTypes.join(',');
      note.textContent = (limits && limits.tools ? 'O agente monta e simula o fluxograma por ferramentas. ' : 'Esta visualização não permite ferramentas: o agente responde em texto. ') + 'Usa a sua conta do Claude.';
    })();
  }

  SF.agent = { init, md, catalog, resultSummary, stateSummary };
})(typeof window !== 'undefined' ? window : globalThis);
