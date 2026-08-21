// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Caudal de Ar Novo
// ar_novo.js — Portaria 138-I/2021 + Manual SCE
// Métodos: prescritivo (Tabelas 11/12) e analítico
// (simulação horária de CO2 com perfis de ocupação,
// replicando a aplicação Qventila v01 do LNEC).
// Nota: corrige o bug da folha LNEC na hora 19-20
// (VLOOKUP col.22 em vez de 21 — hora duplicada).
// ═══════════════════════════════════════════════════

// ─── Tabela 11 (Portaria 138-I/2021) + met (Manual SCE) ───
const AN_TIPOS_ESPACO = [
  { id: 'sono',    nome: 'Quartos, dormitórios e similares', atividade: 'Sono', met: 0.8, qOc: 16 },
  { id: 'descanso', nome: 'Salas de repouso/espera/conferências, auditórios, bibliotecas', atividade: 'Descanso', met: 1.0, qOc: 20 },
  { id: 'sedentaria', nome: 'Escritórios, salas de aula, cinemas, refeições, lojas, museus, convívio, geriatria', atividade: 'Sedentária', met: 1.2, qOc: 24 },
  { id: 'creche',  nome: 'Salas de jardim de infância, pré-escolar e creche', atividade: 'Sedentária (infância)', met: 1.2, qOc: 28 },
  { id: 'moderada', nome: 'Laboratórios, ateliers, trabalhos oficinais, cafés, bares, salas de jogos', atividade: 'Moderada', met: 1.75, qOc: 35 },
  { id: 'ligalta', nome: 'Pista de dança, ginásios, salas de ballet', atividade: 'Ligeiramente alta', met: 2.5, qOc: 49 },
  { id: 'alta',    nome: 'Salas de musculação, pavilhões desportivos', atividade: 'Alta', met: 5.0, qOc: 98 },
];

// ─── Tabela 12 (Portaria 138-I/2021) ───
const AN_TAB12 = [
  { nome: 'Sem atividades com emissão de poluentes específicos', q: 3 },
  { nome: 'Com atividades com emissão de poluentes específicos (lavandarias, perfumarias, salões, madeiras...)', q: 5 },
  { nome: 'Predominância (>75%) de materiais de baixa emissão poluente', q: 2 },
  { nome: 'Piscinas (área = plano de água)', q: 20 },
];

// ─── Faixas etárias: área DuBois + acréscimo met (Manual SCE) ───
const AN_FAIXAS = [
  { nome: '3 anos', adu: 0.65, dmet: 0.19 },
  { nome: 'Até 6 anos', adu: 0.8, dmet: 0.14 },
  { nome: 'Até 9 anos', adu: 1.1, dmet: 0.09 },
  { nome: 'Até 11 anos', adu: 1.3, dmet: 0.07 },
  { nome: 'Até 14 anos', adu: 1.6, dmet: 0.05 },
  { nome: 'Até 18 anos e adultos', adu: 1.8, dmet: 0 },
];

// ─── Eficácias de remoção de poluentes (Manual SCE) ───
const AN_EFICACIAS = [
  { nome: 'Ventilação natural', ev: 1.0 },
  { nome: 'Insuflação pelo teto, ar frio', ev: 1.0 },
  { nome: 'Insuflação pelo teto + extração junto ao pavimento, ar quente', ev: 1.0 },
  { nome: 'Insuflação pelo teto, ar quente ≥8°C acima, retorno pelo teto', ev: 0.8 },
  { nome: 'Insuflação teto, ar quente ≥8°C, retorno teto, jato >0,8 m/s até 1,4 m do pav.', ev: 1.0 },
  { nome: 'Insuflação ar frio junto ao pav. + extração no teto, jato 0,8 m/s alcance ≥1,4 m', ev: 1.0 },
  { nome: 'Ventilação por deslocamento (fluxo unidirecional, estratificação)', ev: 1.2 },
  { nome: 'Insuflação ar quente pav. + extração pav. lado oposto', ev: 1.0 },
  { nome: 'Insuflação ar quente pav. + retorno junto ao teto', ev: 0.7 },
  { nome: 'Admissão natural no lado oposto à extração mecânica', ev: 0.8 },
  { nome: 'Admissão natural junto à extração mecânica', ev: 0.5 },
  { nome: 'Insuflação ar quente pav. + retorno teto, mesmo lado', ev: 0.5 },
  { nome: 'Insuflação ar frio teto + retorno pav., mesmo lado', ev: 0.5 },
];
const AN_EV_DEFAULT = 9; // "Admissão natural no lado oposto à extração mecânica" (0.8 — prática da casa)

// ─── Perfis de ocupação (folha Qventila LNEC, coluna 19-20 corrigida) ───
const AN_PERFIS = {
  'Quarto duplo':    [100,100,100,100,100,100,100,100,100,0,0,0,25,0,0,0,0,0,0,0,0,0,0,0],
  'Sala refeições':  [25,0,0,0,0,0,0,0,0,0,25,0,100,100,100,50,0,0,0,50,100,100,100,100],
  'Bar':             [80,60,0,0,0,0,50,100,100,100,100,0,0,0,0,0,0,0,0,0,0,0,0,0],
  'Átrio':           [50,50,20,20,20,20,20,20,50,100,100,50,50,50,50,50,50,50,100,100,100,50,50,50],
  'Cozinha':         [0,0,0,0,0,0,0,0,50,100,100,100,100,100,100,100,100,100,100,100,100,100,50,25],
  'Sala de reunião': [0,0,0,0,0,0,0,20,50,100,75,100,75,0,100,75,100,75,0,0,0,0,0,0],
  'Ocupação contínua (24h)': [100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],
};

// ─── Perfis personalizados (persistem no browser) ───
const AN_PERFIS_CUSTOM_KEY = 'alios_perfis_custom';
let anPerfisCustom = {};
try {
  if (typeof localStorage !== 'undefined') {
    anPerfisCustom = JSON.parse(localStorage.getItem(AN_PERFIS_CUSTOM_KEY)) || {};
  }
} catch (e) { anPerfisCustom = {}; }

function anTodosPerfis() { return Object.assign({}, AN_PERFIS, anPerfisCustom); }

function anGuardarPerfilCustom(nome, valores) {
  anPerfisCustom[nome] = valores;
  localStorage.setItem(AN_PERFIS_CUSTOM_KEY, JSON.stringify(anPerfisCustom));
}

const AN_CO2_EXT = 390;   // ppm (default Qventila)
const AN_LIMIARES = [
  { nome: '1250 ppm (2250 mg/m³) — limiar de proteção', v: 1250 },
  { nome: '1625 ppm (2925 mg/m³) — limiar com margem de tolerância', v: 1625 },
];

// ─── State ───
let anState = { ramo: null, metodo: null, espacos: [], currentForm: null };

// ─── Registo ───
registerTool('avac', {
  id: 'ar_novo',
  icon: '🌬️',
  name: 'Caudal de ar novo',
  desc: 'Prescritivo e analítico (CO2) — Portaria 138-I/2021',
  launch: iniciarArNovo
});

// ═══ Motor de cálculo ═══

function anSimularCO2(Q, esp) {
  // Balanço de massa com solução analítica exponencial por hora (Manual SCE / Qventila)
  const V = esp.area * esp.pd;
  let C = AN_CO2_EXT;
  const serie = [C], medias = [];
  for (let h = 0; h < 24; h++) {
    const G = 0.0094 * esp.adu * esp.met * esp.nOcup * esp.perfil[h] / 100; // m³/h de CO2
    let Cn, Cm;
    if (Q < 0.1) {
      Cn = C + G / V * 1e6;
      Cm = (C + Cn) / 2;
    } else {
      const Css = AN_CO2_EXT + G / Q * 1e6;
      Cn = Css + (C - Css) * Math.exp(-Q / V);
      Cm = Css + (C - Css) * (V / Q) * (1 - Math.exp(-Q / V));
    }
    serie.push(Cn); medias.push(Cm); C = Cn;
  }
  return { serie, medias };
}

function anCaudalAnalitico(esp, limiar) {
  // Bissecção: média do CO2 nas horas com ocupação >=50% == limiar
  const occ = esp.perfil.map((p, i) => p >= 50 ? i : -1).filter(i => i >= 0);
  if (!occ.length) return 0;
  const f = Q => occ.reduce((s, i) => s + anSimularCO2(Q, esp).medias[i], 0) / occ.length - limiar;
  let lo = 0.1, hi = 200000;
  if (f(lo) <= 0) return lo;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return hi;
}

function anCalcularEspaco(e) {
  const tipo = AN_TIPOS_ESPACO[e.tipoIdx];
  const isSono = tipo.id === 'sono';
  // Critério edifício (Tabela 12) — alínea b): espaços "Sono" só ocupação
  const qEd = isSono ? 0 : AN_TAB12[e.tab12Idx].q * e.area;
  let qOc, co2max = null;
  if (anState.metodo === 'analitico') {
    const faixa = AN_FAIXAS[e.faixaIdx];
    const espSim = {
      area: e.area, pd: e.pd, nOcup: e.nOcup,
      adu: faixa.adu, met: tipo.met + faixa.dmet,
      perfil: (e.perfilValores && e.perfilValores.length === 24) ? e.perfilValores : anTodosPerfis()[e.perfilNome]
    };
    qOc = anCaudalAnalitico(espSim, e.limiar);
    const qan = Math.max(qOc, qEd);
    co2max = Math.round(Math.max(...anSimularCO2(Math.max(qan, 0.1), espSim).serie));
  } else {
    qOc = e.nOcup * tipo.qOc;
  }
  const qan = Math.max(qOc, qEd);
  const ev = AN_EFICACIAS[e.evIdx].ev;
  const qanf = qan / ev;
  return { qOc, qEd, qan, ev, qanf, co2max, isSono, atividade: tipo.atividade };
}

// ═══ Interface ═══

function iniciarArNovo() {
  modo = 'ar_novo';
  setupChat(); setProgress(5); setSub('AVAC — Caudal de ar novo');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarArNovo }]);
  anState = { ramo: null, metodo: null, espacos: [], currentForm: null };

  addBot('Cálculo do <strong>caudal mínimo de ar novo</strong>.<br>DL n.º 101-D/2020 · Portaria n.º 138-I/2021 · Manual SCE.');
  addBot('O edifício é de <strong>habitação</strong> ou de <strong>comércio e serviços</strong>?');
  addPills([
    { label: 'Habitação', action: anHabitacao },
    { label: 'Comércio e serviços', action: anServicos }
  ]);
}

// ─── Ramo habitação ───
function anHabitacao() {
  anState.ramo = 'habitacao';
  addBot('Método rápido (Rph 0,5 × volume) ou a <strong>folha LNEC completa</strong> (Rph estimada por balanço de pressões, com relatório)?');
  addPills([
    { label: 'Rápido — caudal alvo', action: anHabitacaoRapido },
    { label: '🌬️ Folha LNEC completa', action: iniciarRv }
  ]);
}

function anHabitacaoRapido() {
  setProgress(30);
  addBot('Habitação: exige-se <strong>Rph ≥ 0,50 h⁻¹</strong> (Tabela 10 da Portaria 138-I/2021, EN 16798-1).<br>Indica a área e o pé-direito médio para obteres o caudal alvo.');
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>Área útil (m²)</label><input type="number" id="an-hab-area" placeholder="ex: 120" min="1" step="0.1"/></div>
      <div class="form-field"><label>Pé-direito médio (m)</label><input type="number" id="an-hab-pd" placeholder="ex: 2.6" min="1" step="0.01"/></div>
    </div>
    <div class="form-actions"><button class="continuar-btn" onclick="anCalcHabitacao()">Calcular →</button></div>`;
  anState.currentForm = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function anCalcHabitacao() {
  const f = anState.currentForm;
  const area = parseFloat(f.querySelector('#an-hab-area').value);
  const pd = parseFloat(f.querySelector('#an-hab-pd').value);
  if (!area || !pd || area <= 0 || pd <= 0) { alert('Preencha área e pé-direito.'); return; }
  addUser(`${area} m² × ${pd} m`);
  setProgress(100);
  const V = area * pd;
  const Q = 0.5 * V;
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  bubble.innerHTML = `
    <div class="rlabel">Caudal alvo — habitação (Rph mín 0,50 h⁻¹)</div>
    <div class="total-row">
      <div class="total-card"><div class="total-label">Volume interior</div><div class="total-value">${V.toFixed(1)}</div><div class="total-unit">m³</div></div>
      <div class="total-card"><div class="total-label">Caudal de ar novo alvo</div><div class="total-value">${Q.toFixed(1)}</div><div class="total-unit">m³/h</div></div>
    </div>
    <div class="rlabel" style="color:#f59e0b;margin-top:10px;">⚠️ A VERIFICAÇÃO da ventilação natural (Rph efetivo do edifício) faz-se com a metodologia do Manual SCE — folha Rph do LNEC. Esta ferramenta dá o caudal alvo.</div>`;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();

  projectLog.push({ tool: 'ar_novo', input: { ramo: 'habitacao', area, pd }, result: { V, Q }, ts: new Date().toISOString() });
  saveProject();
  anPillsFinais();
}

// ─── Ramo serviços ───
function anServicos() {
  setProgress(12);
  addBot('É um edifício de serviços <strong>corrente</strong> ou uma <strong>clínica/unidade de saúde</strong>?<br><span style="font-size:11px;color:var(--tx-dim)">Clínicas têm requisitos próprios (Portarias de licenciamento de saúde) e balanço aerólico com redes de limpos/sujos.</span>');
  addPills([
    { label: 'Serviços correntes', action: anServicosCorrentes },
    { label: 'Clínica / unidade de saúde', action: () => { anState.ramo = 'clinica'; clIniciar(); } }
  ]);
}

function anServicosCorrentes() {
  anState.ramo = 'servicos';
  setProgress(15);
  addBot('Critério de ocupação — que método?<br><span style="font-size:11px;color:var(--tx-dim)">Prescritivo: caudais fixos da Tabela 11. Analítico: simulação horária de CO2 com perfil de ocupação (replica a aplicação Qventila/LNEC) — normalmente dá caudais menores em ocupação intermitente.</span><br><span style="font-size:11px;color:var(--tx-dim)">Nota: se a ventilação for NATURAL, o caudal mínimo é o mesmo — muda a verificação (90% das horas, folha LNEC).</span>');
  addPills([
    { label: 'Prescritivo (Tabela 11)', action: () => { anState.metodo = 'prescritivo'; anFormEspaco(); } },
    { label: 'Analítico (CO2, perfis)', action: () => { anState.metodo = 'analitico'; anFormEspaco(); } }
  ]);
}

function anFormEspaco() {
  setProgress(30 + Math.min(anState.espacos.length * 10, 50));
  // Desactivar formulários anteriores
  document.querySelectorAll('.input-form').forEach(f => {
    f.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
    f.style.opacity = '0.4';
  });

  const isAna = anState.metodo === 'analitico';
  const n = anState.espacos.length + 1;
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';

  form.innerHTML = `
    <div style="font-size:13px;color:#d0d6e8;margin-bottom:10px;"><strong>Espaço ${n}</strong> — método ${isAna ? 'analítico' : 'prescritivo'}</div>
    <div class="form-row">
      <div class="form-field" style="flex:2"><label>Designação</label><input type="text" id="an-nome" placeholder="ex: Open space piso 1"/></div>
      <div class="form-field"><label>Área (m²)</label><input type="number" id="an-area" placeholder="ex: 85" min="0.1" step="0.1"/></div>
      ${isAna ? '<div class="form-field"><label>Pé-direito (m)</label><input type="number" id="an-pd" placeholder="ex: 2.8" min="1" step="0.01"/></div>' : ''}
      <div class="form-field"><label>N.º ocupantes</label><input type="number" id="an-nocup" placeholder="ex: 12" min="1" step="1"/></div>
    </div>
    <div class="form-row">
      <div class="form-field" style="flex:2"><label>Tipo de espaço (Tabela 11)</label>
        <select id="an-tipo">${AN_TIPOS_ESPACO.map((t, i) => `<option value="${i}">${t.nome} — ${t.atividade} (${t.qOc} m³/h·oc)</option>`).join('')}</select>
      </div>
    </div>
    ${isAna ? `
    <div class="form-row">
      <div class="form-field"><label>Faixa etária</label>
        <select id="an-faixa">${AN_FAIXAS.map((fx, i) => `<option value="${i}" ${i === 5 ? 'selected' : ''}>${fx.nome}</option>`).join('')}</select>
      </div>
      <div class="form-field"><label>Perfil de ocupação</label>
        <select id="an-perfil">${anBuildPerfilOptions()}</select>
        <button type="button" style="background:none;border:none;color:#1E8AFF;cursor:pointer;font-size:11px;text-decoration:underline;padding:2px 0;" onclick="anTogglePerfilEditor()">✎ criar/editar perfil personalizado</button>
      </div>
      <div class="form-field"><label>Limiar CO2</label>
        <select id="an-limiar">${AN_LIMIARES.map((l, i) => `<option value="${l.v}" ${i === 0 ? 'selected' : ''}>${l.nome}</option>`).join('')}</select>
      </div>
    </div>` : ''}
    <div class="form-row">
      <div class="form-field" style="flex:2"><label>Carga poluente do edifício (Tabela 12)</label>
        <select id="an-tab12">${AN_TAB12.map((t, i) => `<option value="${i}">${t.nome} — ${t.q} m³/(h·m²)</option>`).join('')}</select>
      </div>
      <div class="form-field" style="flex:2"><label>Eficácia de ventilação (Manual SCE)</label>
        <select id="an-ev">${AN_EFICACIAS.map((e, i) => `<option value="${i}" ${i === AN_EV_DEFAULT ? 'selected' : ''}>${e.nome} — ev ${e.ev.toFixed(1)}</option>`).join('')}</select>
      </div>
    </div>
    ${isAna ? `
    <div id="an-perfil-editor" style="display:none;background:#0a0f1e;border:1px solid #2a3450;border-radius:8px;padding:12px;margin:8px 0;">
      <div style="font-size:12px;color:#8090b0;margin-bottom:8px;">Perfil personalizado — % de ocupação por hora (0-100). Ao abrir, carrega os valores do perfil seleccionado como ponto de partida.</div>
      <div class="form-row" style="margin-bottom:8px;">
        <div class="form-field" style="flex:2"><label>Nome do perfil</label><input type="text" id="an-pe-nome" placeholder="ex: Loja centro comercial"/></div>
      </div>
      <div id="an-pe-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;"></div>
      <div class="form-actions" style="margin-top:10px;">
        <button class="skip-btn" type="button" onclick="anTogglePerfilEditor()">Cancelar</button>
        <button class="continuar-btn" type="button" onclick="anGuardarPerfil()">Guardar perfil</button>
      </div>
    </div>` : ''}
    <div class="form-row">
      <button class="add-btn" onclick="anAddEspaco()">+ Adicionar espaço</button>
    </div>
    <div class="items-list" id="an-list"></div>
    <div class="form-actions">
      <button class="continuar-btn" onclick="anCalcularServicos()">Calcular caudais →</button>
    </div>`;

  anState.currentForm = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
  anRenderLista();
}

function anBuildPerfilOptions(selecionado) {
  const custom = Object.keys(anPerfisCustom);
  let html = '<optgroup label="Perfis LNEC (Qventila)">' +
    Object.keys(AN_PERFIS).map(p => `<option value="${p}" ${p === selecionado ? 'selected' : ''}>${p}</option>`).join('') +
    '</optgroup>';
  if (custom.length) {
    html += '<optgroup label="Perfis personalizados">' +
      custom.map(p => `<option value="${p}" ${p === selecionado ? 'selected' : ''}>${p}</option>`).join('') +
      '</optgroup>';
  }
  return html;
}

function anTogglePerfilEditor() {
  const f = anState.currentForm;
  const ed = f.querySelector('#an-perfil-editor');
  if (!ed) return;
  if (ed.style.display === 'none') {
    // Carregar o perfil seleccionado como ponto de partida
    const nomeSel = f.querySelector('#an-perfil').value;
    const base = anTodosPerfis()[nomeSel] || new Array(24).fill(0);
    const grid = f.querySelector('#an-pe-grid');
    grid.innerHTML = base.map((v, h) =>
      `<div style="display:flex;flex-direction:column;gap:2px;">
        <label style="font-size:9px;color:#5a7aaa;">${h}–${h + 1}h</label>
        <input type="number" class="an-pe-h" min="0" max="100" step="5" value="${v}"
          style="width:100%;padding:4px;background:#131a2e;border:1px solid #2a3450;border-radius:4px;color:#e0e6f0;font-size:11px;box-sizing:border-box;"/>
      </div>`).join('');
    f.querySelector('#an-pe-nome').value = anPerfisCustom[nomeSel] ? nomeSel : '';
    ed.style.display = 'block';
  } else {
    ed.style.display = 'none';
  }
  scroll();
}

function anGuardarPerfil() {
  const f = anState.currentForm;
  const nome = f.querySelector('#an-pe-nome').value.trim();
  if (!nome) { alert('Dê um nome ao perfil.'); return; }
  if (AN_PERFIS[nome]) { alert('Esse nome pertence a um perfil LNEC — escolha outro (os originais não se tocam).'); return; }
  const vals = [...f.querySelectorAll('.an-pe-h')].map(i => parseFloat(i.value));
  if (vals.length !== 24 || vals.some(v => isNaN(v) || v < 0 || v > 100)) {
    alert('Os 24 valores têm de estar entre 0 e 100.'); return;
  }
  if (!vals.some(v => v >= 50)) {
    alert('O perfil precisa de pelo menos uma hora com ocupação ≥50% (é sobre essas horas que o método avalia o CO2).'); return;
  }
  anGuardarPerfilCustom(nome, vals);
  const sel = f.querySelector('#an-perfil');
  sel.innerHTML = anBuildPerfilOptions(nome);
  f.querySelector('#an-perfil-editor').style.display = 'none';
  addBot(`✓ Perfil "${nome}" guardado (fica disponível em cálculos futuros neste browser).`);
}

function anAddEspaco() {
  const f = anState.currentForm;
  const isAna = anState.metodo === 'analitico';
  const nome = f.querySelector('#an-nome').value.trim();
  const area = parseFloat(f.querySelector('#an-area').value);
  const nOcup = parseInt(f.querySelector('#an-nocup').value);
  if (!nome) { alert('Indique a designação do espaço.'); return; }
  if (!area || area <= 0) { alert('Indique a área.'); return; }
  if (!nOcup || nOcup <= 0) { alert('Indique o n.º de ocupantes.'); return; }

  const e = {
    nome, area, nOcup,
    tipoIdx: parseInt(f.querySelector('#an-tipo').value),
    tab12Idx: parseInt(f.querySelector('#an-tab12').value),
    evIdx: parseInt(f.querySelector('#an-ev').value),
  };
  if (isAna) {
    const pd = parseFloat(f.querySelector('#an-pd').value);
    if (!pd || pd <= 0) { alert('Indique o pé-direito.'); return; }
    e.pd = pd;
    e.faixaIdx = parseInt(f.querySelector('#an-faixa').value);
    e.perfilNome = f.querySelector('#an-perfil').value;
    // snapshot dos valores: o cálculo fica imune a edições futuras do perfil
    e.perfilValores = (anTodosPerfis()[e.perfilNome] || []).slice();
    e.limiar = parseInt(f.querySelector('#an-limiar').value);
  }
  anState.espacos.push(e);
  anRenderLista();
  f.querySelector('#an-nome').value = '';
  f.querySelector('#an-area').value = '';
  f.querySelector('#an-nocup').value = '';
  if (isAna) f.querySelector('#an-pd').value = '';
}

function anRenderLista() {
  const f = anState.currentForm;
  if (!f) return;
  const list = f.querySelector('#an-list');
  if (!list) return;
  list.innerHTML = '';
  anState.espacos.forEach((e, i) => {
    const tipo = AN_TIPOS_ESPACO[e.tipoIdx];
    const d = document.createElement('div');
    d.className = 'item-tag';
    d.innerHTML = `<span>${e.nome} — ${e.area} m² — ${e.nOcup} oc. — ${tipo.atividade}</span><button class="del-btn" onclick="anDelEspaco(${i})">✕</button>`;
    list.appendChild(d);
  });
  scroll();
}

function anDelEspaco(i) {
  anState.espacos.splice(i, 1);
  anRenderLista();
}

function anCalcularServicos() {
  if (!anState.espacos.length) { alert('Adicione pelo menos um espaço.'); return; }
  addUser('Calcular caudais →');
  setProgress(100);

  const isAna = anState.metodo === 'analitico';
  const resultados = anState.espacos.map(e => ({ esp: e, r: anCalcularEspaco(e) }));
  const totalQanf = resultados.reduce((s, x) => s + x.r.qanf, 0);
  const totalQan = resultados.reduce((s, x) => s + x.r.qan, 0);

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  bubble.innerHTML = `
    <div class="rlabel">Caudais de ar novo — método ${isAna ? 'analítico (CO2)' : 'prescritivo'}</div>
    <table class="res-table">
      <thead><tr><th>Espaço</th><th style="text-align:right">Q ocup.</th><th style="text-align:right">Q edif.</th><th style="text-align:right">QAN</th><th style="text-align:right">ev</th><th style="text-align:right">QAN/ev</th>${isAna ? '<th style="text-align:right">CO2 máx</th>' : ''}</tr></thead>
      <tbody>
        ${resultados.map(x => `<tr>
          <td>${x.esp.nome}${x.r.isSono ? ' <span style="color:#5a7aaa;font-size:10px">(Sono: só ocupação)</span>' : ''}</td>
          <td style="text-align:right">${x.r.qOc.toFixed(1)}</td>
          <td style="text-align:right">${x.r.qEd.toFixed(1)}</td>
          <td style="text-align:right"><strong>${x.r.qan.toFixed(1)}</strong></td>
          <td style="text-align:right">${x.r.ev.toFixed(1)}</td>
          <td style="text-align:right"><strong>${x.r.qanf.toFixed(1)}</strong></td>
          ${isAna ? `<td style="text-align:right">${x.r.co2max} ppm</td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="total-row">
      <div class="total-card"><div class="total-label">Σ QAN (sem eficácia)</div><div class="total-value">${totalQan.toFixed(0)}</div><div class="total-unit">m³/h</div></div>
      <div class="total-card"><div class="total-label">Σ QAN/ev (caudal a insuflar)</div><div class="total-value">${totalQanf.toFixed(0)}</div><div class="total-unit">m³/h</div></div>
    </div>`;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();

  projectLog.push({
    tool: 'ar_novo',
    input: { ramo: 'servicos', metodo: anState.metodo, espacos: anState.espacos },
    result: {
      metodo: anState.metodo,
      linhas: resultados.map(x => ({
        nome: x.esp.nome, area: x.esp.area, nOcup: x.esp.nOcup,
        atividade: x.r.atividade, isSono: x.r.isSono,
        perfil: x.esp.perfilNome || null,
        perfilValores: x.esp.perfilValores || null,
        perfilCustom: !!(x.esp.perfilNome && !AN_PERFIS[x.esp.perfilNome]),
        limiar: x.esp.limiar || null,
        evNome: AN_EFICACIAS[x.esp.evIdx].nome,
        qOc: x.r.qOc, qEd: x.r.qEd, qan: x.r.qan, ev: x.r.ev, qanf: x.r.qanf, co2max: x.r.co2max
      })),
      totalQan, totalQanf
    },
    ts: new Date().toISOString()
  });
  saveProject();
  anPillsFinais();
}

function anPillsFinais() {
  setTimeout(() => {
    addBot('E agora?');
    const pills = [
      { label: 'Novo cálculo de ar novo', action: iniciarArNovo },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) },
      { label: '← Áreas', action: showAreaMenu }
    ];
    if (currentProject && projectLog.some(l => l.tool === 'ar_novo' && l.input.ramo === 'servicos')) {
      pills.unshift({ label: '📄 Gerar Anexo Word (MD)', action: gerarAnexoArNovo });
    }
    addPills(pills);
  }, 400);
}

// ═══ Anexo Word para a memória descritiva ═══

async function gerarAnexoArNovo() {
  if (!currentProject) { alert('Crie um projecto primeiro.'); return; }
  const logs = projectLog.filter(l => l.tool === 'ar_novo' && l.input.ramo === 'servicos');
  if (!logs.length) { alert('Não há cálculos de ar novo (serviços) no projecto.'); return; }
  if (typeof docx === 'undefined') { alert('A carregar biblioteca de documentos. Tente novamente.'); return; }

  if (logs.length > 1) {
    const dataUltimo = new Date(logs[logs.length - 1].ts).toLocaleString('pt-PT');
    if (!confirm(`Este projecto tem ${logs.length} cálculos de ar novo.\nO anexo inclui apenas o MAIS RECENTE (${dataUltimo}).\n\nContinuar?`)) return;
  }
  const calc = logs[logs.length - 1];
  const res = calc.result;
  const isAna = res.metodo === 'analitico';

  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, WidthType, ShadingType, VerticalAlign } = docx;

  const COR_AZUL = '1E8AFF', COR_CINZA = '666666', COR_HEADER_BG = 'E8F0FE';
  const FONT = 'Calibri';

  function txt(text, opts = {}) {
    return new TextRun({ text, font: FONT, size: opts.size || 22, bold: opts.bold || false, italics: opts.italics || false, color: opts.color || '333333', ...opts });
  }
  function para(children, opts = {}) {
    if (typeof children === 'string') children = [txt(children)];
    return new Paragraph({ children, spacing: { after: opts.after !== undefined ? opts.after : 120 }, alignment: opts.alignment || AlignmentType.LEFT, ...opts });
  }
  function cellP(text, opts = {}) {
    return new TableCell({
      children: [para(typeof text === 'string' ? [txt(text, opts.textOpts || {})] : text, { after: 40, alignment: opts.alignment || AlignmentType.LEFT })],
      shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
      verticalAlign: VerticalAlign.CENTER
    });
  }

  const corpo = [];

  corpo.push(para([txt('ANEXO — CAUDAIS MÍNIMOS DE AR NOVO', { size: 28, bold: true, color: COR_AZUL })], { after: 300 }));

  // 1. Enquadramento
  corpo.push(
    para([txt('1. Enquadramento regulamentar', { size: 24, bold: true, color: '222222' })], { after: 120 }),
    para('A determinação dos caudais mínimos de ar novo foi efetuada nos termos do Decreto-Lei n.º 101-D/2020, de 7 de dezembro, e da Portaria n.º 138-I/2021, de 1 de julho, de acordo com a metodologia prevista no Manual SCE. O caudal mínimo de ar novo de cada espaço corresponde ao valor máximo obtido da comparação entre o critério de ocupação e o critério do edifício (ponto 1.2.2 do Anexo I da referida Portaria).')
  );

  // 2. Método
  corpo.push(para([txt('2. Método de cálculo', { size: 24, bold: true, color: '222222' })], { after: 120 }));
  if (isAna) {
    corpo.push(
      para('Para o critério de ocupação foi utilizado o método analítico, através da simulação horária da concentração de dióxido de carbono (CO2) em cada espaço, considerando o perfil de ocupação, a taxa metabólica dos ocupantes e a respetiva área de superfície corporal (área de DuBois), de acordo com o Capítulo 9 do Manual SCE (aplicação Qventila, LNEC). O caudal mínimo é o que garante que a concentração média de CO2, nas horas de ocupação relevante, não excede o limiar de proteção.'),
      para([txt('Geração de CO2 por ocupante: G = 0,0094 × ADu × M [m³/h], com ADu a área de DuBois [m²] e M a taxa metabólica [met]. Concentração exterior de CO2 considerada: ' + AN_CO2_EXT + ' ppm.', { italics: true, size: 20, color: COR_CINZA })])
    );
  } else {
    corpo.push(
      para('Para o critério de ocupação foi utilizado o método prescritivo, com os caudais mínimos de ar novo por ocupante da Tabela 11 da Portaria n.º 138-I/2021, em função do tipo de espaço e da atividade metabólica.')
    );
  }
  corpo.push(
    para('Para o critério do edifício foram considerados os caudais por unidade de área da Tabela 12 da mesma Portaria, em função da carga poluente do edifício. Nos espaços de atividade "Sono", o caudal foi determinado apenas pelo critério de ocupação, conforme alínea b) do ponto 1.2.2.'),
    para('O caudal de insuflação de cada espaço resulta da correção do caudal mínimo pela eficácia de remoção de poluentes (ev) da configuração de ventilação adotada, conforme o Manual SCE: Qinsuflar = QAN / ev.')
  );

  // 3. Tabela de resultados
  corpo.push(para([txt('3. Resultados por espaço', { size: 24, bold: true, color: '222222' })], { after: 120 }));

  const headers = ['Espaço', 'Área (m²)', 'Ocup.', 'Atividade', 'Q ocup. (m³/h)', 'Q edif. (m³/h)', 'QAN (m³/h)', 'ev', 'Q insuflar (m³/h)'];
  const rows = [
    new TableRow({ children: headers.map(h => cellP(h, { shading: COR_HEADER_BG, textOpts: { bold: true, size: 18, color: '333333' } })) }),
    ...res.linhas.map(l => new TableRow({
      children: [
        cellP(l.nome + (l.isSono ? ' (Sono)' : ''), { textOpts: { size: 18 } }),
        cellP(l.area.toString(), { textOpts: { size: 18 }, alignment: AlignmentType.RIGHT }),
        cellP(l.nOcup.toString(), { textOpts: { size: 18 }, alignment: AlignmentType.RIGHT }),
        cellP(l.atividade, { textOpts: { size: 18 } }),
        cellP(l.qOc.toFixed(1), { textOpts: { size: 18 }, alignment: AlignmentType.RIGHT }),
        cellP(l.qEd.toFixed(1), { textOpts: { size: 18 }, alignment: AlignmentType.RIGHT }),
        cellP(l.qan.toFixed(1), { textOpts: { size: 18, bold: true }, alignment: AlignmentType.RIGHT }),
        cellP(l.ev.toFixed(1), { textOpts: { size: 18 }, alignment: AlignmentType.RIGHT }),
        cellP(l.qanf.toFixed(1), { textOpts: { size: 18, bold: true }, alignment: AlignmentType.RIGHT }),
      ]
    }))
  ];
  corpo.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));

  corpo.push(
    para(''),
    para([
      txt('Caudal total de ar novo a insuflar: ', { bold: true, size: 24 }),
      txt(`${res.totalQanf.toFixed(0)} m³/h`, { bold: true, size: 28, color: COR_AZUL })
    ])
  );

  // 4. Pressupostos
  const pres = [
    'Concentração exterior de CO2: ' + AN_CO2_EXT + ' ppm.',
  ];
  if (isAna) {
    const limiares = [...new Set(res.linhas.map(l => l.limiar).filter(Boolean))];
    pres.push('Limiar de proteção de CO2: ' + limiares.join(' / ') + ' ppm (Portaria n.º 138-G/2021).');
    const perfisLNEC = [...new Set(res.linhas.filter(l => l.perfil && !l.perfilCustom).map(l => l.perfil))];
    if (perfisLNEC.length) {
      pres.push('Perfis de ocupação: ' + perfisLNEC.join('; ') + ' (aplicação Qventila, LNEC).');
    }
    // Perfis personalizados: valores integrais (não são padrão, o revisor tem de os ver)
    const custom = {};
    res.linhas.filter(l => l.perfilCustom && l.perfilValores).forEach(l => { custom[l.perfil] = l.perfilValores; });
    Object.keys(custom).forEach(nome => {
      pres.push(`Perfil de ocupação personalizado "${nome}" (% por hora, 0h-24h): ${custom[nome].join(', ')}.`);
    });
    pres.push('Nota: máximos horários de CO2 por espaço: ' + res.linhas.map(l => `${l.nome}: ${l.co2max} ppm`).join('; ') + '.');
  }
  const evsUsadas = [...new Set(res.linhas.map(l => `${l.evNome} (ev ${l.ev.toFixed(1)})`))];
  pres.push('Eficácia de remoção de poluentes: ' + evsUsadas.join('; ') + '.');

  corpo.push(para([txt('4. Pressupostos', { size: 24, bold: true, color: '222222' })], { after: 120 }));
  pres.forEach(p => corpo.push(para([txt(p, { size: 20, color: COR_CINZA })], { after: 60 })));

  corpo.push(
    para(''),
    para([txt('Calculado com ALIOS ONE — Cálculos de Engenharia', { size: 18, italics: true, color: COR_AZUL })])
  );

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: corpo
    }]
  });

  try {
    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nomeFile = currentProject.nome.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').trim();
    a.download = `${nomeFile} - Anexo Ar Novo.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Erro ao gerar anexo:', e);
    alert('Erro ao gerar o anexo. Verifique a consola.');
  }
}
