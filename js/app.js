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
  wrap.innerHTML = '<div class="area-menu-title">Seleccione a área de engenharia</div>';
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
