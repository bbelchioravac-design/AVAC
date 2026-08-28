// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Comportamento Térmico
// fotovoltaico.js — Eren de sistema solar fotovoltaico em
// habitação (NT-SCE-01 v02, DGEG/ADENE, 16-09-2022)
//
// O que a NT manda (e esta ferramenta faz):
//  1. Os consumos ELÉCTRICOS anuais dos usos regulados
//     (aquecimento, arrefecimento, AQS, ventilação) são
//     distribuídos pelos meses em que existem:
//       aquecimento → estação de aquecimento (M meses, Figura 2)
//       arrefecimento → Jun, Jul, Ago, Set
//       AQS e ventilação → todo o ano
//     C_m,uso = C_a,uso / N_uso                        (Eq. 1)
//  2. Os meses agrupam-se em SIMULAÇÕES — uma por cada
//     combinação distinta de usos activos. No caso geral
//     (todos os usos, M<8) dá 3: aquecimento / arrefecimento /
//     restantes. Se faltar um uso, a ferramenta funde o que
//     ficou igual (a NT diz "onde se verifiquem consumos").
//     C_a,sim = Σ meses Σ usos C_m,uso                 (Eq. 2)
//     C_d,sim = C_a,sim × 1000 / N_dias,sim            (Eq. 3)
//     P_sim   = C_d,sim / 24  [W]                      (Eq. 4)
//     → P_sim é o valor a meter no SCE.ER (perfil "autoconsumo",
//       mesma potência seg-sex e fim-de-semana, 24 h, meses
//       "on" só os da simulação; o programa só aceita inteiros).
//  3. Corre-se o SCE.ER uma vez por simulação e lê-se o campo
//     "autoconsumo (AC)" = Eren,sim. Eren = Σ Eren,sim  (Eq. 5)
//  4. Desagregação por uso, simulação a simulação:
//     Eren,uso_j,i = Eren,sim_i × C_a,sim(j,i) / C_a,sim_i (Eq. 6)
//     Eren,uso_j   = Σ_i Eren,uso_j,i                   (Eq. 7)
//
// Validado contra o exemplo prático da NT (São Brás de
// Alportel, M=5): P = 511 / 289 / 104 W; desagregação
// 383,84 / 223,42 / 288,49 / 37,25 kWh/ano.
// ═══════════════════════════════════════════════════

const PV_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PV_DIAS  = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // Tabela 4 da NT (ano de 365 dias)
const PV_ARREF = [5, 6, 7, 8];                                          // Jun–Set
// Figura 2 da NT — meses da estação de aquecimento por M (arredondado à unidade)
const PV_AQUEC_POR_M = {
  2: [0, 11],
  3: [0, 1, 11],
  4: [0, 1, 10, 11],
  5: [0, 1, 2, 10, 11],
  6: [0, 1, 2, 9, 10, 11],
  7: [0, 1, 2, 3, 9, 10, 11],
  8: [0, 1, 2, 3, 4, 9, 10, 11],
};
const PV_USOS = [
  { id: 'aquec', nome: 'Aquecimento' },
  { id: 'arref', nome: 'Arrefecimento' },
  { id: 'aqs',   nome: 'AQS' },
  { id: 'vent',  nome: 'Ventilação' },
];

// ─── State ───
let estadoPV = { input: null, sims: null, avisos: [], logIdx: null };

// ─── Registo ───
if (typeof registerTool === 'function') {
  registerTool('termica', {
    id: 'pv_nt_sce01',
    icon: '☀️',
    name: 'Fotovoltaico — Eren (NT-SCE-01)',
    desc: 'Perfis de consumo para o SCE.ER e desagregação da produção por uso regulado',
    launch: iniciarPV
  });
}

// ═══ Cálculo puro (sem DOM — testável) ═══

// Devolve { M, mesesAquec, sims[], avisos[] }
function pvCalcularSims(input) {
  const avisos = [];
  const consumos = {
    aquec: +input.aquec || 0, arref: +input.arref || 0,
    aqs: +input.aqs || 0, vent: +input.vent || 0,
  };

  // M: arredondado à unidade (NT: "arredondada à unidade") e limitado à Figura 2
  let M = Math.round(+input.M);
  if (isNaN(M)) M = 0;
  if (consumos.aquec > 0) {
    if (M < 2) { avisos.push(`M = ${input.M} arredonda para ${M}; a Figura 2 da NT começa em M ≈ 2 — usei 2 (Jan e Dez).`); M = 2; }
    if (M > 8) { avisos.push(`M = ${input.M} arredonda para ${M}; a Figura 2 da NT termina em M ≈ 8 — usei 8 (Out–Mai). Confirmar com a ADENE.`); M = 8; }
  }
  const mesesAquec = consumos.aquec > 0 ? PV_AQUEC_POR_M[M] : [];

  // Meses em que cada uso tem consumo
  const mesesUso = {
    aquec: mesesAquec,
    arref: consumos.arref > 0 ? PV_ARREF : [],
    aqs:   consumos.aqs   > 0 ? PV_MESES.map((_, i) => i) : [],
    vent:  consumos.vent  > 0 ? PV_MESES.map((_, i) => i) : [],
  };
  // Eq. 1 — consumo mensal por uso
  const Cm = {};
  PV_USOS.forEach(u => { Cm[u.id] = mesesUso[u.id].length ? consumos[u.id] / mesesUso[u.id].length : 0; });

  // Assinatura de cada mês = conjunto de usos activos → agrupa em simulações
  const grupos = {};
  for (let m = 0; m < 12; m++) {
    const activos = PV_USOS.filter(u => mesesUso[u.id].includes(m)).map(u => u.id);
    if (!activos.length) continue;                          // mês sem consumo: não se simula
    const chave = activos.join('+');
    if (!grupos[chave]) grupos[chave] = { usos: activos, meses: [] };
    grupos[chave].meses.push(m);
  }
  const semConsumo = [];
  for (let m = 0; m < 12; m++) if (!Object.values(grupos).some(g => g.meses.includes(m))) semConsumo.push(m);
  if (semConsumo.length && semConsumo.length < 12)
    avisos.push(`Meses sem qualquer consumo regulado eléctrico (não se simulam): ${semConsumo.map(i => PV_MESES[i]).join(', ')}.`);

  // Ordem da NT: aquecimento → arrefecimento → restantes
  const ordem = g => g.usos.includes('aquec') ? 0 : g.usos.includes('arref') ? 1 : 2;
  const sims = Object.values(grupos).sort((a, b) => ordem(a) - ordem(b) || a.meses[0] - b.meses[0])
    .map((g, i) => {
      const dias = g.meses.reduce((s, m) => s + PV_DIAS[m], 0);
      const CaUso = {};
      PV_USOS.forEach(u => { CaUso[u.id] = g.usos.includes(u.id) ? Cm[u.id] * g.meses.length : 0; });   // C_a,sim(j,i)
      const Ca = Object.values(CaUso).reduce((s, v) => s + v, 0);                                         // Eq. 2
      const Cd = Ca * 1000 / dias;                                                                       // Eq. 3
      const P = Cd / 24;                                                                                 // Eq. 4
      return {
        n: i + 1,
        nome: ordem(g) === 0 ? 'Estação de aquecimento' : ordem(g) === 1 ? 'Estação de arrefecimento' : 'Meses restantes',
        usos: g.usos, meses: g.meses, dias, CaUso, Ca, Cd, P, P_int: Math.round(P),
      };
    });

  return { M, consumos, Cm, mesesAquec, sims, avisos };
}

// Eq. 6 e 7 — recebe erenSims = [Eren,sim_1, Eren,sim_2, ...]
function pvDesagregar(sims, erenSims) {
  const porUso = {}; PV_USOS.forEach(u => porUso[u.id] = { porSim: [], total: 0 });
  let erenTotal = 0;
  sims.forEach((s, i) => {
    const e = +erenSims[i] || 0;
    erenTotal += e;
    PV_USOS.forEach(u => {
      const v = s.Ca > 0 ? e * s.CaUso[u.id] / s.Ca : 0;
      porUso[u.id].porSim.push(v);
      porUso[u.id].total += v;
    });
  });
  return { porUso, erenTotal };
}

// ═══ UI ═══
function iniciarPV() {
  modo = 'pv';
  setupChat(); setProgress(10); setSub('Térmica — Fotovoltaico (NT-SCE-01)');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarPV }]);
  estadoPV = { input: null, sims: null, avisos: [], logIdx: null };
  addBot('Produção fotovoltaica para autoconsumo em <strong>habitação</strong> (NT-SCE-01). ' +
    'Dê-me os consumos anuais de <strong>energia final eléctrica</strong> dos usos regulados ' +
    '<span style="font-size:11px;color:#5a7aaa;">(só os alimentados a electricidade; os sistemas por defeito contam se forem eléctricos; uso sem electricidade = 0)</span> ' +
    'e a duração da estação de aquecimento <strong>M</strong>.');
  pvFormConsumos();
}

function pvFormConsumos() {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `
    <div class="form-row">
      <div class="form-field"><label>Aquecimento (kWh/ano)</label><input type="number" id="pv-aquec" placeholder="ex: 1467,58" step="0.01" min="0"/></div>
      <div class="form-field"><label>Arrefecimento (kWh/ano)</label><input type="number" id="pv-arref" placeholder="ex: 540,87" step="0.01" min="0"/></div>
    </div>
    <div class="form-row">
      <div class="form-field"><label>AQS (kWh/ano)</label><input type="number" id="pv-aqs" placeholder="ex: 814,14" step="0.01" min="0"/></div>
      <div class="form-field"><label>Ventilação (kWh/ano)</label><input type="number" id="pv-vent" placeholder="ex: 105,12" step="0.01" min="0"/></div>
    </div>
    <div class="form-row">
      <div class="form-field" style="max-width:180px"><label>M — estação de aquecimento (meses)</label><input type="number" id="pv-M" placeholder="ex: 4,8" step="0.1" min="0"/></div>
    </div>
    <div id="pv-err" style="font-size:12px;color:#ef4444;display:none;margin:4px 0;"></div>
    <div class="form-actions"><button class="continuar-btn" onclick="pvCalcular()">Calcular perfis →</button></div>`;
  estadoPV.formEl = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
  setTimeout(() => form.querySelector('#pv-aquec').focus(), 50);
}

function pvLer(f, id) {
  const raw = (f.querySelector('#' + id).value || '').toString().replace(',', '.').trim();
  if (raw === '') return 0;
  const v = parseFloat(raw);
  return isNaN(v) ? NaN : v;
}

function pvCalcular() {
  const f = estadoPV.formEl;
  const err = f.querySelector('#pv-err');
  const input = { aquec: pvLer(f, 'pv-aquec'), arref: pvLer(f, 'pv-arref'), aqs: pvLer(f, 'pv-aqs'), vent: pvLer(f, 'pv-vent'), M: pvLer(f, 'pv-M') };
  const vals = [input.aquec, input.arref, input.aqs, input.vent];
  if (vals.some(v => isNaN(v) || v < 0)) { err.textContent = 'Consumos inválidos — números ≥ 0.'; err.style.display = 'block'; return; }
  if (vals.every(v => v === 0)) { err.textContent = 'Todos os consumos a zero — não há nada para simular.'; err.style.display = 'block'; return; }
  if (input.aquec > 0 && (isNaN(input.M) || input.M <= 0)) { err.textContent = 'Há consumo de aquecimento — indique M (secção 5.3 do Manual SCE).'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  f.querySelectorAll('input,button').forEach(x => x.disabled = true);

  const r = pvCalcularSims(input);
  estadoPV.input = input; estadoPV.sims = r.sims; estadoPV.avisos = r.avisos; estadoPV.M = r.M;
  addUser(`Aquec ${input.aquec} · Arref ${input.arref} · AQS ${input.aqs} · Vent ${input.vent} kWh/ano · M = ${input.M}`);
  setProgress(50);

  // Regista já — os valores de P são o que ela leva para o SCE.ER
  projectLog.push({
    tool: 'pv_nt_sce01',
    input: { ...input, M_usado: r.M },
    result: { sims: r.sims.map(pvSimParaLog), eren: null, desag: null },
    ts: new Date().toISOString()
  });
  estadoPV.logIdx = projectLog.length - 1;
  saveProject();

  pvMostrarSims(r);
  pvFormEren(r.sims);
}

function pvSimParaLog(s) {
  return { n: s.n, nome: s.nome, usos: s.usos, meses: s.meses.map(i => PV_MESES[i]), dias: s.dias, CaUso: s.CaUso, Ca: s.Ca, Cd: s.Cd, P: s.P, P_int: s.P_int };
}

function pvMesesHTML(meses) {
  return PV_MESES.map((m, i) => `<span style="display:inline-block;padding:1px 5px;margin:1px;border-radius:4px;font-size:11px;${meses.includes(i) ? 'background:#1E8AFF33;color:#cfe0ff;' : 'color:#3a4a66;'}">${m}</span>`).join('');
}

function pvMostrarSims(r) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';

  const nomeUso = id => PV_USOS.find(u => u.id === id).nome;
  const linhas = r.sims.map(s => `
    <tr>
      <td><strong>Sim. ${s.n}</strong><br><span style="font-size:11px;color:#5a7aaa;">${s.nome}</span></td>
      <td style="font-size:11px;">${s.usos.map(nomeUso).join(' + ')}</td>
      <td>${pvMesesHTML(s.meses)}</td>
      <td style="text-align:right;">${s.Ca.toFixed(2)}</td>
      <td style="text-align:right;">${s.dias}</td>
      <td style="text-align:right;">${s.Cd.toFixed(2)}</td>
      <td style="text-align:right;font-weight:700;color:#10b981;font-size:15px;">${s.P_int}</td>
    </tr>`).join('');

  const mensal = PV_USOS.filter(u => r.consumos[u.id] > 0)
    .map(u => `${u.nome}: ${r.consumos[u.id].toFixed(2)} / ${u.id === 'aquec' ? r.M : u.id === 'arref' ? 4 : 12} meses = <strong>${r.Cm[u.id].toFixed(2)}</strong> kWh/mês`).join(' · ');

  bubble.innerHTML = `
    <div class="rlabel">Perfis de consumo para o SCE.ER — ${r.sims.length} simulaç${r.sims.length === 1 ? 'ão' : 'ões'}${r.consumos.aquec > 0 ? ` · estação de aquecimento M ≈ ${r.M} (${r.mesesAquec.map(i => PV_MESES[i]).join(', ')})` : ''}</div>
    <div style="font-size:11px;color:#8090b0;margin:4px 0 8px;">Eq. 1 — ${mensal}</div>
    <div style="overflow-x:auto;">
    <table class="res-table">
      <tr><th>Simulação</th><th>Usos</th><th>Meses "on"</th><th style="text-align:right;">kWh/ano</th><th style="text-align:right;">dias</th><th style="text-align:right;">Wh/dia</th><th style="text-align:right;">P (W)</th></tr>
      ${linhas}
    </table></div>
    ${r.avisos.length ? `<div style="font-size:11px;color:#f59e0b;margin:4px 0;">⚠ ${r.avisos.join('<br>⚠ ')}</div>` : ''}
    <div style="font-size:10px;color:#5a7aaa;margin-top:6px;">No SCE.ER, por simulação: perfil de consumo → <em>autoconsumo</em>; potência <strong>P</strong> constante nas 24 h, igual de seg–sex e fim-de-semana (o programa só aceita inteiros); meses "on" só os da simulação, "off" os restantes. Ler o campo <em>autoconsumo (AC)</em> de cada uma.</div>`;

  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function pvFormEren(sims) {
  addBot('Corra o SCE.ER para cada simulação e traga-me o <strong>autoconsumo (AC)</strong> de cada uma, em kWh/ano. ' +
    '<span style="font-size:11px;color:#5a7aaa;">(os perfis já ficaram registados no projecto — pode voltar mais tarde)</span>');
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form';
  form.innerHTML = `
    <div class="form-row">
      ${sims.map(s => `<div class="form-field" style="max-width:170px"><label>Sim. ${s.n} — AC (kWh/ano)</label><input type="number" id="pv-eren-${s.n}" placeholder="${s.nome}" step="0.01" min="0"/></div>`).join('')}
    </div>
    <div id="pv-err2" style="font-size:12px;color:#ef4444;display:none;margin:4px 0;"></div>
    <div class="form-actions"><button class="continuar-btn" onclick="pvConcluir()">Desagregar →</button></div>`;
  estadoPV.formEren = form;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
  setTimeout(() => form.querySelector('#pv-eren-1').focus(), 50);
}

function pvConcluir() {
  const f = estadoPV.formEren;
  const err = f.querySelector('#pv-err2');
  const eren = estadoPV.sims.map(s => pvLer(f, 'pv-eren-' + s.n));
  if (eren.some(v => isNaN(v) || v < 0)) { err.textContent = 'Valores inválidos — números ≥ 0.'; err.style.display = 'block'; return; }
  err.style.display = 'none';
  f.querySelectorAll('input,button').forEach(x => x.disabled = true);
  addUser('AC: ' + eren.map((v, i) => `Sim. ${i + 1} = ${v}`).join(' · ') + ' kWh/ano');
  setProgress(100);

  const d = pvDesagregar(estadoPV.sims, eren);
  const log = projectLog[estadoPV.logIdx];
  if (log) { log.result.eren = eren; log.result.desag = { porUso: d.porUso, erenTotal: d.erenTotal }; saveProject(); }
  pvMostrarDesag(d, eren);
  pvNavFinal();
}

function pvMostrarDesag(d, eren) {
  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const bubble = document.createElement('div'); bubble.className = 'result-bubble';
  const sims = estadoPV.sims;

  const linhas = PV_USOS.map(u => {
    const r = d.porUso[u.id];
    if (r.total === 0 && estadoPV.input[u.id] === 0) return '';
    const pct = d.erenTotal > 0 ? (r.total / d.erenTotal * 100).toFixed(1) + ' %' : '—';
    return `<tr><td>${u.nome}</td>${r.porSim.map(v => `<td style="text-align:right;">${v.toFixed(2)}</td>`).join('')}<td style="text-align:right;font-weight:700;color:#10b981;">${r.total.toFixed(2)}</td><td style="text-align:right;color:#8090b0;">${pct}</td></tr>`;
  }).join('');

  bubble.innerHTML = `
    <div class="rlabel">Desagregação de Eren por uso regulado (Eq. 6 e 7)</div>
    <div class="metrics">
      <div class="mc"><div class="ml">Eren total</div><div class="mv">${d.erenTotal.toFixed(2)}</div><div class="mu">kWh/ano</div></div>
      ${PV_USOS.filter(u => d.porUso[u.id].total > 0).map(u => `<div class="mc"><div class="ml">${u.nome}</div><div class="mv">${d.porUso[u.id].total.toFixed(2)}</div><div class="mu">kWh/ano</div></div>`).join('')}
    </div>
    <div style="overflow-x:auto;margin-top:8px;">
    <table class="res-table">
      <tr><th>Eren [kWh/ano]</th>${sims.map(s => `<th style="text-align:right;">Sim. ${s.n}</th>`).join('')}<th style="text-align:right;">Total</th><th style="text-align:right;">%</th></tr>
      ${linhas}
      <tr><td style="color:#5a7aaa;">Eren,sim</td>${eren.map(v => `<td style="text-align:right;color:#5a7aaa;">${(+v).toFixed(2)}</td>`).join('')}<td style="text-align:right;color:#5a7aaa;">${d.erenTotal.toFixed(2)}</td><td></td></tr>
    </table></div>
    <div style="font-size:10px;color:#5a7aaa;margin-top:6px;">Eren,uso_j,i = Eren,sim_i × C_a,sim(j,i) / C_a,sim_i — a produção de cada simulação reparte-se pelos usos na proporção do consumo que cada um tem nesses meses. Estes são os valores de Eren por uso a introduzir na folha de cálculo do REH.</div>`;

  row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
}

function pvNavFinal() {
  setTimeout(() => {
    setProgress(30);
    addBot('Novo cálculo?');
    const pills = [
      { label: 'Sim', action: iniciarPV },
      { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
    ];
    if (currentProject) {
      if (projectLog.some(l => l.incluirRelatorio)) pills.unshift({ label: '📊 Exportar Excel', action: exportarExcel });
      pills.unshift({ label: '📄 Juntar ao relatório', action: () => { juntarAoRelatorio(); } });
    }
    addPills(pills);
  }, 400);
}

// ─── Export Excel (chamado pelo exportarExcel do app.js) ───
function pvFolhaExcel(wb, marcados) {
  const logs = marcados.filter(l => l.tool === 'pv_nt_sce01');
  if (!logs.length) return;
  const data = [];
  logs.forEach((l, idx) => {
    data.push({ 'Cálculo': idx + 1, 'Bloco': 'Entradas', 'Item': 'Aquecimento (kWh/ano)', 'Valor': l.input.aquec });
    data.push({ 'Cálculo': idx + 1, 'Bloco': 'Entradas', 'Item': 'Arrefecimento (kWh/ano)', 'Valor': l.input.arref });
    data.push({ 'Cálculo': idx + 1, 'Bloco': 'Entradas', 'Item': 'AQS (kWh/ano)', 'Valor': l.input.aqs });
    data.push({ 'Cálculo': idx + 1, 'Bloco': 'Entradas', 'Item': 'Ventilação (kWh/ano)', 'Valor': l.input.vent });
    data.push({ 'Cálculo': idx + 1, 'Bloco': 'Entradas', 'Item': 'M (meses)', 'Valor': `${l.input.M} ≈ ${l.input.M_usado}` });
    l.result.sims.forEach(s => {
      data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': `${s.nome} — ${s.meses.join(', ')}`, 'Valor': '' });
      data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': 'Consumo (kWh/ano)', 'Valor': Math.round(s.Ca * 100) / 100 });
      data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': 'Dias', 'Valor': s.dias });
      data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': 'Consumo diário (Wh/dia)', 'Valor': Math.round(s.Cd * 100) / 100 });
      data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': 'Potência SCE.ER (W)', 'Valor': s.P_int });
      if (l.result.eren) data.push({ 'Cálculo': idx + 1, 'Bloco': `Simulação ${s.n}`, 'Item': 'Eren,sim — AC (kWh/ano)', 'Valor': l.result.eren[s.n - 1] });
    });
    if (l.result.desag) {
      PV_USOS.forEach(u => data.push({ 'Cálculo': idx + 1, 'Bloco': 'Eren por uso', 'Item': `${u.nome} (kWh/ano)`, 'Valor': Math.round(l.result.desag.porUso[u.id].total * 100) / 100 }));
      data.push({ 'Cálculo': idx + 1, 'Bloco': 'Eren por uso', 'Item': 'TOTAL (kWh/ano)', 'Valor': Math.round(l.result.desag.erenTotal * 100) / 100 });
    }
  });
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Fotovoltaico NT-SCE-01');
}

// Node (testes): expor as funções puras
if (typeof module !== 'undefined') module.exports = { pvCalcularSims, pvDesagregar, PV_MESES };
