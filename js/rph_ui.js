// ═══════════════════════════════════════════════════
// ALIOS ONE — UI: Ventilação REH — Rph habitação
// rph_ui.js — formulário único (réplica da 1ª página da
// folha LNEC) + resultado. Motor em rph_vent.js.
// ═══════════════════════════════════════════════════

registerTool('avac', {
  id: 'rph_habitacao',
  icon: '🌬️',
  name: 'Ventilação REH — Rph habitação',
  desc: 'Réplica da folha LNEC (A. Pinto) — Rph,i, bve, critério',
  launch: iniciarRv
});

let rvForm = null;
let rvResultado = null; // bolha de resultado viva
let rvUltimo = null;    // último {inp, r} p/ relatório

function iniciarRv() {
  modo = 'rv';
  setupChat(); setProgress(20); setSub('AVAC — Ventilação REH (LNEC)');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarRv }]);
  addBot('Preencha os dados da fracção (como na 1.ª página da folha LNEC) e carregue <strong>Calcular</strong>. Motor validado contra a folha original ao centésimo.');

  const row = document.createElement('div'); row.className = 'bot-row';
  const av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
  const form = document.createElement('div'); form.className = 'input-form'; form.style.maxWidth = '760px';

  const municipios = Object.keys(RPH_MUNICIPIOS).sort((a, b) => a.localeCompare(b, 'pt'));
  const selMun = municipios.map(m => `<option${m === 'Lisboa' ? ' selected' : ''}>${m}</option>`).join('');
  const classesOpt = `<option value="4">Classe 4</option><option value="3">Classe 3</option><option value="2">Classe 2</option><option value="1">Classe 1</option><option value="sem">Sem classificação</option>`;
  const cxOpt = `<option value="nao">Não tem</option><option value="baixa">Baixa</option><option value="alta">Alta</option>`;

  const vaoRow = i => `
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:90px"><label>Vão ${i + 1} — área (m²)</label><input type="number" id="rv-va${i}" value="0" step="0.1" min="0"/></div>
      <div class="form-field" style="min-width:130px"><label>Classe</label><select id="rv-vc${i}">${classesOpt}</select></div>
      <div class="form-field" style="min-width:110px"><label>Cx. estore</label><select id="rv-vx${i}">${cxOpt}</select></div>
    </div>`;

  const condRow = i => `
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:70px"><label>Conduta ${i + 1}</label><select id="rv-ca${i}"><option value="nao">Não</option><option value="sim"${i === 0 ? ' selected' : ''}>Sim</option></select></div>
      <div class="form-field" style="min-width:100px"><label>Escoamento</label><select id="rv-ce${i}"><option value="ex">Exaustão</option><option value="ad">Admissão</option></select></div>
      <div class="form-field" style="min-width:90px"><label>Perda de carga</label><select id="rv-cp${i}"><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div>
      <div class="form-field" style="min-width:130px"><label>Cobertura</label><select id="rv-cc${i}"><option value="terraco">Terraço/inclin. &lt;10°</option><option value="10a30" selected>Inclinada 10–30°</option><option value="mais30">Inclinada &gt;30°</option></select></div>
      <div class="form-field" style="min-width:60px"><label>N.º</label><input type="number" id="rv-cn${i}" value="1" min="1" step="1"/></div>
    </div>`;

  const mecRow = (p, i) => `
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:100px"><label>Ramo ${i + 1}</label><select id="rv-${p}e${i}"><option value="ex">Exaustão</option><option value="ad">Admissão</option></select></div>
      <div class="form-field" style="min-width:90px"><label>Caudal (m³/h)</label><input type="number" id="rv-${p}q${i}" value="0" min="0"/></div>
      <div class="form-field" style="min-width:110px"><label>Recuperação calor</label><select id="rv-${p}r${i}"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="form-field" style="min-width:90px"><label>Rend. rec. (%)</label><input type="number" id="rv-${p}rr${i}" value="0" min="0" max="100"/></div>
    </div>`;

  form.innerHTML = `
    <div class="rlabel">1. Enquadramento</div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:160px"><label>Município</label><select id="rv-mun">${selMun}</select></div>
      <div class="form-field" style="min-width:80px"><label>Região</label><select id="rv-reg"><option>A</option><option>B</option></select></div>
      <div class="form-field" style="min-width:80px"><label>Rugosidade</label><select id="rv-rug"><option>I</option><option>II</option><option>III</option></select></div>
      <div class="form-field" style="min-width:90px"><label>Altitude (m)</label><input type="number" id="rv-alt" value="100"/></div>
    </div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:110px"><label>Fachadas expostas</label><select id="rv-nf"><option value="1">1</option><option value="2">2 ou mais</option></select></div>
      <div class="form-field" style="min-width:90px"><label>Hedifício (m)</label><input type="number" id="rv-he" value="9" step="0.1"/></div>
      <div class="form-field" style="min-width:90px"><label>Hfracção (m)</label><input type="number" id="rv-hf" value="3" step="0.1"/></div>
      <div class="form-field" style="min-width:110px"><label>Obstáculos à frente</label><select id="rv-ob"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="form-field" style="min-width:80px"><label>Hobs (m)</label><input type="number" id="rv-ho" value="0" step="0.1"/></div>
      <div class="form-field" style="min-width:80px"><label>Dobs (m)</label><input type="number" id="rv-do" value="0" step="0.1"/></div>
    </div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:100px"><label>Área útil (m²)</label><input type="number" id="rv-au" value="100" step="0.01"/></div>
      <div class="form-field" style="min-width:80px"><label>Pd (m)</label><input type="number" id="rv-pd" value="2.6" step="0.05"/></div>
      <div class="form-field" style="min-width:100px"><label>Pisos da fracção</label><input type="number" id="rv-np" value="1" min="1" step="1"/></div>
      <div class="form-field" style="min-width:110px"><label>Vento</label><select id="rv-vo"><option value="REH">Defeito REH</option><option value="user">Valor próprio</option></select></div>
      <div class="form-field" style="min-width:90px"><label>u10 (m/s)</label><input type="number" id="rv-u10" value="0" step="0.1"/></div>
    </div>
    <div class="rlabel">2. Permeabilidade — vãos envidraçados</div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:110px"><label>n50 medido?</label><select id="rv-n50s"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="form-field" style="min-width:90px"><label>n50 (h⁻¹)</label><input type="number" id="rv-n50" value="1" step="0.1"/></div>
    </div>
    ${vaoRow(0)}${vaoRow(1)}${vaoRow(2)}${vaoRow(3)}
    <div class="rlabel">3. Aberturas de admissão na envolvente</div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-field" style="min-width:110px"><label>Tem aberturas?</label><select id="rv-abs"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
      <div class="form-field" style="min-width:100px"><label>Fixas (cm²)</label><input type="number" id="rv-abf" value="0" min="0"/></div>
      <div class="form-field" style="min-width:110px"><label>Auto-reg. 2 Pa (m³/h)</label><input type="number" id="rv-ab2" value="0" min="0"/></div>
      <div class="form-field" style="min-width:110px"><label>Auto-reg. 10 Pa (m³/h)</label><input type="number" id="rv-ab10" value="0" min="0"/></div>
      <div class="form-field" style="min-width:110px"><label>Auto-reg. 20 Pa (m³/h)</label><input type="number" id="rv-ab20" value="0" min="0"/></div>
    </div>
    <div class="rlabel">4. Condutas de ventilação natural</div>
    ${condRow(0)}${condRow(1)}${condRow(2)}${condRow(3)}
    <div class="rlabel">5. Ventilação mecânica de funcionamento prolongado</div>
    <div class="form-row"><div class="form-field" style="min-width:110px"><label>Existe?</label><select id="rv-mec"><option value="nao">Não</option><option value="sim">Sim</option></select></div></div>
    ${mecRow('m', 0)}${mecRow('m', 1)}
    <div class="rlabel">6. Meios híbridos de baixa pressão (&lt;20 Pa)</div>
    <div class="form-row"><div class="form-field" style="min-width:110px"><label>Existe?</label><select id="rv-hib"><option value="nao">Não</option><option value="sim">Sim</option></select></div></div>
    ${mecRow('h', 0)}${mecRow('h', 1)}
    <div class="rlabel">7. Verão</div>
    <div class="form-row"><div class="form-field" style="min-width:180px"><label>By-pass ao recuperador no verão</label><select id="rv-byp"><option value="sim">Sim</option><option value="nao">Não</option></select></div></div>
    <div class="form-actions"><button class="continuar-btn" onclick="rvCalcular(this)">Calcular →</button></div>`;

  form.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target && ev.target.tagName === 'INPUT') { ev.preventDefault(); rvCalcular(ev.target); }
  });
  // recálculo vivo: alterou um campo → recalcula e actualiza o resultado no sítio
  let rvTimer = null;
  const rvLive = ev => {
    if (!rvResultado) return; // só depois do 1.º Calcular
    clearTimeout(rvTimer);
    rvTimer = setTimeout(() => rvCalcular(ev.target, true), 350);
  };
  form.addEventListener('change', rvLive);
  form.addEventListener('input', rvLive);
  rvForm = form;
  rvResultado = null;
  row.appendChild(av); row.appendChild(form); logEl().appendChild(row); scroll();
}

function rvLerForm() {
  const f = rvForm;
  const num = id => parseFloat((f.querySelector('#' + id).value || '0').toString().replace(',', '.')) || 0;
  const sel = id => f.querySelector('#' + id).value;
  const vaos = [], condutas = [];
  for (let i = 0; i < 4; i++) {
    vaos.push({ area: num('rv-va' + i), classe: sel('rv-vc' + i) === 'sem' ? 'sem' : parseInt(sel('rv-vc' + i)), cxestore: sel('rv-vx' + i) });
    condutas.push({ ativa: sel('rv-ca' + i) === 'sim', escoamento: sel('rv-ce' + i), perda: sel('rv-cp' + i), cobertura: sel('rv-cc' + i), n: num('rv-cn' + i) || 1 });
  }
  const ramos = p => [0, 1].map(i => ({
    escoamento: sel('rv-' + p + 'e' + i), caudal: num('rv-' + p + 'q' + i),
    conhecePressao: false, rec: sel('rv-' + p + 'r' + i) === 'sim', recRend: num('rv-' + p + 'rr' + i)
  }));
  return {
    municipio: sel('rv-mun'), regiao: sel('rv-reg'), rugosidade: sel('rv-rug'), altitude: num('rv-alt'),
    nfach: parseInt(sel('rv-nf')), obstaculos: sel('rv-ob') === 'sim', hedif: num('rv-he'), hfa: num('rv-hf'),
    hobs: num('rv-ho'), dobs: num('rv-do'),
    au: num('rv-au'), pd: num('rv-pd'), npisos: num('rv-np') || 1,
    ventoOpcao: sel('rv-vo') === 'user' ? 'user' : 'REH', u10user: num('rv-u10'),
    n50medido: sel('rv-n50s') === 'sim', n50: num('rv-n50'),
    vaos, temAberturas: sel('rv-abs') === 'sim',
    abFixa: num('rv-abf'), ab2Pa: num('rv-ab2'), ab10Pa: num('rv-ab10'), ab20Pa: num('rv-ab20'),
    condutas,
    mec: { existe: sel('rv-mec') === 'sim', ramos: ramos('m') },
    hib: { existe: sel('rv-hib') === 'sim', ramos: ramos('h') },
    bypassVerao: sel('rv-byp') === 'sim',
  };
}

function rvCalcular(btnEl, silencioso) {
  if (btnEl && btnEl.closest) { const fEl = btnEl.closest('.input-form'); if (fEl) rvForm = fEl; }
  const inp = rvLerForm();
  if (!inp.au || !inp.pd) { if (!silencioso) addBot('Área útil e pé-direito são obrigatórios.'); return; }
  if (inp.hfa > inp.hedif) { if (!silencioso) addBot('A altura da fracção não pode exceder a altura do edifício.'); return; }
  const r = rphCalcular(inp);
  rvUltimo = { inp, r };
  setProgress(100);
  if (!silencioso) {
    projectLog.push({ tool: 'rph_habitacao', input: inp, result: { rphI: r.rphI, rphV: r.rphV, bveI: r.bveI, bveV: r.bveV, wvm: r.wvm, rphReq: r.rphReq, rphNom: r.rphNom, criterio: r.criterio }, ts: new Date().toISOString() });
    saveProject();
  } else if (projectLog.length) {
    // recálculo vivo: actualiza a última entrada desta ferramenta em vez de acumular
    const last = projectLog[projectLog.length - 1];
    if (last.tool === 'rph_habitacao') { last.input = inp; last.result = { rphI: r.rphI, rphV: r.rphV, bveI: r.bveI, bveV: r.bveV, wvm: r.wvm, rphReq: r.rphReq, rphNom: r.rphNom, criterio: r.criterio }; last.ts = new Date().toISOString(); saveProject(); }
  }

  let bubble, row = null, av = null;
  if (rvResultado && rvResultado.isConnected) {
    bubble = rvResultado; // actualização em sítio (recálculo vivo)
  } else {
    row = document.createElement('div'); row.className = 'bot-row';
    av = document.createElement('div'); av.className = 'bot-av'; av.innerHTML = AVATAR_SVG;
    bubble = document.createElement('div'); bubble.className = 'result-bubble';
    rvResultado = bubble;
  }

  const critOk = r.criterio === 'Satisfatório';
  const situacao = r.mecLigada
    ? `Ventilação mecânica/híbrida ligada · insuflação ${Math.round(r.insufTotal)} m³/h · infiltrações ${r.infiltracoes} m³/h`
    : 'Ventilação natural — valor do método';

  bubble.innerHTML = `
    <div class="rlabel">Balanço de energia (REH) · ${situacao}</div>
    <div class="metrics">
      <div class="mc"><div class="ml">Rph,i — aquecimento</div><div class="mv">${r.rphI.toFixed(2)}</div><div class="mu">h⁻¹</div></div>
      <div class="mc"><div class="ml">bve,i</div><div class="mv">${r.bveI}</div><div class="mu"></div></div>
      <div class="mc"><div class="ml">Rph,v — arrefecimento</div><div class="mv">${r.rphV.toFixed(2)}</div><div class="mu">h⁻¹</div></div>
      <div class="mc"><div class="ml">bve,v</div><div class="mv">${r.bveV}</div><div class="mu"></div></div>
      <div class="mc"><div class="ml">Wvm</div><div class="mv">${r.wvm}</div><div class="mu">kWh/ano</div></div>
    </div>
    <div class="rlabel">Caudal mínimo de ventilação</div>
    <div class="metrics">
      <div class="mc"><div class="ml">Rph estimada nominal</div><div class="mv">${r.rphReq.toFixed(2)}</div><div class="mu">h⁻¹ (${Math.round(r.rphReq * r.prep.vol)} m³/h)</div></div>
      <div class="mc"><div class="ml">Requisito mínimo</div><div class="mv">${r.requisito.toFixed(2)}</div><div class="mu">h⁻¹ (${Math.round(r.requisito * r.prep.vol)} m³/h)</div></div>
      <div class="mc"><div class="ml">Critério Rph mín</div><div class="mv" style="color:${critOk ? '#22c55e' : '#ef4444'}">${r.criterio}</div><div class="mu"></div></div>
    </div>
    <div style="font-size:10px;color:#5a7aaa;margin-top:6px;">Réplica da Aplicação LNEC Ventilação REH (A. Pinto, 2021 — Manual SCE cap. 9, DL 101-D/2020), validada contra a folha original. Vento ${r.prep.vento.toFixed(2)} m/s · Text ${r.prep.text} °C · fachada ${r.prep.zona}/${r.prep.protecao} · Vol ${r.prep.vol.toFixed(1)} m³. No requisito mínimo (novos) não contam janelas sem classificação/cl.1-2 nem caixas de estore.</div>`;

  if (row) {
    row.appendChild(av); row.appendChild(bubble); logEl().appendChild(row); scroll();
    setTimeout(() => {
      addBot('Qualquer alteração no formulário <strong>recalcula automaticamente</strong> o resultado acima. Ou:');
      const pills = [
        { label: '📄 Relatório PDF', action: rvRelatorio },
        { label: 'Novo cálculo limpo', action: iniciarRv },
        { label: '← Ferramentas', action: () => showToolMenu(currentArea) }
      ];
      if (currentProject) {
        if (projectLog.some(l => l.incluirRelatorio)) pills.unshift({ label: '📊 Exportar Excel', action: exportarExcel });
        pills.unshift({ label: '📄 Juntar ao relatório', action: () => { juntarAoRelatorio(); } });
      }
      addPills(pills);
    }, 300);
  }
}

// ═══ Relatório PDF (réplica da página 1 da folha LNEC, brasão ALIOS ONE) ═══
function rvRelatorio() {
  if (!rvUltimo) { addBot('Calcule primeiro.'); return; }
  const { inp, r } = rvUltimo;
  const proj = (typeof currentProject !== 'undefined' && currentProject) ? currentProject.nome || '' : '';
  const CLS = c => c === 'sem' ? 'Sem classificação' : 'Classe ' + c;
  const CX = { nao: 'Não tem', baixa: 'Baixa', alta: 'Alta' };
  const COB = { terraco: 'Em terraço, inclinada (<10°)', '10a30': 'Inclinada (10 a 30°)', mais30: 'Inclinada (>30°)' };
  const SN = b => b ? 'Sim' : 'Não';
  const pct = v => Math.round(v * 100) + '%';
  const li = (lab, val) => `<tr><td class="l">${lab}</td><td class="v">${val}</td></tr>`;
  const l4 = (lab, arr) => `<tr><td class="l">${lab}</td>${arr.map(v => `<td class="v c4">${v}</td>`).join('')}</tr>`;

  const vaos = inp.vaos || [];
  const conds = inp.condutas || [];
  const condH = cd => cd.ativa ? (cd.escoamento === 'ex' ? (inp.hedif - inp.hfa + 3) : Math.max(inp.hfa - inp.pd * inp.npisos - 3, 0)) : '—';
  const mecR = (inp.mec && inp.mec.ramos) || [];
  const hibR = (inp.hib && inp.hib.ramos) || [];
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

  const html = `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"/>
  <title>Ventilação REH — Rph${proj ? ' — ' + proj : ''}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Calibri, sans-serif; color: #1a1a1a; margin: 0; padding: 20px 30px; font-size: 10.5px; }
    header.doc { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1E8AFF; padding-bottom: 6px; margin-bottom: 4px; }
    header.doc .t1 { font-size: 15px; font-weight: 700; letter-spacing: 1px; }
    header.doc .t1 span { color: #1E8AFF; }
    header.doc .t2 { font-size: 10px; color: #555; text-align: right; }
    .meta { font-size: 10px; color: #555; margin-bottom: 6px; }
    h2 { font-size: 11.5px; margin: 7px 0 3px; color: #0a2a52; border-bottom: 1px solid #c9d8ec; padding-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; }
    td.l { padding: 1px 6px; border-bottom: 1px solid #eee; color: #333; width: 46%; }
    td.v { padding: 1px 6px; border-bottom: 1px solid #eee; font-weight: 600; }
    td.c4 { width: 13%; text-align: center; }
    table.res { background: #f2f7fd; margin-top: 2px; }
    table.res td { padding: 2px 8px; }
    .big { font-size: 13px; color: #0a2a52; }
    .okc { color: #15803d; font-weight: 700; } .badc { color: #b91c1c; font-weight: 700; }
    .nota { font-size: 8.5px; color: #666; margin-top: 6px; line-height: 1.35; }
    .assin { margin-top: 10px; font-size: 10px; display: flex; gap: 60px; }
    .assin div { border-top: 1px solid #999; padding-top: 3px; min-width: 180px; }
    section { page-break-inside: avoid; }
    td.c4 { white-space: nowrap; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 10mm 15mm; } }
  </style></head><body>
  <header class="doc">
    <div class="t1">ALIOS <span>ONE</span> — Ventilação REH</div>
    <div class="t2">Método simplificado — Aplicação LNEC (A. Pinto, 2021)<br>Manual SCE cap. 9 · DL n.º 101-D/2020</div>
  </header>
  <div class="meta">${proj ? 'Projecto: <strong>' + proj + '</strong> · ' : ''}Habitação — edifício novo ou grande reabilitação · ${new Date().toLocaleDateString('pt-PT')}</div>

  <section><h2>1. Enquadramento do edifício</h2><table>
    ${li('Local (município)', inp.municipio)}${li('Região / Rugosidade', inp.regiao + ' / ' + inp.rugosidade)}
    ${li('Altitude do local (m)', inp.altitude)}${li('N.º de fachadas expostas (Nfach)', inp.nfach === 2 ? '2 ou mais' : '1')}
    ${li('Obstáculos à frente das fachadas', SN(inp.obstaculos) + (inp.obstaculos ? ` (Hobs ${inp.hobs} m · Dobs ${inp.dobs} m)` : ''))}
    ${li('Altura do edifício H<sub>edif</sub> / da fracção H<sub>FA</sub> (m)', inp.hedif + ' / ' + inp.hfa)}
    ${li('Área útil (m²) · Pd (m) · N.º pisos da fracção', inp.au + ' · ' + inp.pd + ' · ' + inp.npisos)}
    ${li('Volume (m³)', r.prep.vol.toFixed(1))}
    ${li('Velocidade do vento (m/s)', (inp.ventoOpcao === 'user' ? 'valor próprio — ' : 'defeito REH — ') + r.prep.vento.toFixed(2))}
    ${li('T exterior (°C)', r.prep.text)}${li('Protecção / Zona da fachada', r.prep.protecao + ' / ' + r.prep.zona)}
  </table></section>

  <section><h2>2. Permeabilidade ao ar da envolvente</h2><table>
    ${li('Foi medido valor n50', SN(inp.n50medido) + (inp.n50medido ? ' — ' + inp.n50 + ' h⁻¹' : ''))}
    ${l4('Área dos vãos (m²)', vaos.map(v => v.area || 0))}
    ${l4('Classe de permeabilidade (janelas/portas)', vaos.map(v => CLS(v.classe)))}
    ${l4('Caixas de estore', vaos.map(v => CX[v.cxestore] || 'Não tem'))}
  </table></section>

  <section><h2>3. Aberturas de admissão de ar na envolvente</h2><table>
    ${li('Tem aberturas de admissão', SN(inp.temAberturas))}
    ${inp.temAberturas ? l4('Fixas (cm²) · Auto-reg. 2 / 10 / 20 Pa (m³/h)', [inp.abFixa || 0, inp.ab2Pa || 0, inp.ab10Pa || 0, inp.ab20Pa || 0]) : ''}
  </table></section>

  <section><h2>4. Condutas de ventilação natural</h2><table>
    ${l4('Conduta considerada', conds.map(c => SN(c.ativa)))}
    ${l4('Escoamento de ar', conds.map(c => c.ativa ? (c.escoamento === 'ex' ? 'Exaustão' : 'Admissão') : '—'))}
    ${l4('Perda de carga', conds.map(c => c.ativa ? cap(c.perda) : '—'))}
    ${l4('Altura da conduta (m)', conds.map(condH))}
    ${l4('Cobertura', conds.map(c => c.ativa ? COB[c.cobertura] : '—'))}
    ${l4('N.º de condutas semelhantes', conds.map(c => c.ativa ? (c.n || 1) : '—'))}
  </table></section>

  <section><h2>5. Meios mecânicos de funcionamento prolongado</h2><table>
    ${li('Existem meios mecânicos', SN(inp.mec && inp.mec.existe))}
    ${(inp.mec && inp.mec.existe) ? l4('Escoamento · Caudal (m³/h) · Rec. calor', mecR.slice(0, 2).map(rr => (rr.escoamento === 'ex' ? 'Exaustão' : 'Admissão') + ' · ' + (rr.caudal || 0) + (rr.rec ? ' · rec ' + rr.recRend + '%' : '')).concat(['—', '—']).slice(0, 4)) : ''}
  </table></section>

  <section><h2>6. Meios híbridos de baixa pressão (&lt;20 Pa)</h2><table>
    ${li('Existem meios híbridos', SN(inp.hib && inp.hib.existe))}
    ${(inp.hib && inp.hib.existe) ? l4('Escoamento · Caudal (m³/h)', hibR.slice(0, 2).map(rr => (rr.escoamento === 'ex' ? 'Exaustão' : 'Admissão') + ' · ' + (rr.caudal || 0)).concat(['—', '—']).slice(0, 4)) : ''}
  </table></section>

  <section><h2>7. Verão — recuperador de calor</h2><table>
    ${li('Existe by-pass ao recuperador no verão', SN(inp.bypassVerao))}
  </table></section>

  <section><h2>8. Resultados</h2>
  <table class="res">
    <tr><td class="l"><strong>8.1 — Balanço de energia — edifício</strong></td><td class="v"></td></tr>
    ${li('R<sub>ph,i</sub> (h⁻¹) — Aquecimento', `<span class="big">${r.rphI.toFixed(2)}</span>`)}
    ${li('b<sub>ve,i</sub> (1 − recuperação de calor)', pct(r.bveI))}
    ${li('R<sub>ph,v</sub> (h⁻¹) — Arrefecimento', `<span class="big">${r.rphV.toFixed(2)}</span>`)}
    ${li('b<sub>ve,v</sub> (1 − recuperação de calor)', pct(r.bveV))}
    ${li('W<sub>vm</sub> (kWh)', r.wvm.toFixed(1))}
    <tr><td class="l"><strong>8.3 — Caudal mínimo de ventilação</strong></td><td class="v"></td></tr>
    ${li('Rph estimada em condições nominais (h⁻¹)', r.rphReq.toFixed(2) + ' — ' + Math.round(r.rphReq * r.prep.vol) + ' m³/h')}
    ${li('Requisito mínimo de ventilação (h⁻¹)', r.requisito.toFixed(2) + ' — ' + Math.round(r.requisito * r.prep.vol) + ' m³/h')}
    ${li('Critério Rph mínimo', `<span class="${r.criterio === 'Satisfatório' ? 'okc' : 'badc'}">${r.criterio}</span>`)}
  </table></section>

  <div class="nota">Nota: no cálculo de Rph mín em edifícios novos e grandes reabilitações não é considerado o efeito de janelas sem classificação, das classes 1 e 2, nem a existência de caixas de estore. Cálculo pelo método simplificado da Aplicação LNEC para Ventilação no âmbito do SCE (Pinto, A., LNEC, 2021 — v1.0), replicado e validado na plataforma ALIOS ONE.</div>
  <div class="assin"><div>Técnico</div><div>Data: ${new Date().toLocaleDateString('pt-PT')}</div></div>
  <script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('O browser bloqueou a janela. Permite pop-ups para gerar o relatório.'); return; }
  w.document.write(html);
  w.document.close();
}
