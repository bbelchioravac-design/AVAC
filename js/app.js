// ═══════════════════════════════════════════════════
// ALIOS ONE — Cálculos de Engenharia
// app.js — Core: activação, splash, menus, helpers
// ═══════════════════════════════════════════════════

const CHAVE_MESTRA = "ALIOS-ONE-2026-BB-CALCULOS";
const LICENSE_KEY = "alios_calculos_license";

const AVATAR_SVG='<svg width="26" height="26" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="28" fill="#0a0f1e"/><g transform="translate(25,8)"><path d="M25 0 L-2 82 L15 82 L31 14 Z" fill="#1E8AFF"/><path d="M25 0 L52 82 L35 82 L21 14 Z" fill="#D8E2F0"/><circle cx="25" cy="68" r="9" fill="#10b981"/></g></svg>';

// ─── Registo de áreas e ferramentas ───
// Cada módulo (avac.js, incendio.js, etc.) regista-se aqui
const AREAS=[
  {id:'avac',icon:'🌀',name:'AVAC',desc:'Condutas, ventilação, climatização',active:false,tools:[]},
  {id:'aguas',icon:'💧',name:'Águas e Esgotos',desc:'Tubagens, bombas, depósitos',active:false,tools:[]},
  {id:'electricidade',icon:'⚡',name:'Electricidade',desc:'Circuitos, protecções, quadros',active:false,tools:[]},
  {id:'termica',icon:'🌡️',name:'Comportamento Térmico',desc:'Envolventes, pontes térmicas, condensações',active:false,tools:[]},
  {id:'desenfumagem',icon:'🔥',name:'Desenfumagem',desc:'Caudais, pressurização, condutas de desenfumagem',active:false,tools:[]},
  {id:'incendio',icon:'🧯',name:'Segurança contra Incêndio',desc:'Cargas de incêndio, meios de extinção',active:false,tools:[]},
  {id:'gtc',icon:'🎛️',name:'Gestão Técnica',desc:'Listas de pontos GTC/SACE, verificação 138-I',active:false,tools:[]},
];

// Função para módulos registarem ferramentas
function registerTool(areaId, tool) {
  const area = AREAS.find(a => a.id === areaId);
  if (area) {
    area.tools.push(tool);
    area.active = true;
  }
}

// ─── State global ───
let currentArea = null;
let modo = null;
let projectLog = [];
let currentProject = null;

// ─── Projectos (histórico) ───
const PROJECTS_KEY = 'alios_projects';
const CURRENT_PROJECT_ID_KEY = 'alios_current_project_id';
const PROJECT_STORAGE_KEY = 'alios_current_project'; // formato antigo (só migração)
let projects = [];

function genProjectId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function saveProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function loadProject() {
  try { projects = JSON.parse(localStorage.getItem(PROJECTS_KEY)) || []; } catch (e) { projects = []; }
  // Migração do formato antigo (projecto único) — ninguém perde nada
  try {
    const old = JSON.parse(localStorage.getItem(PROJECT_STORAGE_KEY));
    if (old && old.nome) {
      old.id = genProjectId();
      projects.unshift(old);
      localStorage.removeItem(PROJECT_STORAGE_KEY);
      saveProjects();
      localStorage.setItem(CURRENT_PROJECT_ID_KEY, old.id);
    }
  } catch (e) {}
  const cid = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
  const found = projects.find(p => p.id === cid);
  if (found) { currentProject = found; projectLog = found.log || []; }
}

function saveProject() {
  if (currentProject) {
    currentProject.log = projectLog;
    saveProjects();
  }
}

function fecharProjecto() {
  // Fecha sem apagar — o projecto fica no histórico
  saveProject();
  currentProject = null;
  projectLog = [];
  localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
  showAreaMenu();
}

function abrirProjecto(id) {
  saveProject();
  const p = projects.find(x => x.id === id);
  if (!p) return;
  currentProject = p;
  projectLog = p.log || [];
  localStorage.setItem(CURRENT_PROJECT_ID_KEY, id);
  showAreaMenu();
}

function apagarProjecto(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const n = (p.log || []).length;
  const msg = n > 0
    ? `Apagar o projecto "${p.nome}"?\nTem ${n} cálculo(s) registado(s). Esta acção não tem volta.`
    : `Apagar o projecto "${p.nome}"?`;
  if (!confirm(msg)) return;
  projects = projects.filter(x => x.id !== id);
  saveProjects();
  if (currentProject && currentProject.id === id) {
    currentProject = null;
    projectLog = [];
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
  }
  showProjectList();
}

// ─── DOM helpers ───
const mainEl = () => document.getElementById('main');
const setSub = t => document.getElementById('header-sub').textContent = t;
const setProgress = p => document.getElementById('progress').style.width = p + '%';

function setHeaderBtns(btns) {
  const wrap = document.getElementById('header-btns');
  wrap.innerHTML = '';
  btns.forEach(b => {
    const el = document.createElement('button');
    el.className = 'hdr-btn' + (b.primary ? ' primary' : '');
    el.textContent = b.label;
    el.onclick = b.action;
    wrap.appendChild(el);
  });
}

function scroll() { const m = mainEl(); m.scrollTop = m.scrollHeight; }

// ─── Chat helpers (usados por todas as ferramentas) ───
function setupChat() {
  const m = mainEl(); m.innerHTML = '';
  const chatWrap = document.createElement('div');
  chatWrap.className = 'chat-wrap';
  chatWrap.innerHTML = `<div class="chat-log" id="log"></div><div class="chat-input-row"><input class="chat-input" id="inp" placeholder="Escreva aqui..." disabled onkeydown="if(event.key==='Enter')enviar()"/><button class="chat-send" id="sendbtn" onclick="enviar()" disabled>Enviar</button></div>`;
  m.appendChild(chatWrap);
}

function logEl() { return document.getElementById('log'); }

function addBot(html) {
  const row = document.createElement('div');
  row.className = 'bot-row';
  row.innerHTML = `<div class="bot-av">${AVATAR_SVG}</div><div class="bot-bubble">${html}</div>`;
  logEl().appendChild(row);
  scroll();
}

function addUser(txt) {
  const d = document.createElement('div');
  d.className = 'user-bubble';
  d.textContent = txt;
  logEl().appendChild(d);
  scroll();
}

function enableInput(ph) {
  const i = document.getElementById('inp');
  i.disabled = false;
  i.placeholder = ph || 'Escreva aqui...';
  i.focus();
  document.getElementById('sendbtn').disabled = false;
}

function disableInput() {
  const i = document.getElementById('inp');
  i.disabled = true;
  document.getElementById('sendbtn').disabled = true;
  i.value = '';
}

function addPills(pills) {
  const wrap = document.createElement('div');
  wrap.className = 'btns-row';
  pills.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'pill-btn';
    btn.textContent = p.label;
    btn.onclick = () => {
      wrap.querySelectorAll('.pill-btn').forEach(x => x.disabled = true);
      addUser(p.label);
      p.action();
    };
    wrap.appendChild(btn);
  });
  logEl().appendChild(wrap);
  scroll();
}

// ─── Activation ───
async function sha256(msg) {
  const enc = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function gerarCodigo(email) {
  email = email.trim().toLowerCase();
  const h = await sha256(CHAVE_MESTRA + ":" + email);
  return h.substr(0, 4) + "-" + h.substr(4, 4) + "-" + h.substr(8, 4) + "-" + h.substr(12, 4);
}

async function tryActivate() {
  const email = document.getElementById('act-email').value.trim();
  const code = document.getElementById('act-code').value.trim().toUpperCase();
  const err = document.getElementById('act-error');
  if (!email || !email.includes('@')) { err.textContent = 'Email inválido.'; err.style.display = 'block'; return; }
  const expected = await gerarCodigo(email);
  if (code === expected) {
    localStorage.setItem(LICENSE_KEY, JSON.stringify({ email, code }));
    document.getElementById('activation').classList.add('hide');
    document.getElementById('splash').style.display = 'flex';
    err.style.display = 'none';
  } else {
    err.textContent = 'Código inválido. Tente novamente.';
    err.style.display = 'block';
  }
}

async function checkLicense() {
  try {
    const data = JSON.parse(localStorage.getItem(LICENSE_KEY));
    if (!data) return false;
    const expected = await gerarCodigo(data.email);
    return data.code === expected;
  } catch (e) { return false; }
}

async function initApp() {
  loadProject();
  const valid = await checkLicense();
  if (valid) {
    document.getElementById('activation').classList.add('hide');
    document.getElementById('splash').style.display = 'flex';
  }
}

function enterApp() {
  const s = document.getElementById('splash');
  s.classList.add('hide');
  document.getElementById('app').classList.add('visible');
  setTimeout(() => { s.style.display = 'none'; showAreaMenu(); }, 500);
}

// ─── Projecto: UI ───

// ─── Relatório: marcar cálculos ───
function juntarAoRelatorio() {
  const lastIdx = projectLog.length - 1;
  if (lastIdx >= 0 && !projectLog[lastIdx].incluirRelatorio) {
    projectLog[lastIdx].incluirRelatorio = true;
    saveProject();
    addBot('✓ Cálculo adicionado ao relatório.');
  } else if (lastIdx >= 0) {
    addBot('Este cálculo já está no relatório.');
  }
}

// ─── Export Excel ───
function exportarExcel() {
  if (typeof XLSX === 'undefined') {
    alert('A carregar biblioteca Excel. Tente novamente em alguns segundos.');
    return;
  }
  const marcados = projectLog.filter(l => l.incluirRelatorio);
  if (marcados.length === 0) { alert('Nenhum cálculo marcado para o relatório.\nUse "Juntar ao relatório" após cada cálculo.'); return; }

  const wb = XLSX.utils.book_new();

  // Sheet: Dimensionamento de condutas
  const condutas = marcados.filter(l => l.tool === 'dim_condutas');
  if (condutas.length > 0) {
    const data = condutas.map(l => {
      const row = {
        'Caudal (m³/h)': l.input.caudal,
        'Método': l.input.modo === 'ped' ? 'PED' : 'Velocidade',
        'Parâmetro': l.input.param,
        'Unidade': l.input.unidade === 'pa' ? 'Pa/m' : 'mmca/m',
        'DN (mm)': l.result.D_norm,
        'Velocidade (m/s)': Math.round(l.result.v_real * 100) / 100,
        'PED (Pa/m)': Math.round(l.result.dPm_Pa * 100) / 100,
        'PED (mmca/m)': Math.round(l.result.dPm_mmca * 1000) / 1000,
      };
      l.result.rects.forEach((rc, i) => {
        row[`Rect ${i + 1}`] = `${rc.a}×${rc.b}`;
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Condutas');
  }

  // Sheet: PED instalação
  const ped = marcados.filter(l => l.tool === 'ped_instalacao');
  if (ped.length > 0) {
    const data = [];
    ped.forEach((l, idx) => {
      l.result.linhas.forEach(linha => {
        data.push({
          'Cálculo': idx + 1,
          'Elemento': linha.desc,
          'Perda (Pa)': Math.round(linha.pa * 10) / 10,
          'Perda (mmca)': Math.round(linha.pa / 9.81 * 100) / 100,
        });
      });
      data.push({
        'Cálculo': idx + 1,
        'Elemento': 'TOTAL',
        'Perda (Pa)': Math.round(l.result.totalPa * 10) / 10,
        'Perda (mmca)': Math.round(l.result.totalMmca * 100) / 100,
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'PED Instalação');
  }

  // Sheet: Carga de incêndio
  const incendio = marcados.filter(l => l.tool === 'carga_incendio');
  if (incendio.length > 0) {
    const data = [];
    incendio.forEach((l, idx) => {
      l.result.compartimentos.forEach(c => {
        c.linhas.forEach(linha => {
          data.push({
            'Cálculo': idx + 1,
            'Compartimento': c.nome,
            'Área (m²)': c.area,
            'Actividade': linha.nome,
            'Modo': linha.modo,
            'qs parcial (MJ/m²)': Math.round(linha.contribuicao * 10) / 10,
          });
        });
        data.push({
          'Cálculo': idx + 1,
          'Compartimento': c.nome,
          'Área (m²)': c.area,
          'Actividade': 'TOTAL',
          'Modo': '',
          'qs parcial (MJ/m²)': Math.round(c.qs * 10) / 10,
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Carga Incêndio');
  }

  // Sheet: Pressupostos de cálculo (só se houver cálculos AVAC)
  if (condutas.length > 0 || ped.length > 0) {
    const pressupostos = [
      { 'Parâmetro': 'Massa volúmica do ar (ρ)', 'Valor': '1,2 kg/m³' },
      { 'Parâmetro': 'Factor de atrito (λ)', 'Valor': '0,02 (conduta metálica lisa)' },
      { 'Parâmetro': 'Coef. perda localizada — Curva 90°', 'Valor': 'ζ = 0,4' },
      { 'Parâmetro': 'Coef. perda localizada — Curva 45°', 'Valor': 'ζ = 0,17' },
      { 'Parâmetro': 'Coef. perda localizada — Derivação T', 'Valor': 'ζ = 0,9' },
      { 'Parâmetro': 'Diâmetro equivalente rectangular', 'Valor': 'Huebscher: Deq = 1,265·(a·b)^0,6/(a+b)^0,2' },
      { 'Parâmetro': 'Diâmetro normalizado', 'Valor': 'Arredondado por excesso (critério = máximo)' },
    ];
    const wsP = XLSX.utils.json_to_sheet(pressupostos);
    XLSX.utils.book_append_sheet(wb, wsP, 'Pressupostos');
  }

  // Sheet: Fotovoltaico NT-SCE-01 (fotovoltaico.js)
  if (typeof pvFolhaExcel === 'function') pvFolhaExcel(wb, marcados);

  const nomeFile = currentProject ? currentProject.nome.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '').trim() : 'ALIOS_Calculos';
  XLSX.writeFile(wb, `${nomeFile} - Cálculos.xlsx`);
}
function injectProjectCSS() {
  if (document.getElementById('project-css')) return;
  const style = document.createElement('style');
  style.id = 'project-css';
  style.textContent = `
    .project-card {
      background: linear-gradient(135deg, #0f1729 0%, #131d33 100%);
      border: 1px solid #1a2744;
      border-radius: 12px; padding: 16px 20px;
      margin-bottom: 20px;
    }
    .project-card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 4px;
    }
    .project-card-title {
      font-size: 13px; font-weight: 600; color: #8090b0;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .project-card-actions { display: flex; gap: 8px; }
    .project-card-actions button {
      background: none; border: none; color: #5a7aaa;
      font-size: 12px; cursor: pointer; padding: 2px 6px;
      border-radius: 4px;
    }
    .project-card-actions button:hover { color: #1E8AFF; background: rgba(30,138,255,0.1); }
    .project-empty {
      color: #4a5a78; font-size: 13px; padding: 8px 0;
    }
    .project-info {
      display: grid; grid-template-columns: auto 1fr;
      gap: 4px 12px; font-size: 13px; padding: 8px 0;
    }
    .project-info-label { color: #5a7aaa; }
    .project-info-value { color: #d0d6e8; }
    .project-log-count {
      font-size: 11px; color: #10b981; margin-top: 6px;
    }
    .project-form { padding: 8px 0; }
    .project-form .pf-row { margin-bottom: 10px; }
    .project-form label {
      display: block; font-size: 11px; color: #5a7aaa;
      margin-bottom: 4px; font-weight: 500;
    }
    .project-form input {
      width: 100%; padding: 8px 12px;
      background: #0a0f1e; border: 1px solid #2a3450;
      border-radius: 6px; color: #e0e6f0; font-size: 13px;
      box-sizing: border-box;
    }
    .project-form input:focus { border-color: #1E8AFF; outline: none; }
    .project-form-btns {
      display: flex; gap: 8px; margin-top: 12px;
    }
    .project-form-btns button {
      padding: 7px 16px; border-radius: 6px; border: none;
      font-size: 13px; cursor: pointer; font-weight: 500;
    }
    .pf-btn-save { background: #1E8AFF; color: #fff; }
    .pf-btn-save:hover { background: #3d9dff; }
    .pf-btn-cancel { background: #1a2744; color: #8090b0; }
    .pf-btn-cancel:hover { background: #243352; }
    .proj-list { max-height: 260px; overflow-y: auto; }
    .proj-row {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 8px;
      border: 1px solid transparent;
    }
    .proj-row:hover { background: rgba(30,138,255,0.08); border-color: #1a2744; }
    .proj-row.proj-activo { border-color: #10b98144; }
    .proj-row-info { flex: 1; cursor: pointer; min-width: 0; }
    .proj-row-nome { font-size: 13px; color: #d0d6e8; font-weight: 500; }
    .proj-row-meta {
      font-size: 11px; color: #5a7aaa;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .proj-row-del {
      background: none; border: none; color: #5a7aaa;
      cursor: pointer; font-size: 13px; padding: 4px 8px; border-radius: 4px;
      flex-shrink: 0;
    }
    .proj-row-del:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
  `;
  document.head.appendChild(style);
}

function renderProjectCard() {
  injectProjectCSS();
  const card = document.createElement('div');
  card.className = 'project-card';
  card.id = 'project-card';

  if (currentProject) {
    const nCalc = projectLog.length;
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">📋 Projecto activo</div>
        <div class="project-card-actions">
          <button onclick="showProjectList()">Projectos${projects.length > 1 ? ' (' + projects.length + ')' : ''}</button>
          <button onclick="showProjectForm(true)">Editar</button>
          <button onclick="fecharProjecto()">Fechar</button>
        </div>
      </div>
      <div class="project-info">
        <span class="project-info-label">Projecto:</span>
        <span class="project-info-value">${currentProject.nome}</span>
        ${currentProject.morada ? `<span class="project-info-label">Morada:</span><span class="project-info-value">${currentProject.morada}</span>` : ''}
        ${currentProject.requerente ? `<span class="project-info-label">Requerente:</span><span class="project-info-value">${currentProject.requerente}</span>` : ''}
      </div>
      ${nCalc > 0 ? `<div class="project-log-count">✓ ${nCalc} cálculo${nCalc !== 1 ? 's' : ''} registado${nCalc !== 1 ? 's' : ''}</div>` : ''}`;
  } else {
    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-card-title">📋 Projecto</div>
        ${projects.length ? `<div class="project-card-actions"><button onclick="showProjectList()">Projectos (${projects.length})</button></div>` : ''}
      </div>
      <div class="project-empty">
        Sem projecto — cálculos avulsos.
        <button style="background:none;border:none;color:#1E8AFF;cursor:pointer;font-size:13px;text-decoration:underline;padding:0 4px;" onclick="showProjectForm(false)">Criar projecto</button>
        ${projects.length ? `<button style="background:none;border:none;color:#1E8AFF;cursor:pointer;font-size:13px;text-decoration:underline;padding:0 4px;" onclick="showProjectList()">Abrir existente</button>` : ''}
      </div>`;
  }
  return card;
}

function showProjectList() {
  const card = document.getElementById('project-card');
  if (!card) return;
  const rows = projects.map(p => {
    const n = (p.log || []).length;
    const activo = currentProject && currentProject.id === p.id;
    const data = p.criado ? new Date(p.criado).toLocaleDateString('pt-PT') : '';
    return `<div class="proj-row${activo ? ' proj-activo' : ''}">
      <div class="proj-row-info" onclick="abrirProjecto('${p.id}')">
        <div class="proj-row-nome">${p.nome}${activo ? ' <span style="color:#10b981;font-size:11px;">● activo</span>' : ''}</div>
        <div class="proj-row-meta">${n} cálculo${n !== 1 ? 's' : ''}${data ? ' · criado ' + data : ''}${p.morada ? ' · ' + p.morada : ''}</div>
      </div>
      <button class="proj-row-del" title="Apagar projecto" onclick="apagarProjecto('${p.id}')">✕</button>
    </div>`;
  }).join('');
  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-card-title">📋 Projectos (${projects.length})</div>
      <div class="project-card-actions">
        <button onclick="showProjectFormFromList()">+ Novo</button>
        <button onclick="showAreaMenu()">Fechar lista</button>
      </div>
    </div>
    ${projects.length ? `<div class="proj-list">${rows}</div>` : '<div class="project-empty">Nenhum projecto guardado.</div>'}`;
}

function showProjectFormFromList() {
  // Criar novo a partir da lista: fecha o actual (fica guardado) e abre o formulário
  saveProject();
  currentProject = null;
  projectLog = [];
  localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
  showProjectForm(false);
}

function showProjectForm(isEdit) {
  const card = document.getElementById('project-card');
  if (!card) return;
  const nome = isEdit && currentProject ? currentProject.nome : '';
  const morada = isEdit && currentProject ? (currentProject.morada || '') : '';
  const requerente = isEdit && currentProject ? (currentProject.requerente || '') : '';

  card.innerHTML = `
    <div class="project-card-header">
      <div class="project-card-title">📋 ${isEdit ? 'Editar' : 'Novo'} projecto</div>
    </div>
    <div class="project-form">
      <div class="pf-row">
        <label>Nome do projecto *</label>
        <input type="text" id="pf-nome" value="${nome}" placeholder="ex: Armazém Logístico Setúbal"/>
      </div>
      <div class="pf-row">
        <label>Morada</label>
        <input type="text" id="pf-morada" value="${morada}" placeholder="ex: Rua da Indústria, 45, Setúbal"/>
      </div>
      <div class="pf-row">
        <label>Requerente</label>
        <input type="text" id="pf-requerente" value="${requerente}" placeholder="ex: Logística Santos, Lda."/>
      </div>
      <div class="project-form-btns">
        <button class="pf-btn-save" onclick="submitProject()">Guardar</button>
        <button class="pf-btn-cancel" onclick="showAreaMenu()">Cancelar</button>
      </div>
    </div>`;
}

function submitProject() {
  const nome = document.getElementById('pf-nome').value.trim();
  if (!nome) { alert('Indique o nome do projecto.'); return; }

  const morada = document.getElementById('pf-morada').value.trim();
  const requerente = document.getElementById('pf-requerente').value.trim();

  if (!currentProject) {
    currentProject = { id: genProjectId(), nome, morada, requerente, criado: new Date().toISOString(), log: [] };
    projectLog = [];
    projects.unshift(currentProject);
    localStorage.setItem(CURRENT_PROJECT_ID_KEY, currentProject.id);
  } else {
    currentProject.nome = nome;
    currentProject.morada = morada;
    currentProject.requerente = requerente;
  }
  saveProject();
  showAreaMenu();
}

// ─── Area Menu ───
function showAreaMenu() {
  currentArea = null;
  modo = null;
  setProgress(0);
  setSub('Cálculos de Engenharia');
  setHeaderBtns([]);
  const m = mainEl(); m.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'area-menu';

  // Card de projecto
  wrap.appendChild(renderProjectCard());

  wrap.innerHTML += '<div class="area-menu-title">Seleccione a área de engenharia</div>';
  const grid = document.createElement('div');
  grid.className = 'area-grid';
  AREAS.forEach(a => {
    const card = document.createElement('div');
    card.className = 'area-card' + (a.active ? '' : ' disabled');
    card.innerHTML = `<div class="area-icon">${a.icon}</div><div class="area-name">${a.name}</div><div class="area-desc">${a.desc}</div><div class="area-badge ${a.active ? 'badge-active' : 'badge-soon'}">${a.active ? a.tools.length + ' ferramenta' + (a.tools.length !== 1 ? 's' : '') : 'Em breve'}</div>`;
    if (a.active) card.onclick = () => showToolMenu(a);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  m.appendChild(wrap);
}

// ─── Tool Menu ───
function showToolMenu(area) {
  currentArea = area;
  setProgress(0);
  setSub(area.name);
  setHeaderBtns([{ label: '← Áreas', action: showAreaMenu }]);
  const m = mainEl(); m.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'tool-menu';
  wrap.innerHTML = `<div class="area-menu-title">${area.icon} ${area.name} — Ferramentas</div>`;
  const grid = document.createElement('div');
  grid.className = 'tool-grid';
  area.tools.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.innerHTML = `<div class="tool-icon">${t.icon}</div><div><div class="tool-name">${t.name}</div><div class="tool-desc">${t.desc}</div></div>`;
    card.onclick = () => t.launch();
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  m.appendChild(wrap);
}

// ─── Input dispatcher (cada módulo regista o seu handler) ───
const inputHandlers = {};

function enviar() {
  const val = document.getElementById('inp').value.trim();
  if (!val) return;
  if (modo && inputHandlers[modo]) {
    inputHandlers[modo](val);
  }
}

// ─── Service Worker ───
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js'); }

// ─── Init ───
initApp();
