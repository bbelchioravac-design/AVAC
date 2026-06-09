// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Segurança contra Incêndio
// incendio.js — Carga de incêndio modificada
// Despacho n.º 8954/2020 (alt. Despacho 2074/2009)
// ═══════════════════════════════════════════════════

// ─── Data ───
let QUADRO2 = [];
let quadro2Loaded = false;

// Carregar JSON de actividades
fetch('data/quadro2_actividades.json')
  .then(r => r.json())
  .then(data => { QUADRO2 = data; quadro2Loaded = true; })
  .catch(e => console.error('Erro ao carregar quadro de actividades:', e));

// ─── Coeficientes de combustibilidade (Ci) ───
const CI_VALUES = {
  'Baixo': 1.0,
  'Médio': 1.3,
  'Alto': 1.6
};

// ─── Categorias de risco UT XII ───
const CATEGORIAS_RISCO = [
  { cat: '1ª', nivel: 'Reduzido', max: 500 },
  { cat: '2ª', nivel: 'Moderado', max: 5000 },
  { cat: '3ª', nivel: 'Elevado', max: 15000 },
  { cat: '4ª', nivel: 'Muito elevado', max: Infinity }
];

// ─── State ───
let incendioState = {
  compartimentos: [],
  currentComp: null,
  currentForm: null,
  fase: 0
};

// ─── Searchable select ───
function normalizeStr(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function injectSearchSelectCSS() {
  if (document.getElementById('search-select-css')) return;
  const style = document.createElement('style');
  style.id = 'search-select-css';
  style.textContent = `
    .search-select { position: relative; }
    .search-select-input {
      width: 100%; padding: 8px 12px;
      background: var(--bg-input, #131a2e);
      border: 1px solid var(--border, #2a3450);
      border-radius: 6px;
      color: var(--tx, #e0e6f0);
      font-size: 13px;
      box-sizing: border-box;
    }
    .search-select-input:focus { border-color: var(--accent, #1E8AFF); outline: none; }
    .search-select-list {
      display: none; position: absolute;
      top: 100%; left: 0; right: 0;
      max-height: 220px; overflow-y: auto;
      background: var(--bg-input, #131a2e);
      border: 1px solid var(--border, #2a3450);
      border-top: none; border-radius: 0 0 6px 6px;
      z-index: 100;
    }
    .search-select-list.open { display: block; }
    .search-select-group {
      padding: 6px 12px; font-size: 11px;
      color: var(--accent, #1E8AFF);
      font-weight: 600; letter-spacing: 0.5px;
      border-top: 1px solid var(--border, #2a3450);
    }
    .search-select-group:first-child { border-top: none; }
    .search-select-item {
      padding: 6px 12px; cursor: pointer;
      font-size: 13px; color: var(--tx, #e0e6f0);
    }
    .search-select-item:hover { background: var(--accent, #1E8AFF); color: #fff; }
    .search-select-item .ss-detail {
      font-size: 11px; color: var(--tx-dim, #8090b0); margin-left: 6px;
    }
    .search-select-item:hover .ss-detail { color: rgba(255,255,255,0.7); }
    .search-select-empty {
      padding: 12px; color: var(--tx-dim, #8090b0);
      font-size: 12px; text-align: center;
    }
  `;
  document.head.appendChild(style);
}

function initSearchableSelect(form) {
  const searchInput = form.querySelector('#inc-act-search');
  const hiddenInput = form.querySelector('#inc-act-sel');
  const listEl = form.querySelector('#inc-act-sel-list');

  // Construir opções a partir do QUADRO2
  const allOptions = [];
  QUADRO2.forEach((a, i) => {
    if (a.fab_qsi) allOptions.push({
      value: `fab_${i}`, label: a.nome,
      detail: `${a.fab_qsi} MJ/m²`, group: 'fab'
    });
    if (a.arm_qvi) allOptions.push({
      value: `arm_${i}`, label: a.nome,
      detail: `${a.arm_qvi} MJ/m³`, group: 'arm'
    });
  });

  function renderOptions(filter) {
    const norm = normalizeStr(filter);
    const filtered = filter
      ? allOptions.filter(o => normalizeStr(o.label).includes(norm))
      : allOptions;

    listEl.innerHTML = '';

    if (!filtered.length) {
      listEl.innerHTML = '<div class="search-select-empty">Sem resultados</div>';
      listEl.classList.add('open');
      return;
    }

    const fabItems = filtered.filter(o => o.group === 'fab');
    const armItems = filtered.filter(o => o.group === 'arm');

    if (fabItems.length) {
      const gh = document.createElement('div');
      gh.className = 'search-select-group';
      gh.textContent = 'Fabricação e Reparação';
      listEl.appendChild(gh);
      fabItems.forEach(o => listEl.appendChild(makeItem(o)));
    }
    if (armItems.length) {
      const gh = document.createElement('div');
      gh.className = 'search-select-group';
      gh.textContent = 'Armazenamento';
      listEl.appendChild(gh);
      armItems.forEach(o => listEl.appendChild(makeItem(o)));
    }

    listEl.classList.add('open');
  }

  function makeItem(opt) {
    const el = document.createElement('div');
    el.className = 'search-select-item';
    el.innerHTML = `${opt.label} <span class="ss-detail">${opt.detail}</span>`;
    el.addEventListener('click', () => {
      hiddenInput.value = opt.value;
      searchInput.value = `${opt.label} (${opt.detail})`;
      listEl.classList.remove('open');
      onActividadeChange();
    });
    return el;
  }

  searchInput.addEventListener('focus', () => renderOptions(searchInput.value));
  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    renderOptions(searchInput.value);
    onActividadeChange();
  });

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    const wrap = form.querySelector('#inc-act-sel-wrap');
    if (wrap && !wrap.contains(e.target)) {
      listEl.classList.remove('open');
    }
  });
}

// ─── Registo da ferramenta ───
registerTool('incendio', {
  id: 'carga_incendio',
  icon: '🔥',
  name: 'Carga de incêndio modificada',
  desc: 'Cálculo probabilístico — Despacho 8954/2020',
  launch: iniciarCargaIncendio
});

// ─── Funções de cálculo ───
function calcularCompartimento(comp) {
  let qs_total = 0;
  const linhas = [];

  comp.actividades.forEach(act => {
    let contribuicao;
    const ci = CI_VALUES[act.ci_label] || 1.0;

    if (act.modo === 'fabricacao') {
      // qs = qsi × Si × Ci × Rai / S
      contribuicao = act.qsi * act.area * ci * act.rai / comp.area;
      linhas.push({
        nome: act.nome,
        modo: 'Fabricação',
        qsi: act.qsi,
        area: act.area,
        ci: ci,
        ci_label: act.ci_label,
        rai: act.rai,
        rai_label: act.rai_label,
        contribuicao: contribuicao
      });
    } else {
      // qs = qvi × hi × Si × Ci × Rai / S
      contribuicao = act.qvi * act.altura * act.area * ci * act.rai / comp.area;
      linhas.push({
        nome: act.nome,
        modo: 'Armazenamento',
        qvi: act.qvi,
        altura: act.altura,
        area: act.area,
        ci: ci,
        ci_label: act.ci_label,
        rai: act.rai,
        rai_label: act.rai_label,
        contribuicao: contribuicao
      });
    }
    qs_total += contribuicao;
  });

  // Categoria de risco
  // Para armazenamento, dividir por 10 antes de classificar
  const temArmazenamento = comp.actividades.some(a => a.modo === 'armazenamento');
  const qs_classificacao = temArmazenamento ? qs_total / 10 : qs_total;
  const categoria = CATEGORIAS_RISCO.find(c => qs_classificacao <= c.max);

  return {
    nome: comp.nome,
    area: comp.area,
    qs: qs_total,
    qs_classificacao: qs_classificacao,
    categoria: categoria,
    linhas: linhas,
    temArmazenamento: temArmazenamento
  };
}

// ─── Interface ───
function iniciarCargaIncendio() {
  modo = 'incendio';
  injectSearchSelectCSS();
  setupChat();
  setProgress(5);
  setSub('Incêndio — Carga de incêndio modificada');
  setHeaderBtns([
    { label: '← Ferramentas', action: () => showToolMenu(currentArea) },
    { label: 'Novo', primary: true, action: iniciarCargaIncendio }
  ]);

  incendioState = { compartimentos: [], currentComp: null, currentForm: null, fase: 0 };

  addBot('Cálculo da <strong>densidade de carga de incêndio modificada</strong>.<br>Método probabilístico — Despacho n.º 8954/2020.<br><br>Aplicável a UT XI (Bibliotecas e Arquivos) e UT XII (Industriais, Oficinas e Armazéns).');

  if (!quadro2Loaded) {
    addBot('⚠️ A carregar tabela de actividades...');
    setTimeout(() => {
      if (quadro2Loaded) pedirCompartimento();
      else addBot('❌ Erro ao carregar tabela. Recarregue a página.');
    }, 2000);
  } else {
    setTimeout(() => pedirCompartimento(), 400);
  }
}

function pedirCompartimento() {
  setProgress(10);
  incendioState.fase = 'nome_comp';
  incendioState.currentComp = null;

  // Desactivar formulários anteriores para evitar conflitos de IDs
  document.querySelectorAll('.input-form').forEach(f => {
    f.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    f.style.opacity = '0.4';
  });

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';

  const nComp = incendioState.compartimentos.length + 1;
  form.innerHTML = `
    <div style="font-size:13px;color:#d0d6e8;margin-bottom:10px;">
      <strong>Compartimento corta-fogo ${nComp}</strong>
    </div>
    <div class="form-row">
      <div class="form-field" style="flex:2">
        <label>Nome do compartimento</label>
        <input type="text" id="inc-comp-nome" placeholder="ex: Armazém principal"/>
      </div>
      <div class="form-field">
        <label>Área útil (m²)</label>
        <input type="number" id="inc-comp-area" placeholder="ex: 500" min="1" step="0.1"/>
      </div>
    </div>
    <div class="form-actions">
      <button class="skip-btn" onclick="voltarMenuIncendio()">← Voltar</button>
      <button class="continuar-btn" onclick="criarCompartimento()">Criar compartimento →</button>
    </div>`;

  incendioState.currentForm = form;
  row.appendChild(av); row.appendChild(form);
  logEl().appendChild(row); scroll();
}

function criarCompartimento() {
  const f = incendioState.currentForm;
  const nome = f.querySelector('#inc-comp-nome').value.trim();
  const area = parseFloat(f.querySelector('#inc-comp-area').value);

  if (!nome) { alert('Indique o nome do compartimento.'); return; }
  if (!area || area <= 0) { alert('Indique a área útil.'); return; }

  incendioState.currentComp = { nome, area, actividades: [] };
  addUser(`${nome} — ${area} m²`);
  setProgress(30);

  setTimeout(() => pedirActividade(), 300);
}

function pedirActividade() {
  incendioState.fase = 'actividade';

  // Desactivar formulários anteriores
  document.querySelectorAll('.input-form').forEach(f => {
    f.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    f.style.opacity = '0.4';
  });

  const comp = incendioState.currentComp;
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';

  form.innerHTML = `
    <div style="font-size:13px;color:#d0d6e8;margin-bottom:10px;">
      <strong>${comp.nome}</strong> — Adicionar actividade
      <div id="inc-area-status" style="font-size:12px;margin-top:4px;color:#10b981;">
        Área disponível: ${comp.area.toFixed(1)} / ${comp.area.toFixed(1)} m²
      </div>
    </div>
    <div class="form-row">
      <div class="form-field" style="flex:3">
        <label>Actividade (Quadro II)</label>
        <div class="search-select" id="inc-act-sel-wrap">
          <input type="text" class="search-select-input" id="inc-act-search"
                 placeholder="Escreva para filtrar actividades..." autocomplete="off" />
          <input type="hidden" id="inc-act-sel" value="" />
          <div class="search-select-list" id="inc-act-sel-list"></div>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label>Área da actividade (m²)</label>
        <input type="number" id="inc-act-area" placeholder="ex: 200" min="0.1" step="0.1"/>
      </div>
      <div class="form-field" id="inc-act-altura-wrap" style="display:none">
        <label>Altura armazenagem (m)</label>
        <input type="number" id="inc-act-altura" placeholder="ex: 4" min="0.1" step="0.1"/>
      </div>
      <div class="form-field">
        <label>Combustibilidade (Ci)</label>
        <select id="inc-act-ci">
          <option value="Baixo">Baixo (1.0)</option>
          <option value="Médio" selected>Médio (1.3)</option>
          <option value="Alto">Alto (1.6)</option>
        </select>
      </div>
    </div>
    <div id="inc-act-info" style="font-size:11px;color:var(--tx-dim);margin:4px 0;"></div>
    <div class="form-row">
      <button class="add-btn" onclick="adicionarActividade()">+ Adicionar</button>
    </div>
    <div class="items-list" id="inc-act-list"></div>
    <div class="form-actions">
      <button class="continuar-btn" onclick="finalizarCompartimento()">Calcular compartimento →</button>
    </div>`;

  incendioState.currentForm = form;
  row.appendChild(av); row.appendChild(form);
  logEl().appendChild(row); scroll();
  initSearchableSelect(form);
}

function onActividadeChange() {
  const f = incendioState.currentForm;
  const sel = f.querySelector('#inc-act-sel').value;
  const alturaWrap = f.querySelector('#inc-act-altura-wrap');
  const info = f.querySelector('#inc-act-info');

  if (!sel) { info.textContent = ''; alturaWrap.style.display = 'none'; return; }

  const isArm = sel.startsWith('arm_');
  const idx = parseInt(sel.split('_')[1]);
  const act = QUADRO2[idx];

  alturaWrap.style.display = isArm ? 'flex' : 'none';

  if (isArm) {
    info.innerHTML = `qvi = ${act.arm_qvi} MJ/m³ · Rai = ${act.arm_rai} (${act.arm_rai_label})`;
  } else {
    info.innerHTML = `qsi = ${act.fab_qsi} MJ/m² · Rai = ${act.fab_rai} (${act.fab_rai_label})`;
  }
}

function adicionarActividade() {
  const f = incendioState.currentForm;
  const sel = f.querySelector('#inc-act-sel').value;
  const area = parseFloat(f.querySelector('#inc-act-area').value);
  const ci_label = f.querySelector('#inc-act-ci').value;

  if (!sel) { alert('Seleccione uma actividade.'); return; }
  if (!area || area <= 0) { alert('Indique a área.'); return; }

  // Validar que não excede a área do compartimento
  const areaUsada = incendioState.currentComp.actividades.reduce((s, a) => s + a.area, 0);
  const areaDisponivel = incendioState.currentComp.area - areaUsada;
  if (area > areaDisponivel + 0.01) {
    alert(`Área excede o compartimento.\nÁrea total: ${incendioState.currentComp.area} m²\nJá ocupada: ${areaUsada.toFixed(1)} m²\nDisponível: ${areaDisponivel.toFixed(1)} m²`);
    return;
  }

  const isArm = sel.startsWith('arm_');
  const idx = parseInt(sel.split('_')[1]);
  const act = QUADRO2[idx];

  const entry = {
    nome: act.nome,
    area: area,
    ci_label: ci_label,
  };

  if (isArm) {
    const altura = parseFloat(f.querySelector('#inc-act-altura').value);
    if (!altura || altura <= 0) { alert('Indique a altura de armazenagem.'); return; }
    entry.modo = 'armazenamento';
    entry.qvi = act.arm_qvi;
    entry.rai = act.arm_rai;
    entry.rai_label = act.arm_rai_label;
    entry.altura = altura;
  } else {
    entry.modo = 'fabricacao';
    entry.qsi = act.fab_qsi;
    entry.rai = act.fab_rai;
    entry.rai_label = act.fab_rai_label;
  }

  incendioState.currentComp.actividades.push(entry);
  renderActividadesList();

  // Limpar campos
  f.querySelector('#inc-act-sel').value = '';
  f.querySelector('#inc-act-search').value = '';
  f.querySelector('#inc-act-area').value = '';
  f.querySelector('#inc-act-altura').value = '';
  f.querySelector('#inc-act-info').textContent = '';
  f.querySelector('#inc-act-altura-wrap').style.display = 'none';
}

function renderActividadesList() {
  const list = incendioState.currentForm.querySelector('#inc-act-list');
  if (!list) return;
  list.innerHTML = '';
  const acts = incendioState.currentComp.actividades;
  acts.forEach((a, i) => {
    const desc = a.modo === 'fabricacao'
      ? `${a.nome} — ${a.area}m² — ${a.qsi} MJ/m² — Ci:${a.ci_label} — Rai:${a.rai_label}`
      : `${a.nome} — ${a.area}m² × ${a.altura}m — ${a.qvi} MJ/m³ — Ci:${a.ci_label} — Rai:${a.rai_label}`;
    const d = document.createElement('div');
    d.className = 'item-tag';
    d.innerHTML = `<span>${desc}</span><button class="del-btn" onclick="removerActividade(${i})">✕</button>`;
    list.appendChild(d);
  });
  updateAreaStatus();
  scroll();
}

function updateAreaStatus() {
  const f = incendioState.currentForm;
  if (!f) return;
  const status = f.querySelector('#inc-area-status');
  if (!status) return;
  const comp = incendioState.currentComp;
  const areaUsada = comp.actividades.reduce((s, a) => s + a.area, 0);
  const disponivel = comp.area - areaUsada;
  status.textContent = `Área disponível: ${disponivel.toFixed(1)} / ${comp.area.toFixed(1)} m²`;
  if (disponivel <= 0) {
    status.style.color = '#ef4444';
  } else if (disponivel < comp.area * 0.2) {
    status.style.color = '#f59e0b';
  } else {
    status.style.color = '#10b981';
  }
}

function removerActividade(idx) {
  incendioState.currentComp.actividades.splice(idx, 1);
  renderActividadesList();
}

function finalizarCompartimento() {
  const comp = incendioState.currentComp;
  if (!comp.actividades.length) { alert('Adicione pelo menos uma actividade.'); return; }

  addUser('Calcular compartimento →');
  setProgress(70);

  const resultado = calcularCompartimento(comp);
  incendioState.compartimentos.push({ ...comp, resultado });

  // Mostrar resultado
  mostrarResultadoCompartimento(resultado);

  // Perguntar se quer mais compartimentos
  setTimeout(() => {
    addBot('O que pretende fazer?');
    addPills([
      { label: 'Editar este compartimento', action: () => editarCompartimento() },
      { label: 'Novo compartimento', action: () => pedirCompartimento() },
      { label: 'Ver resultado final', action: () => mostrarResultadoFinal() }
    ]);
  }, 400);
}

function voltarMenuIncendio() {
  if (incendioState.compartimentos.length > 0) {
    addBot('O que pretende fazer?');
    addPills([
      { label: 'Ver resultado final', action: () => mostrarResultadoFinal() },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
    ]);
  } else {
    showToolMenu(currentArea);
  }
}

function editarCompartimento() {
  // Remover o último compartimento calculado (vamos recalcular)
  incendioState.compartimentos.pop();
  // Voltar ao formulário de actividades com os dados preservados
  addUser('Editar compartimento');
  setProgress(30);
  setTimeout(() => pedirActividade(), 300);
}

function mostrarResultadoCompartimento(res) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';

  const catClass = res.categoria.cat === '1ª' ? 'bok' : res.categoria.cat === '2ª' ? 'bwarn' : 'bbad';

  bubble.innerHTML = `
    <div class="rlabel">${res.nome} — ${res.area} m²</div>
    <table class="res-table">
      <thead>
        <tr>
          <th>Actividade</th>
          <th>Modo</th>
          <th style="text-align:right">qs parcial</th>
        </tr>
      </thead>
      <tbody>
        ${res.linhas.map(l => `
          <tr>
            <td>${l.nome}</td>
            <td>${l.modo}</td>
            <td style="text-align:right">${l.contribuicao.toFixed(1)} MJ/m²</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="total-row">
      <div class="total-card">
        <div class="total-label">Densidade de carga de incêndio modificada (qs)</div>
        <div class="total-value">${res.qs.toFixed(1)}</div>
        <div class="total-unit">MJ/m²${res.temArmazenamento ? ' (÷10 para classificação = ' + res.qs_classificacao.toFixed(1) + ' MJ/m²)' : ''}</div>
      </div>
      <div class="total-card">
        <div class="total-label">Categoria de risco</div>
        <div class="total-value"><span class="badge ${catClass}">${res.categoria.cat} Categoria</span></div>
        <div class="total-unit">${res.categoria.nivel}</div>
      </div>
    </div>`;

  row.appendChild(av); row.appendChild(bubble);
  logEl().appendChild(row); scroll();
}

function mostrarResultadoFinal() {
  setProgress(100);
  const comps = incendioState.compartimentos;

  // Calcular totalidade da UT
  const sum_qs_S = comps.reduce((acc, c) => acc + c.resultado.qs * c.area, 0);
  const sum_S = comps.reduce((acc, c) => acc + c.area, 0);
  const q_total = sum_qs_S / sum_S;

  const temArm = comps.some(c => c.resultado.temArmazenamento);
  const q_class = temArm ? q_total / 10 : q_total;
  const categoria = CATEGORIAS_RISCO.find(c => q_class <= c.max);

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const catClass = categoria.cat === '1ª' ? 'bok' : categoria.cat === '2ª' ? 'bwarn' : 'bbad';

  // Tabela de compartimentos
  const tabelaComps = `
    <table class="res-table">
      <thead>
        <tr><th>Compartimento</th><th style="text-align:right">Área (m²)</th><th style="text-align:right">qs (MJ/m²)</th><th>Categoria</th></tr>
      </thead>
      <tbody>
        ${comps.map(c => `
          <tr>
            <td>${c.resultado.nome}</td>
            <td style="text-align:right">${c.area}</td>
            <td style="text-align:right">${c.resultado.qs.toFixed(1)}</td>
            <td><span class="badge ${c.resultado.categoria.cat === '1ª' ? 'bok' : c.resultado.categoria.cat === '2ª' ? 'bwarn' : 'bbad'}">${c.resultado.categoria.cat}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  // Tabela detalhada por actividade
  const tabelaDetalhe = comps.map(c => `
    <div style="margin-top:12px;">
      <div class="rlabel">${c.resultado.nome} — ${c.area} m²</div>
      <table class="res-table">
        <thead><tr><th>Actividade</th><th>Modo</th><th style="text-align:right">qs parcial</th></tr></thead>
        <tbody>
          ${c.resultado.linhas.map(l => `
            <tr>
              <td>${l.nome}</td>
              <td>${l.modo}</td>
              <td style="text-align:right">${l.contribuicao.toFixed(1)} MJ/m²</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  bubble.innerHTML = `
    <div class="rlabel">Resultado Final — ${comps.length === 1 ? '1 compartimento' : comps.length + ' compartimentos'}</div>
    ${tabelaComps}
    <div class="total-row">
      <div class="total-card">
        <div class="total-label">qs ${comps.length > 1 ? 'global da UT' : 'do compartimento'}</div>
        <div class="total-value">${q_total.toFixed(1)}</div>
        <div class="total-unit">MJ/m²${temArm ? ' (÷10 = ' + q_class.toFixed(1) + ' MJ/m²)' : ''} · Área total: ${sum_S.toFixed(1)} m²</div>
      </div>
      <div class="total-card">
        <div class="total-label">Categoria de risco</div>
        <div class="total-value"><span class="badge ${catClass}">${categoria.cat} Categoria</span></div>
        <div class="total-unit">${categoria.nivel}</div>
      </div>
    </div>
    ${tabelaDetalhe}`;

  row.appendChild(av); row.appendChild(bubble);
  logEl().appendChild(row); scroll();

  projectLog.push({
    tool: 'carga_incendio',
    input: comps,
    result: { q_total, q_class, categoria, compartimentos: comps.map(c => c.resultado) },
    ts: new Date().toISOString()
  });
  saveProject();

  setTimeout(() => {
    setProgress(10);
    addBot('Novo cálculo?');
    addPills([
      { label: 'Novo cálculo', action: iniciarCargaIncendio },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) },
      { label: '← Áreas', action: showAreaMenu }
    ]);
  }, 500);
}
