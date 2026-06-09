// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC
// avac.js — Dimensionamento de condutas + PED
// ═══════════════════════════════════════════════════

// ─── Constants AVAC ───
const DN = [80, 100, 125, 150, 160, 180, 200, 224, 250, 280, 300, 350, 400, 450, 500, 550, 600];
const RECT_DIMS = []; for (let v = 100; v <= 1200; v += 50) RECT_DIMS.push(v);
const RHO = 1.2;

// ─── State AVAC ───
let estadoA = { fase: 0, modoCalc: null, caudal: null, tipoSecao: null, filtroRect: { alturaMax: null, larguraMax: null }, currentFilterForm: null };
let dadosB = { trocos: [], sing90: [], sing45: [], singT: [], fixas: [] };

// ─── Math helpers ───
function areaCirc(dn) { const r = dn / 2000; return Math.PI * r * r; }
function areaRect(a, b) { return (a / 1000) * (b / 1000); }
function deqHuebscher(a, b) { return 1.265 * Math.pow(a * b, 0.6) / Math.pow(a + b, 0.2); }
function velocidade(Q_h, area) { return (Q_h / 3600) / area; }
function labelSecao(item) { return item.tipo === 'circ' ? `Ø${item.dn}` : `${item.a}×${item.b}`; }

// ─── Registo das ferramentas AVAC ───
registerTool('avac', {
  id: 'dim_condutas',
  icon: '📐',
  name: 'Dimensionamento de condutas',
  desc: 'Diâmetro, velocidade e equivalentes rectangulares',
  launch: iniciarModoA
});

registerTool('avac', {
  id: 'ped_instalacao',
  icon: '🔧',
  name: 'PED da instalação',
  desc: 'Perda de carga total do circuito mais desfavorável',
  launch: iniciarModoB
});

// ─── Input handler AVAC ───
inputHandlers['a'] = function(val) { enviarA(val); };

// ═══ MODO A — Dimensionamento ═══
function iniciarModoA() {
  modo = 'a';
  setupChat(); setProgress(10); setSub('AVAC — Dimensionamento de condutas');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarModoA }]);
  estadoA = { fase: 0, modoCalc: null, caudal: null, tipoSecao: null, filtroRect: { alturaMax: null, larguraMax: null }, currentFilterForm: null };
  addBot('Seleccione o método de dimensionamento.');
  addPills([
    { label: 'Por perda de carga (mmca/m)', action: () => escolherModoA('ped') },
    { label: 'Por velocidade (m/s)', action: () => escolherModoA('vel') }
  ]);
}

function escolherModoA(m) {
  estadoA.modoCalc = m; setProgress(25);
  addBot('Que tipo de conduta pretende?');
  addPills([
    { label: 'Circular', action: () => escolherSecaoA('circ') },
    { label: 'Rectangular', action: () => escolherSecaoA('rect') },
    { label: 'Deixa-me escolher', action: () => escolherSecaoA('ambos') }
  ]);
}

function escolherSecaoA(tipo) {
  estadoA.tipoSecao = tipo;

  if (tipo === 'rect') {
    // Mostrar formulário de filtros rectangulares
    setProgress(30);
    addBot('Defina os limites para a conduta rectangular (opcional).');
    const row = document.createElement('div'); row.className = 'bot-row';
    const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
    const form = document.createElement('div'); form.className = 'input-form';
    form.innerHTML = `
      <div class="form-row">
        <div class="form-field">
          <label>Altura máxima (mm)</label>
          <input type="number" id="rect-alt-max" placeholder="ex: 300 (vazio = sem limite)" min="100" step="50"/>
        </div>
        <div class="form-field">
          <label>Largura máxima (mm)</label>
          <input type="number" id="rect-larg-max" placeholder="ex: 600 (vazio = sem limite)" min="100" step="50"/>
        </div>
      </div>
      <div style="font-size:11px;color:#5a7aaa;margin:4px 0 8px;">Estes limites aplicam-se a todos os cálculos desta sessão.</div>
      <div class="form-actions">
        <button class="continuar-btn" onclick="definirFiltrosRect()">Continuar →</button>
      </div>`;
    estadoA.currentFilterForm = form;
    row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
  } else {
    // Circular ou ambos → directo para caudal
    pedirCaudalA();
  }
}

function definirFiltrosRect() {
  const f = estadoA.currentFilterForm;
  const altVal = f.querySelector('#rect-alt-max').value;
  const largVal = f.querySelector('#rect-larg-max').value;
  estadoA.filtroRect.alturaMax = altVal ? parseInt(altVal) : null;
  estadoA.filtroRect.larguraMax = largVal ? parseInt(largVal) : null;

  // Feedback sobre filtros
  const filtros = [];
  if (estadoA.filtroRect.alturaMax) filtros.push(`altura ≤ ${estadoA.filtroRect.alturaMax} mm`);
  if (estadoA.filtroRect.larguraMax) filtros.push(`largura ≤ ${estadoA.filtroRect.larguraMax} mm`);
  if (filtros.length) {
    addUser('Filtros: ' + filtros.join(', '));
  } else {
    addUser('Sem limites dimensionais');
  }

  pedirCaudalA();
}

function pedirCaudalA() {
  estadoA.fase = 1; setProgress(45);
  addBot('Qual o <strong>caudal</strong> em m³/h?');
  enableInput('Caudal em m³/h...');
}

function enviarA(val) {
  const num = parseFloat(val.replace(',', '.')); disableInput();
  if (isNaN(num) || num <= 0) { addUser(val); addBot('Valor inválido. Indique um número positivo.'); enableInput(); return; }
  addUser(val);
  if (estadoA.fase === 1) {
    estadoA.caudal = num; estadoA.fase = 2; setProgress(65);
    if (estadoA.modoCalc === 'ped') { addBot('Qual a <strong>perda de carga</strong> em mmca/m?'); enableInput('PED em mmca/m...'); }
    else { addBot('Qual a <strong>velocidade</strong> em m/s?'); enableInput('Velocidade em m/s...'); }
  } else if (estadoA.fase === 2) {
    setProgress(100);
    const res = calcularA(estadoA.caudal, num, estadoA.modoCalc);
    projectLog.push({ tool: 'dim_condutas', input: { caudal: estadoA.caudal, param: num, modo: estadoA.modoCalc, tipoSecao: estadoA.tipoSecao, filtroRect: { ...estadoA.filtroRect } }, result: res, ts: new Date().toISOString() });
    saveProject();
    addResultA(res);
    estadoA.fase = 1; estadoA.caudal = null;
    setTimeout(() => {
      setProgress(20);
      addBot('Novo cálculo?');
      addPills([
        { label: 'Sim, mesma secção', action: () => pedirCaudalA() },
        { label: 'Mudar secção', action: () => {
          addBot('Que tipo de conduta pretende?');
          addPills([
            { label: 'Circular', action: () => escolherSecaoA('circ') },
            { label: 'Rectangular', action: () => escolherSecaoA('rect') },
            { label: 'Deixa-me escolher', action: () => escolherSecaoA('ambos') }
          ]);
        }},
        { label: 'Mudar método', action: iniciarModoA },
        { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
      ]);
    }, 400);
  }
}

function calcularA(Q_h, param, mc) {
  const Q = Q_h / 3600, lambda = 0.02; let D_calc_m;
  if (mc === 'ped') { const dPm_Pa = param * 9.81; D_calc_m = Math.pow((lambda * RHO * Q * Q * 8) / (Math.PI * Math.PI * dPm_Pa), 1 / 5); }
  else D_calc_m = Math.sqrt(4 * Q / (Math.PI * param));
  const D_calc_mm = D_calc_m * 1000;
  const D_norm = DN.reduce((p, c) => Math.abs(c - D_calc_mm) < Math.abs(p - D_calc_mm) ? c : p);
  const D_norm_m = D_norm / 1000, A = Math.PI * D_norm_m * D_norm_m / 4, v_real = Q / A;
  const dPm_Pa = lambda * RHO * v_real * v_real / (2 * D_norm_m), dPm_mmca = dPm_Pa / 9.81;
  return { D_norm, D_calc_mm, v_real, dPm_Pa, dPm_mmca, rects: calcRects(D_norm) };
}

function calcRects(D_norm) {
  const dims = [];
  const filtro = estadoA.filtroRect;
  for (let a = 100; a <= 1200; a += 50) {
    if (filtro.larguraMax && a > filtro.larguraMax) continue;
    for (let b = 100; b <= a; b += 50) {
      // b é sempre a dimensão menor (b <= a)
      // alturaMax limita a menor dimensão (altura da conduta)
      if (filtro.alturaMax && b > filtro.alturaMax) continue;
      const deq = deqHuebscher(a, b);
      dims.push({ a, b, deq, diff: Math.abs(deq - D_norm), ratio: a / b });
    }
  }
  dims.sort((x, y) => x.diff - y.diff);
  const out = [], seen = new Set();
  for (const d of dims) {
    const k = `${d.a}x${d.b}`;
    if (!seen.has(k) && out.length < 5) { seen.add(k); out.push(d); }
    if (out.length >= 5) break;
  }
  return out;
}

function addResultA(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const tipo = estadoA.tipoSecao;

  // Circular
  let htmlCirc = '';
  if (tipo === 'circ' || tipo === 'ambos') {
    htmlCirc = `
      <div class="rlabel">Conduta circular</div>
      <div class="metrics">
        <div class="mc"><div class="ml">Diâmetro norm.</div><div class="mv">Ø ${r.D_norm}</div><div class="mu">mm (calc: ${Math.round(r.D_calc_mm)} mm)</div></div>
        <div class="mc"><div class="ml">Velocidade real</div><div class="mv">${r.v_real.toFixed(2)}</div><div class="mu">m/s</div></div>
        <div class="mc"><div class="ml">Perda linear</div><div class="mv">${r.dPm_Pa.toFixed(2)}</div><div class="mu">Pa/m · ${r.dPm_mmca.toFixed(3)} mmca/m</div></div>
      </div>`;
  }

  // Rectangular
  let htmlRect = '';
  if (tipo === 'rect' || tipo === 'ambos') {
    const filtro = estadoA.filtroRect;
    const filtroTxt = [];
    if (filtro.alturaMax) filtroTxt.push(`alt ≤ ${filtro.alturaMax}`);
    if (filtro.larguraMax) filtroTxt.push(`larg ≤ ${filtro.larguraMax}`);
    const filtroLabel = filtroTxt.length ? ` (${filtroTxt.join(', ')} mm)` : '';

    if (r.rects.length > 0) {
      htmlRect += `<div class="rlabel">Condutas rectangulares${filtroLabel}</div>`;
      const Q_m3s = estadoA.caudal / 3600;
      htmlRect += r.rects.map(rc => {
        const areaR = (rc.a / 1000) * (rc.b / 1000);
        const vRect = Q_m3s / areaR;
        // Badge: considerar rácio E velocidade
        let badgeClass, badgeLabel;
        if (rc.ratio <= 4 && vRect <= 6) { badgeClass = 'bok'; badgeLabel = 'recomendado'; }
        else if (rc.ratio <= 8 && vRect <= 8) { badgeClass = 'bwarn'; badgeLabel = 'aceitável'; }
        else { badgeClass = 'bbad'; badgeLabel = 'evitar'; }
        const velInfo = ` · v=${vRect.toFixed(2)} m/s`;
        return `<div class="rect-row"><div class="rdims">${rc.a} × ${rc.b} mm</div><div class="rratio">rácio ${rc.ratio.toFixed(1)}:1 · Deq ${Math.round(rc.deq)} mm${velInfo}</div><span class="badge ${badgeClass}">${badgeLabel}</span></div>`;
      }).join('');
    } else {
      htmlRect += `<div class="rlabel" style="color:#f59e0b;">Sem condutas rectangulares dentro dos limites definidos</div>`;
    }
  }

  bubble.innerHTML = htmlCirc + htmlRect;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

// ═══ MODO B — PED Instalação ═══
function iniciarModoB() {
  modo = 'b';
  setupChat(); setProgress(5); setSub('AVAC — PED da instalação');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarModoB }]);
  dadosB = { trocos: [], sing90: [], sing45: [], singT: [], fixas: [] };
  addBot('Cálculo da <strong>PED total da instalação</strong>.<br>Condutas circulares e rectangulares.');
  setTimeout(() => passoTrocos(), 400);
}

function buildSecaoFields(prefix) {
  return `
    <div class="tipo-toggle">
      <button class="tipo-btn active" id="${prefix}-btn-circ" onclick="setTipo('${prefix}','circ')">Circular</button>
      <button class="tipo-btn" id="${prefix}-btn-rect" onclick="setTipo('${prefix}','rect')">Rectangular</button>
    </div>
    <div id="${prefix}-circ" style="display:flex;gap:8px;flex-wrap:wrap">
      <div class="form-field" style="min-width:100px"><label>Diâmetro</label><select id="${prefix}-dn">${DN.map(d => `<option value="${d}">Ø ${d}</option>`).join('')}</select></div>
    </div>
    <div id="${prefix}-rect" style="display:none;gap:8px;flex-wrap:wrap">
      <div class="form-field" style="min-width:80px"><label>Largura a (mm)</label><select id="${prefix}-a">${RECT_DIMS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
      <div class="form-field" style="min-width:80px"><label>Altura b (mm)</label><select id="${prefix}-b">${RECT_DIMS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
    </div>`;
}

function setTipo(prefix, tipo) {
  document.getElementById(`${prefix}-btn-circ`).className = 'tipo-btn' + (tipo === 'circ' ? ' active' : '');
  document.getElementById(`${prefix}-btn-rect`).className = 'tipo-btn' + (tipo === 'rect' ? ' active' : '');
  document.getElementById(`${prefix}-circ`).style.display = tipo === 'circ' ? 'flex' : 'none';
  document.getElementById(`${prefix}-rect`).style.display = tipo === 'rect' ? 'flex' : 'none';
}
function getTipo(prefix) { return document.getElementById(`${prefix}-btn-circ`).classList.contains('active') ? 'circ' : 'rect'; }
function getSecao(prefix) {
  const tipo = getTipo(prefix);
  if (tipo === 'circ') return { tipo, dn: parseInt(document.getElementById(`${prefix}-dn`).value) };
  return { tipo, a: parseInt(document.getElementById(`${prefix}-a`).value), b: parseInt(document.getElementById(`${prefix}-b`).value) };
}

function passoTrocos() {
  setProgress(15); addBot('Passo 1 de 5 — <strong>Troços de conduta recta</strong>');
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `${buildSecaoFields('t')}
    <div class="form-row" style="margin-top:8px">
      <div class="form-field"><label>Comprimento (m)</label><input type="number" id="t-comp" placeholder="ex: 10" min="0.1" step="0.1"/></div>
      <div class="form-field"><label>PED (mmca/m)</label><input type="number" id="t-ped" placeholder="ex: 0.10" step="0.01"/></div>
      <button class="add-btn" onclick="addTroco()">+ Adicionar</button>
    </div>
    <div class="items-list" id="t-list"></div>
    <div class="form-actions"><button class="continuar-btn" onclick="passoCurvas90()">Continuar →</button></div>`;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function addTroco() {
  const secao = getSecao('t');
  const comp = parseFloat(document.getElementById('t-comp').value);
  const ped = parseFloat(document.getElementById('t-ped').value);
  if (!comp || !ped || comp <= 0 || ped <= 0) { alert('Preencha comprimento e PED.'); return; }
  dadosB.trocos.push({ ...secao, comp, ped });
  renderListB('t-list', dadosB.trocos, i => { const t = dadosB.trocos[i]; return `${labelSecao(t)} — ${t.comp}m — ${t.ped} mmca/m`; });
  document.getElementById('t-comp').value = ''; document.getElementById('t-ped').value = '';
}

function buildSingForm(prefix, addFn, skipFn, nextFn) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `${buildSecaoFields(prefix)}
    <div class="form-row" style="margin-top:8px">
      <div class="form-field"><label>Caudal (m³/h)</label><input type="number" id="${prefix}-q" placeholder="ex: 500"/></div>
      <div class="form-field" style="max-width:70px"><label>Qtd.</label><input type="number" id="${prefix}-qty" value="1" min="1"/></div>
      <button class="add-btn" onclick="${addFn}()">+ Adicionar</button>
    </div>
    <div class="items-list" id="${prefix}-list"></div>
    <div class="form-actions">
      <button class="skip-btn" onclick="addUser('Nenhuma');${skipFn}()">Nenhuma</button>
      <button class="continuar-btn" onclick="${nextFn}()">Continuar →</button>
    </div>`;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function addSing(arr, prefix, label) {
  const secao = getSecao(prefix);
  const q = parseFloat(document.getElementById(`${prefix}-q`).value);
  const qty = parseInt(document.getElementById(`${prefix}-qty`).value) || 1;
  if (!q || q <= 0) { alert('Preencha o caudal.'); return; }
  arr.push({ ...secao, caudal: q, qty });
  renderListB(`${prefix}-list`, arr, i => `${labelSecao(arr[i])} — ${arr[i].caudal} m³/h — ${arr[i].qty}× ${label}`);
  document.getElementById(`${prefix}-q`).value = ''; document.getElementById(`${prefix}-qty`).value = '1';
}

function passoCurvas90() {
  if (dadosB.trocos.length === 0) { alert('Adicione pelo menos um troço.'); return; }
  addUser('Continuar →'); setProgress(30);
  addBot('Passo 2 de 5 — <strong>Curvas de 90°</strong>');
  buildSingForm('c90', 'addC90', 'skipC90', 'passoCurvas45');
}
function addC90() { addSing(dadosB.sing90, 'c90', 'Curva 90°'); }
function skipC90() { passoCurvas45(); }

function passoCurvas45() {
  addUser('Continuar →'); setProgress(45);
  addBot('Passo 3 de 5 — <strong>Curvas de 45°</strong>');
  buildSingForm('c45', 'addC45', 'skipC45', 'passoDerivacoes');
}
function addC45() { addSing(dadosB.sing45, 'c45', 'Curva 45°'); }
function skipC45() { passoDerivacoes(); }

function passoDerivacoes() {
  addUser('Continuar →'); setProgress(60);
  addBot('Passo 4 de 5 — <strong>Derivações em T</strong>');
  buildSingForm('dt', 'addDT', 'skipDT', 'passoFixas');
}
function addDT() { addSing(dadosB.singT, 'dt', 'Derivação T'); }
function skipDT() { passoFixas(); }

function passoFixas() {
  addUser('Continuar →'); setProgress(75);
  addBot('Passo 5 de 5 — <strong>Perdas fixas</strong><br>Grelhas, registos, filtros.');
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `
    <div class="form-row">
      <div class="form-field" style="flex:2"><label>Descrição</label><input type="text" id="fx-desc" placeholder="ex: Grelha de insuflação"/></div>
      <div class="form-field"><label>Perda (Pa)</label><input type="number" id="fx-pa" placeholder="ex: 20"/></div>
      <button class="add-btn" onclick="addFixa()">+ Adicionar</button>
    </div>
    <div class="items-list" id="fx-list"></div>
    <div class="form-actions">
      <button class="skip-btn" onclick="addUser('Nenhuma');calcularTotal()">Nenhuma</button>
      <button class="continuar-btn" onclick="calcularTotal()">Calcular PED total →</button>
    </div>`;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function addFixa() {
  const desc = document.getElementById('fx-desc').value.trim();
  const pa = parseFloat(document.getElementById('fx-pa').value);
  if (!desc || isNaN(pa) || pa < 0) { alert('Preencha descrição e Pa.'); return; }
  dadosB.fixas.push({ desc, pa });
  renderListB('fx-list', dadosB.fixas, i => `${dadosB.fixas[i].desc} — ${dadosB.fixas[i].pa} Pa`);
  document.getElementById('fx-desc').value = ''; document.getElementById('fx-pa').value = '';
}

function renderListB(id, arr, labelFn) {
  const list = document.getElementById(id); if (!list) return; list.innerHTML = '';
  arr.forEach((_, i) => { const d = document.createElement('div'); d.className = 'item-tag'; d.innerHTML = `<span>${labelFn(i)}</span><button class="del-btn" onclick="delItemB('${id}',${i})">✕</button>`; list.appendChild(d); }); scroll();
}

function delItemB(lid, idx) {
  if (lid === 't-list') { dadosB.trocos.splice(idx, 1); renderListB('t-list', dadosB.trocos, i => { const t = dadosB.trocos[i]; return `${labelSecao(t)} — ${t.comp}m — ${t.ped} mmca/m`; }); }
  else if (lid === 'c90-list') { dadosB.sing90.splice(idx, 1); renderListB('c90-list', dadosB.sing90, i => `${labelSecao(dadosB.sing90[i])} — ${dadosB.sing90[i].caudal} m³/h — ${dadosB.sing90[i].qty}× Curva 90°`); }
  else if (lid === 'c45-list') { dadosB.sing45.splice(idx, 1); renderListB('c45-list', dadosB.sing45, i => `${labelSecao(dadosB.sing45[i])} — ${dadosB.sing45[i].caudal} m³/h — ${dadosB.sing45[i].qty}× Curva 45°`); }
  else if (lid === 'dt-list') { dadosB.singT.splice(idx, 1); renderListB('dt-list', dadosB.singT, i => `${labelSecao(dadosB.singT[i])} — ${dadosB.singT[i].caudal} m³/h — ${dadosB.singT[i].qty}× Derivação T`); }
  else if (lid === 'fx-list') { dadosB.fixas.splice(idx, 1); renderListB('fx-list', dadosB.fixas, i => `${dadosB.fixas[i].desc} — ${dadosB.fixas[i].pa} Pa`); }
}

function calcSingPerda(item, zeta) {
  const area = item.tipo === 'circ' ? areaCirc(item.dn) : areaRect(item.a, item.b);
  const v = velocidade(item.caudal, area);
  return { pa: zeta * 0.5 * RHO * v * v * item.qty, v };
}

function calcularTotal() {
  addUser('Calcular PED total →'); setProgress(100);
  const linhas = []; let totalPa = 0;
  dadosB.trocos.forEach(t => { const pa = t.ped * 9.81 * t.comp; linhas.push({ desc: `${labelSecao(t)} — ${t.comp}m @ ${t.ped} mmca/m`, pa }); totalPa += pa; });
  const addSingLinhas = (arr, zeta, label) => arr.forEach(c => {
    const { pa, v } = calcSingPerda(c, zeta);
    linhas.push({ desc: `${c.qty}× ${label} ${labelSecao(c)} (v=${v.toFixed(2)} m/s)`, pa }); totalPa += pa;
  });
  addSingLinhas(dadosB.sing90, 0.4, 'Curva 90°');
  addSingLinhas(dadosB.sing45, 0.17, 'Curva 45°');
  addSingLinhas(dadosB.singT, 0.9, 'Derivação T');
  dadosB.fixas.forEach(f => { linhas.push({ desc: f.desc, pa: f.pa }); totalPa += f.pa; });
  const totalMmca = totalPa / 9.81;

  projectLog.push({ tool: 'ped_instalacao', input: JSON.parse(JSON.stringify(dadosB)), result: { linhas, totalPa, totalMmca }, ts: new Date().toISOString() });
  saveProject();

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  bubble.innerHTML = `
    <div class="rlabel">Discriminação de perdas</div>
    <table class="res-table">
      <thead><tr><th>Elemento</th><th style="text-align:right">Pa</th><th style="text-align:right">mmca</th></tr></thead>
      <tbody>${linhas.map(l => `<tr><td>${l.desc}</td><td style="text-align:right">${l.pa.toFixed(1)}</td><td style="text-align:right">${(l.pa / 9.81).toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="rlabel" style="margin-top:12px">PED total da instalação</div>
    <div class="total-row">
      <div class="total-card"><div class="total-label">Pascal</div><div class="total-value">${totalPa.toFixed(1)}</div><div class="total-unit">Pa</div></div>
      <div class="total-card"><div class="total-label">Milímetros de coluna de água</div><div class="total-value">${totalMmca.toFixed(2)}</div><div class="total-unit">mmca</div></div>
    </div>`;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
  setTimeout(() => {
    setProgress(10); addBot('Novo cálculo?');
    addPills([
      { label: 'Novo cálculo PED', action: iniciarModoB },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) },
      { label: '← Áreas', action: showAreaMenu }
    ]);
  }, 500);
}
