// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo AVAC: Hottes / cozinhas profissionais
// hottes.js — Caudal de exaustão e ar de compensação
// NP 1037-4:2001 (scan João Carriço, resumo 2026-08-07)
// Métodos do §7 (o projectista escolhe):
//   1 Refeições simultâneas (Quadro 1)
//   2 Superfície de cocção (300 l/s·m² → 1080·Sa)
//   3 Taxa de renovação (Quadro 2, por pé-direito)
//   4 Universal por aparelho (Quadro 3, p.16)
//   5 Velocidade de captação (Qe = V·3600·P·Δh)
// Compensação: 85 % da extracção (depressão 5.1.4 d);
// ≤20 vol/h → insuflação mecânica dispensável (6.1.3).
// ═══════════════════════════════════════════════════

// ─── Quadro 3 — caudal por aparelho ───
// q em m³/h; porM2=true → m³/h por m² do aparelho
const HOT_APARELHOS = [
  { id: 'cozedor100', nome: 'Cozedor de vapor 100 l', q: 600 },
  { id: 'cozedor200', nome: 'Cozedor de vapor 200 l', q: 1000 },
  { id: 'cozedor300', nome: 'Cozedor de vapor 300 l', q: 1200 },
  { id: 'fornofogao', nome: 'Forno (de fogão)', q: 300 },
  { id: 'fornoconv', nome: 'Forno de convecção', q: 1000 },
  { id: 'fornoindgas', nome: 'Forno independente — gás', q: 1500, porM2: true },
  { id: 'fornoindele', nome: 'Forno independente — eléctrico', q: 1000, porM2: true },
  { id: 'frigigas', nome: 'Frigideira — gás', q: 1500 },
  { id: 'frigiele', nome: 'Frigideira — eléctrica', q: 1000 },
  { id: 'frit300', nome: 'Fritadeira < 300 pratos/h (10 l óleo)', q: 1000 },
  { id: 'fritmais', nome: 'Fritadeira > 300 pratos/h (50 l óleo)', q: 2500 },
  { id: 'grelharot', nome: 'Grelhador rotativo', q: 1000 },
  { id: 'grelhagas', nome: 'Grelhador por contacto — gás', q: 3000, porM2: true },
  { id: 'grelhaele', nome: 'Grelhador por contacto — eléctrico', q: 2000, porM2: true },
  { id: 'cafe', nome: 'Máquina de café', q: 450 },
  { id: 'loica400', nome: 'Máq. lavar loiça < 400 peças/h', q: 1300 },
  { id: 'loicamais', nome: 'Máq. lavar loiça > 400 peças/h', q: 2200 },
  { id: 'marmita75', nome: 'Marmita 75 l', q: 500 },
  { id: 'marmita100', nome: 'Marmita 100 l', q: 600 },
  { id: 'marmita150', nome: 'Marmita 150 l', q: 800 },
  { id: 'marmita200', nome: 'Marmita 200 l', q: 1000 },
  { id: 'marmita250', nome: 'Marmita 250 l', q: 1100 },
  { id: 'marmita300', nome: 'Marmita 300 l', q: 1200 },
  { id: 'marmita500', nome: 'Marmita 500 l', q: 1500 },
  { id: 'placasgas', nome: 'Placas ardentes — gás', q: 450, porM2: true },
  { id: 'placasele', nome: 'Placas ardentes — eléctricas', q: 300, porM2: true },
  { id: 'queimador', nome: 'Queimador descoberto', q: 500 }, // norma: 200-500 → conservador
];

// ─── Regras da casa ───
const HOT_COMP_PCT = 0.85;    // compensação = 85 % da extracção (depressão)
const HOT_VOLH_DISPENSA = 20; // ≤20 vol/h → insuflação mecânica dispensável (6.1.3)

// ─── State ───
let estadoHot = { fase: 0, metodo: null, qext: null, area: null, pd: null,
  refeicoes: null, sa: null, taxa: null, perimetro: null, dh: null, vel: null,
  aparelhos: [], formEl: null };

// ─── Registo ───
registerTool('avac', {
  id: 'hottes',
  icon: '🍳',
  name: 'Hottes — exaustão e compensação',
  desc: 'Cozinhas profissionais — NP 1037-4 (5 métodos)',
  launch: iniciarHot
});

inputHandlers['hot'] = function(val) { enviarHot(val); };

// ═══ Fluxo ═══
function iniciarHot() {
  modo = 'hot';
  setupChat(); setProgress(10); setSub('AVAC — Hottes (NP 1037-4)');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarHot }]);
  estadoHot = { fase: 0, metodo: null, qext: null, area: null, pd: null, refeicoes: null, sa: null, taxa: null, perimetro: null, dh: null, vel: null, aparelhos: [], formEl: null };
  addBot('Qual o <strong>método de cálculo</strong>? (a NP 1037-4 deixa o projectista escolher — §7)');
  addPills([
    { label: 'Refeições simultâneas (Quadro 1)', action: () => hotMetodo('refeicoes') },
    { label: 'Superfície de cocção', action: () => hotMetodo('coccao') },
    { label: 'Taxa de renovação (Quadro 2)', action: () => hotMetodo('renovacao') },
    { label: 'Por aparelho (Quadro 3)', action: () => hotMetodo('aparelhos') },
    { label: 'Velocidade de captação (geometria da hote)', action: () => hotMetodo('captacao') }
  ]);
}

function hotMetodo(m) {
  estadoHot.metodo = m;
  setProgress(30);
  switch (m) {
    case 'refeicoes':
      estadoHot.fase = 1;
      addBot('Quantas <strong>refeições simultâneas</strong>?');
      enableInput('Nº de refeições...');
      break;
    case 'coccao':
      estadoHot.fase = 2;
      addBot('Qual a <strong>superfície de cocção</strong> (Sa) em m²? <span style="font-size:11px;color:#5a7aaa;">(soma dos planos de cocção dos aparelhos)</span>');
      enableInput('Sa em m²...');
      break;
    case 'renovacao':
      estadoHot.fase = 3;
      addBot('Qual a <strong>área da cozinha</strong> em m²?');
      enableInput('Área em m²...');
      break;
    case 'captacao':
      estadoHot.fase = 6;
      addBot('Qual o <strong>perímetro aberto</strong> da hote em metros? <span style="font-size:11px;color:#5a7aaa;">(lados por onde o ar entra — hote encostada à parede não conta esse lado)</span>');
      enableInput('Perímetro em m...');
      break;
    case 'aparelhos':
      hotFormAparelhos();
      break;
  }
}

// ─── Formulário do método por aparelho (Quadro 3) ───
function hotFormAparelhos() {
  addBot('Adicione os <strong>aparelhos</strong> da cozinha (Quadro 3). Aparelhos a gás puxam mais que os eléctricos.');
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `
    <div class="form-row">
      <div class="form-field" style="min-width:260px"><label>Aparelho</label>
        <select id="hot-ap" onchange="hotToggleM2()">${HOT_APARELHOS.map(a => `<option value="${a.id}">${a.nome} — ${a.q} m³/h${a.porM2 ? '·m²' : ''}</option>`).join('')}</select>
      </div>
      <div class="form-field" style="min-width:70px"><label>Qtd</label><input type="number" id="hot-qtd" value="1" min="1" step="1"/></div>
      <div class="form-field" style="min-width:90px;display:none" id="hot-m2-field"><label>m² (cada)</label><input type="number" id="hot-m2" placeholder="ex: 0,5" step="0.1" min="0.1"/></div>
    </div>
    <div id="hot-lista" style="font-size:12px;color:#5a7aaa;margin:6px 0;">Nenhum aparelho adicionado.</div>
    <div class="form-actions">
      <button class="continuar-btn" onclick="hotAddAparelho()">+ Adicionar</button>
      <button class="continuar-btn" onclick="hotConcluirAparelhos()">Concluir →</button>
    </div>`;
  estadoHot.formEl = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function hotToggleM2() {
  const f = estadoHot.formEl;
  const ap = HOT_APARELHOS.find(a => a.id === f.querySelector('#hot-ap').value);
  f.querySelector('#hot-m2-field').style.display = ap && ap.porM2 ? '' : 'none';
}

function hotAddAparelho() {
  const f = estadoHot.formEl;
  const ap = HOT_APARELHOS.find(a => a.id === f.querySelector('#hot-ap').value);
  const qtd = parseInt(f.querySelector('#hot-qtd').value) || 1;
  let m2 = null;
  if (ap.porM2) {
    m2 = parseFloat((f.querySelector('#hot-m2').value || '').replace(',', '.'));
    if (isNaN(m2) || m2 <= 0) { f.querySelector('#hot-lista').innerHTML = '<span style="color:#ef4444;">Este aparelho é por m² — indique a área de cada um.</span>'; return; }
  }
  const q = ap.porM2 ? ap.q * m2 * qtd : ap.q * qtd;
  estadoHot.aparelhos.push({ nome: ap.nome, qtd, m2, q });
  hotRefreshLista();
}

function hotRefreshLista() {
  const f = estadoHot.formEl;
  if (!estadoHot.aparelhos.length) { f.querySelector('#hot-lista').textContent = 'Nenhum aparelho adicionado.'; return; }
  const total = estadoHot.aparelhos.reduce((s, a) => s + a.q, 0);
  f.querySelector('#hot-lista').innerHTML =
    estadoHot.aparelhos.map((a, i) => `${a.qtd}× ${a.nome}${a.m2 ? ` (${a.m2} m²)` : ''} = ${Math.round(a.q)} m³/h <a href="#" onclick="hotRemAparelho(${i});return false;" style="color:#ef4444;">✕</a>`).join('<br>') +
    `<br><strong>Total: ${Math.round(total)} m³/h</strong>`;
}

function hotRemAparelho(i) { estadoHot.aparelhos.splice(i, 1); hotRefreshLista(); }

function hotConcluirAparelhos() {
  if (!estadoHot.aparelhos.length) { estadoHot.formEl.querySelector('#hot-lista').innerHTML = '<span style="color:#ef4444;">Adicione pelo menos um aparelho.</span>'; return; }
  estadoHot.qext = estadoHot.aparelhos.reduce((s, a) => s + a.q, 0);
  addUser(estadoHot.aparelhos.map(a => `${a.qtd}× ${a.nome}`).join(', '));
  hotPedirCozinha();
}

// ─── Inputs numéricos ───
function enviarHot(val) {
  const num = parseFloat(val.replace(',', '.')); disableInput();
  if (isNaN(num) || num <= 0) { addUser(val); addBot('Valor inválido. Indique um número positivo.'); enableInput(); return; }
  addUser(val);

  switch (estadoHot.fase) {
    case 1: { // refeições (Quadro 1)
      estadoHot.refeicoes = Math.round(num);
      const n = estadoHot.refeicoes;
      let q, regra;
      if (n < 150) { q = 25 * n; regra = '25 m³/h por refeição'; }
      else if (n <= 500) { q = Math.max(20 * n, 3750); regra = '20 m³/h·ref (mín 3750)'; }
      else if (n <= 1500) { q = Math.max(15 * n, 10000); regra = '15 m³/h·ref (mín 10000)'; }
      else { q = Math.max(10 * n, 22500); regra = '10 m³/h·ref (mín 22500)'; }
      estadoHot.qext = q;
      addBot(`Quadro 1: ${regra} → <strong>${Math.round(q)} m³/h</strong>`);
      hotPedirCozinha();
      break;
    }
    case 2: // superfície de cocção
      estadoHot.sa = num;
      estadoHot.qext = 1080 * num;
      addBot(`300 l/s·m² → <strong>${Math.round(estadoHot.qext)} m³/h</strong> (1080 × ${num} m²)`);
      hotPedirCozinha();
      break;
    case 3: // renovação: área
      estadoHot.area = num;
      estadoHot.fase = 4;
      addBot('Qual o <strong>pé-direito</strong> em metros?');
      enableInput('Pé-direito em m...');
      break;
    case 4: { // renovação: pé-direito → taxa
      estadoHot.pd = num;
      estadoHot.fase = 5; setProgress(50);
      let gama;
      if (num <= 4) gama = '20–30';
      else if (num <= 6) gama = '15–20';
      else gama = '10–15 (grande dimensão)';
      addBot(`Qual a <strong>taxa de renovação</strong> em vol/h? <span style="font-size:11px;color:#5a7aaa;">(Quadro 2 para pé-direito ${num} m: ${gama} vol/h)</span>`);
      enableInput(`Taxa em vol/h — Quadro 2: ${gama}...`);
      break;
    }
    case 5: // renovação: taxa → caudal
      estadoHot.taxa = num;
      estadoHot.qext = estadoHot.area * estadoHot.pd * num;
      addBot(`${estadoHot.area} × ${estadoHot.pd} × ${num} vol/h → <strong>${Math.round(estadoHot.qext)} m³/h</strong>`);
      hotCalcularFinal();
      break;
    case 6: // captação: perímetro
      estadoHot.perimetro = num;
      estadoHot.fase = 7;
      addBot('Qual a <strong>distância Δh</strong> do plano de cocção ao bordo da hote, em metros? <span style="font-size:11px;color:#5a7aaa;">(corrente: 1,0–1,2 m — hote a ≥1,85 m do pavimento)</span>');
      enableInput('Δh em m — ex: 1,1...');
      break;
    case 7: // captação: Δh
      estadoHot.dh = num;
      estadoHot.fase = 8;
      addBot('Qual a <strong>velocidade de captação</strong> em m/s? <span style="font-size:11px;color:#5a7aaa;">(NP: 0,20–0,50 — corrente 0,25–0,30; mais alto p/ fritura e grelhados)</span>');
      enableInput('V em m/s — ex: 0,3...');
      break;
    case 8: // captação: V → caudal
      if (num > 0.5) { addBot('A NP 1037-4 limita a velocidade de captação a 0,50 m/s. Indique um valor até 0,5.'); enableInput(); return; }
      estadoHot.vel = num;
      estadoHot.qext = num * 3600 * estadoHot.perimetro * estadoHot.dh;
      addBot(`Qe = ${num} × 3600 × ${estadoHot.perimetro} × ${estadoHot.dh} → <strong>${Math.round(estadoHot.qext)} m³/h</strong>`);
      hotPedirCozinha();
      break;
    case 9: // área da cozinha (p/ verificação vol/h)
      estadoHot.area = num;
      estadoHot.fase = 10;
      addBot('Qual o <strong>pé-direito</strong> em metros?');
      enableInput('Pé-direito em m...');
      break;
    case 10: // pé-direito → resultado
      estadoHot.pd = num;
      hotCalcularFinal();
      break;
  }
}

function hotPedirCozinha() {
  estadoHot.fase = 9; setProgress(70);
  addBot('Qual a <strong>área da cozinha</strong> em m²? <span style="font-size:11px;color:#5a7aaa;">(para verificar a regra dos 20 vol/h da compensação)</span>');
  enableInput('Área em m²...');
}

// ═══ Resultado ═══
function hotCalcularFinal() {
  setProgress(100);
  const comp = estadoHot.qext * HOT_COMP_PCT;
  const vol = estadoHot.area * estadoHot.pd;
  const volH = comp / vol;
  const res = { qext: estadoHot.qext, comp, vol, volH, dispensaInsuflacao: volH <= HOT_VOLH_DISPENSA };
  projectLog.push({
    tool: 'hottes',
    input: { metodo: estadoHot.metodo, area: estadoHot.area, pd: estadoHot.pd, refeicoes: estadoHot.refeicoes, sa: estadoHot.sa, taxa: estadoHot.taxa, perimetro: estadoHot.perimetro, dh: estadoHot.dh, vel: estadoHot.vel, aparelhos: estadoHot.aparelhos },
    result: res, ts: new Date().toISOString()
  });
  saveProject();
  addResultHot(res);
  hotNavFinal();
}

function addResultHot(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const METODOS = { refeicoes: 'Refeições simultâneas (Quadro 1)', coccao: 'Superfície de cocção', renovacao: 'Taxa de renovação (Quadro 2)', aparelhos: 'Por aparelho (Quadro 3)', captacao: 'Velocidade de captação' };

  let html = `
    <div class="rlabel">${METODOS[estadoHot.metodo]} · cozinha ${estadoHot.area} m² × ${estadoHot.pd} m</div>
    <div class="metrics">
      <div class="mc"><div class="ml">Exaustão</div><div class="mv">${Math.round(r.qext)}</div><div class="mu">m³/h</div></div>
      <div class="mc"><div class="ml">Compensação</div><div class="mv">${Math.round(r.comp)}</div><div class="mu">m³/h (${HOT_COMP_PCT * 100} % — depressão 5.1.4 d)</div></div>
      <div class="mc"><div class="ml">Renovação da compensação</div><div class="mv">${r.volH.toFixed(1)}</div><div class="mu">vol/h</div></div>
    </div>`;

  if (r.dispensaInsuflacao) {
    html += `<div class="rlabel" style="color:#22c55e;">✓ Compensação ≤ 20 vol/h — insuflação mecânica dispensável: admissão directa por aberturas (6.1.3).</div>`;
  } else {
    html += `<div class="rlabel" style="color:#f59e0b;">Compensação > 20 vol/h → insuflação mecânica obrigatória, com ar novo FILTRADO. Se os aparelhos não trabalham todos em simultâneo: ventilador de insuflação com ≥2 velocidades (6.1.1 — Dahlander ou variador).</div>`;
  }

  html += `<div style="font-size:10px;color:#5a7aaa;margin-top:6px;">NP 1037-4:2001 · extracção sempre > insuflação (5.1.4 d) · GÁS ENCRAVADO com a ventilação por válvula NF (5.1.4 f — sem ventilação, sem gás) · filtros de gordura metálicos anti-fogo na extracção · ventilador de extracção resistente à temperatura (6.4 c) · GPL proibido em caves (5.1.1 b) · sem recirculação (5.2.4).</div>`;

  bubble.innerHTML = html;
  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function hotNavFinal() {
  setTimeout(() => {
    setProgress(30);
    addBot('Novo cálculo?');
    const pills = [
      { label: 'Sim, outro método', action: iniciarHot },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
    ];
    if (currentProject) {
      if (projectLog.some(l => l.incluirRelatorio)) {
        pills.unshift({ label: '📊 Exportar Excel', action: exportarExcel });
      }
      pills.unshift({ label: '📄 Juntar ao relatório', action: () => { juntarAoRelatorio(); } });
    }
    addPills(pills);
  }, 400);
}
