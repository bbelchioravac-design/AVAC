// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Gestão Técnica Centralizada
// gtc.js — Lista de Pontos (chatbot guiado)
//
// Regras em gtc_regras.js (templates + verificação legal).
// Fluxo: dados do projecto → verificação legal automática →
// equipamento a equipamento → tabela ISQ + resumo DDCs +
// caderno imprimível + CSV.
// ═══════════════════════════════════════════════════

// ─── State ───
let gtcState = null;

function gtcReset() {
  gtcState = {
    esperando: null,          // que resposta o handler aguarda
    dados: {},                // dados do projecto (verificação legal)
    qIdx: 0,                  // índice da pergunta de projecto
    equipamentos: [],         // [{template, nome, quadro, opcoes}]
    eqTemp: null,             // equipamento em construção
    eqPerguntaIdx: 0,
    contadores: {},           // p/ sugerir nomes UTA.01, VE.01...
    reservaPct: 20,
  };
}

// perguntas de projecto (ordem fixa)
const GTC_PROJ_PERGUNTAS = [
  { id: 'pc_global', texto: 'Potência térmica nominal global do edifício (kW)? <span class="dim">(soma de todos os equipamentos de climatização — decide SGT/SGTC)</span>', tipo: 'num' },
  { id: 'caudal_tudo_ar', texto: 'Sistemas «TUDO-AR» (UTAs/rooftops que climatizam SÓ com ar, sem baterias terminais): caudal total de insuflação desses sistemas (m³/h)? <span class="dim">(0 se não há. UTAN de ar novo temperado c/ VRF/FCUs a climatizar NÃO conta — só conta quando é o AR que carrega a carga térmica do espaço. Decide o free-cooling obrigatório >10.000)</span>', tipo: 'num' },
  { id: 'pot_rejeicao', texto: 'Potência térmica de rejeição no ar (kW)? <span class="dim">(0 se n/a — decide recuperação obrigatória)</span>', tipo: 'num' },
  { id: 'ocup_menor_50', texto: 'Existem espaços com ventilação mecânica cuja ocupação média é inferior a 50% da máxima?', tipo: 'simnao' },
  { id: 'caudal_ar_novo', texto: 'AR NOVO: caudal de ar exterior novo insuflado mecanicamente no edifício (m³/h)? <span class="dim">(só o ar exterior — não é o caudal total de insuflação)</span>', tipo: 'num' },
  { id: 'area_solar', texto: 'Área de solar térmico de circulação forçada (m²)? <span class="dim">(0 se não tem)</span>', tipo: 'num' },
  { id: 'multi_fraccao', texto: 'O sistema centralizado serve várias fracções?', tipo: 'simnao' },
  { id: 'ges', texto: 'É um Grande Edifício de Serviços (≥1.000 m², ou 500 m² comercial/piscinas)?', tipo: 'simnao' },
];

// prefixos p/ sugestão de nomes
const GTC_PREFIXOS = { uta: 'UTA', ventilador: 'VE', bombas: 'GB', chiller: 'CH', transversais: 'GERAL', vrf: 'VRF', fcu: 'VC', caldeira: 'CAL', torre: 'TAR', aqs: 'AQS', desenfumagem: 'VD', rooftop: 'RT', cortina: 'CA', registos: 'RCF', meteo: 'EM', iluminacao: 'IL' };

// ─── Arranque ───
function iniciarListaPontos() {
  gtcReset();
  modo = 'gtc';
  setupChat();
  setProgress(0);
  setSub('GTC — Lista de Pontos');
  setHeaderBtns([{ label: '← Ferramentas', action: () => { modo = null; showToolMenu(currentArea); } }]);
  addBot('Vamos montar a <b>lista de pontos da Gestão Técnica</b>. 🎛️<br>Primeiro, meia dúzia de números do projecto — é com eles que a Portaria 138-I decide o que é obrigatório. Depois vamos equipamento a equipamento.');
  gtcPerguntaProjecto();
}

function gtcPerguntaProjecto() {
  const q = GTC_PROJ_PERGUNTAS[gtcState.qIdx];
  if (!q) { gtcFimDadosProjecto(); return; }
  setProgress(Math.round(10 * gtcState.qIdx / GTC_PROJ_PERGUNTAS.length));
  addBot(q.texto);
  if (q.tipo === 'simnao') {
    disableInput();
    addPills([
      { label: 'Sim', action: () => gtcRespProjecto(true) },
      { label: 'Não', action: () => gtcRespProjecto(false) },
    ]);
  } else {
    gtcState.esperando = 'proj_num';
    enableInput('Número...');
  }
}

function gtcRespProjecto(valor) {
  const q = GTC_PROJ_PERGUNTAS[gtcState.qIdx];
  gtcState.dados[q.id] = valor;
  gtcState.qIdx++;
  gtcPerguntaProjecto();
}

function gtcFimDadosProjecto() {
  gtcState.esperando = null;
  disableInput();
  setProgress(15);
  gtcState.modoManual = (gtcState.dados.pc_global || 0) < 100;
  const obrig = gtcObrigacoes();
  let html = `<b>⚖ Verificação legal automática</b> — com estes dados, a lei diz:<ul class="gtc-lista">`;
  obrig.forEach(r => { html += `<li>${r.texto}<br><span class="dim">└ ${r.origem}</span></li>`; });
  html += '</ul>Estas obrigações ficam registadas e saem no caderno.';
  addBot(html);
  if (gtcState.modoManual)
    addBot('📖 <b>PC &lt;100 kW → modo MANUAL DE MÍNIMOS.</b> Neste escalão ninguém instala GTC — por isso, em vez de lista de pontos, indico por equipamento <b>os requisitos mínimos de controlo e monitorização</b>: sinalização, comandos horários, contagens e obrigações legais. (Se mesmo assim quiseres a lista de pontos completa, ela continua disponível no menu.)');
  gtcMenu();
}

function gtcObrigacoes() {
  const d = { ...gtcState.dados, equipamentos: gtcEquipLegal() };
  return verificarLegal(d).filter(r => r.aplicavel);
}

// dados dos equipamentos adicionados p/ a verificação legal
function gtcEquipLegal() {
  return gtcState.equipamentos.map(e => {
    const o = e.opcoes;
    if (e.template === 'chiller') return { nome: e.nome, pot_kw: o.pot_kw || 0, pot_el_kw: Math.round((o.pot_kw || 0) / 3) };
    if (e.template === 'ventilador') return { nome: e.nome, pot_el_kw: o.pot_kw || 0 };
    if (e.template === 'bombas') return { nome: e.nome, pot_el_kw: (o.pot_kw || 0) * (o.n_bombas || 1) };
    if (e.template === 'uta') return { nome: e.nome, pot_kw: o.pot_kw || 0, pot_el_kw: o.bat_el_kw || 0 };
    if (e.template === 'vrf' || e.template === 'rooftop') return { nome: e.nome, pot_kw: o.pot_kw || 0, pot_el_kw: Math.round((o.pot_kw || 0) / 3) };
    if (e.template === 'caldeira') return { nome: e.nome, pot_kw: o.pot_kw || 0, combustivel: o.combustivel !== 'biomassa' };
    return { nome: e.nome };
  });
}

// ─── Menu principal ───
function gtcMenu() {
  gtcState.esperando = null;
  disableInput();
  const n = gtcState.equipamentos.length;
  const linhas = gtcLinhas();
  const t = totais(linhas, gtcState.reservaPct);
  setProgress(Math.min(95, 15 + n * 10));
  addBot(`Lista actual: <b>${n} equipamento${n === 1 ? '' : 's'}</b> · ${t.totalIO} pontos I/O · ${t.tagsCom} tags por protocolo · <b>${t.totalTags} tags totais</b>. O que fazemos?`);
  const pills = [{ label: '➕ Adicionar equipamento', action: gtcEscolherTemplate }];
  if (n > 0 && gtcState.modoManual) {
    pills.push({ label: '📖 Ver manual de mínimos', action: gtcVerManual });
    pills.push({ label: '🖨 Caderno de mínimos (PDF)', action: gtcImprimirCaderno });
    pills.push({ label: '📋 Lista de pontos (se houver GTC)', action: gtcVerLista });
    pills.push({ label: '🗑 Remover equipamento', action: gtcRemover });
  } else if (n > 0) {
    pills.push({ label: '📋 Ver lista', action: gtcVerLista });
    pills.push({ label: '📊 Resumo DDCs', action: gtcVerResumo });
    pills.push({ label: '🖨 Caderno (PDF)', action: gtcImprimirCaderno });
    pills.push({ label: '💾 CSV', action: gtcExportarCSV });
    pills.push({ label: '🗑 Remover equipamento', action: gtcRemover });
  }
  pills.push({ label: '⚖ Obrigações legais', action: () => { gtcFimDadosProjecto(); } });
  addPills(pills);
}

// ─── Adicionar equipamento ───
function gtcEscolherTemplate() {
  addBot('Que tipo de equipamento?');
  disableInput();
  addPills(Object.keys(GTC_TEMPLATES).map(k => ({
    label: GTC_TEMPLATES[k].nome,
    action: () => gtcNovoEquip(k),
  })).concat([{ label: '↩ Voltar', action: gtcMenu }]));
}

function gtcNovoEquip(templateId) {
  const pref = GTC_PREFIXOS[templateId] || 'EQ';
  gtcState.contadores[pref] = (gtcState.contadores[pref] || 0) + 1;
  const sug = `${pref}.${String(gtcState.contadores[pref]).padStart(2, '0')}`;
  gtcState.eqTemp = { template: templateId, nome: sug, quadro: 'QGTC.1', opcoes: {} };
  gtcState.eqPerguntaIdx = 0;
  gtcState.esperando = 'eq_nome';
  addBot(`Nome/referência do equipamento? <span class="dim">(Enter aceita a sugestão: <b>${sug}</b>)</span>`);
  enableInput(sug);
}

function gtcPedirQuadro() {
  const usados = [...new Set(gtcState.equipamentos.map(e => e.quadro))];
  addBot(`Em que quadro (QGTC) fica o <b>${gtcState.eqTemp.nome}</b>?`);
  const pills = usados.map(q => ({ label: q, action: () => { gtcState.eqTemp.quadro = q; gtcProximaPerguntaEq(); } }));
  pills.push({ label: '＋ Outro quadro', action: () => { gtcState.esperando = 'eq_quadro'; enableInput('QGTC.2'); } });
  disableInput();
  if (usados.length) addPills(pills);
  else { gtcState.esperando = 'eq_quadro'; enableInput('QGTC.1 (Enter aceita)'); }
}

function gtcProximaPerguntaEq() {
  const t = GTC_TEMPLATES[gtcState.eqTemp.template];
  const q = t.perguntas[gtcState.eqPerguntaIdx];
  if (!q) { gtcConcluirEquip(); return; }
  addBot(q.texto + (typeof q.def === 'number' ? ` <span class="dim">(Enter aceita: ${q.def})</span>` : ''));
  if (typeof q.def === 'boolean') {
    disableInput();
    addPills([
      { label: 'Sim', action: () => gtcRespEq(true) },
      { label: 'Não', action: () => gtcRespEq(false) },
    ]);
  } else if (q.ops) {
    disableInput();
    addPills(q.ops.map(op => ({ label: op, action: () => gtcRespEq(op) })));
  } else {
    gtcState.esperando = 'eq_num';
    enableInput(String(q.def));
  }
}

function gtcRespEq(valor) {
  const t = GTC_TEMPLATES[gtcState.eqTemp.template];
  const q = t.perguntas[gtcState.eqPerguntaIdx];
  gtcState.eqTemp.opcoes[q.id] = valor;
  gtcState.eqPerguntaIdx++;
  gtcProximaPerguntaEq();
}

function gtcConcluirEquip() {
  gtcState.equipamentos.push(gtcState.eqTemp);
  const linhas = gerarLista([gtcState.eqTemp], { comutadores: true });
  const cont = { ED: 0, SD: 0, EAa: 0, EAp: 0, SA: 0, IMP: 0, COM: 0 };
  let tags = 0;
  linhas.forEach(l => { cont[l.tipo] += (l.qtd || 1); if (l.tipo === 'COM') tags += (l.tags || 0); });
  const resumo = ['ED', 'SD', 'EAa', 'EAp', 'SA', 'IMP'].filter(k => cont[k]).map(k => `${k}=${cont[k]}`).join(' · ');
  if (gtcState.modoManual) {
    const man = gerarMinimos([gtcState.eqTemp])[0];
    let mh = `✔ <b>${gtcState.eqTemp.nome}</b> adicionado. Requisitos mínimos deste equipamento:<ul class="gtc-lista">`;
    man.itens.forEach(i => { mh += `<li>${i.t}<br><span class="dim">└ ${i.o}</span></li>`; });
    mh += '</ul>';
    addBot(mh);
  } else {
    addBot(`✔ <b>${gtcState.eqTemp.nome}</b> adicionado ao ${gtcState.eqTemp.quadro}: ${resumo}${tags ? ` · ${tags} tags protocolo` : ''}.`);
  }
  gtcState.eqTemp = null;
  gtcMenu();
}

// ─── Remover ───
function gtcRemover() {
  disableInput();
  addBot('Qual removo?');
  addPills(gtcState.equipamentos.map((e, i) => ({
    label: `${e.nome} (${e.quadro})`,
    action: () => { gtcState.equipamentos.splice(i, 1); addBot(`🗑 ${e.nome} removido.`); gtcMenu(); },
  })).concat([{ label: '↩ Voltar', action: gtcMenu }]));
}

// ─── Manual de mínimos (modo <100 kW) ───
function gtcVerManual() {
  const mans = gerarMinimos(gtcState.equipamentos);
  let html = '<b>📖 Manual de mínimos</b> — o que cada equipamento tem de ter:';
  mans.forEach(m => {
    html += `<div class="gtc-quadro-tit">▸ ${m.equipamento} <span class="dim">(${m.template})</span></div><ul class="gtc-lista">`;
    m.itens.forEach(i => { html += `<li>${i.t}<br><span class="dim">└ ${i.o}</span></li>`; });
    html += '</ul>';
  });
  addBot(html);
  gtcMenu();
}

// ─── Ver lista / resumo (no chat) ───
function gtcLinhas() {
  return gerarLista(gtcState.equipamentos, { comutadores: true });
}

function gtcVerLista() {
  const linhas = gtcLinhas();
  const quadros = [...new Set(linhas.map(l => l.quadro))];
  let html = '';
  quadros.forEach(q => {
    html += `<div class="gtc-quadro-tit">▣ ${q}</div><div class="gtc-scroll"><table class="gtc-tab"><thead><tr><th>Equipamento</th><th>Ponto</th><th>Tipo</th><th>Sinal</th></tr></thead><tbody>`;
    linhas.filter(l => l.quadro === q).forEach(l => {
      const tipo = l.tipo === 'COM' ? `COM/${l.protocolo} (${l.tags})` : (l.qtd > 1 ? `${l.tipo}×${l.qtd}` : l.tipo);
      html += `<tr><td>${l.equipamento}</td><td>${l.desc}</td><td>${tipo}</td><td>${l.sinal}</td></tr>`;
    });
    html += '</tbody></table></div>';
  });
  addBot(html);
  gtcMenu();
}

function gtcVerResumo() {
  const t = totais(gtcLinhas(), gtcState.reservaPct);
  let html = `<b>📊 Resumo por quadro</b> (reserva ${gtcState.reservaPct}%):<div class="gtc-scroll"><table class="gtc-tab"><thead><tr><th>Quadro</th><th>ED</th><th>SD</th><th>EAa</th><th>EAp</th><th>SA</th><th>IMP</th><th>c/ reserva</th></tr></thead><tbody>`;
  for (const q in t.porQuadro) {
    const v = t.porQuadro[q], r = t.reserva[q];
    const total = v.ED + v.SD + v.EAa + v.EAp + v.SA + v.IMP;
    const comRes = total + r.ED + r.SD + r.EAa + r.EAp + r.SA + r.IMP;
    html += `<tr><td><b>${q}</b></td><td>${v.ED}+${r.ED}</td><td>${v.SD}+${r.SD}</td><td>${v.EAa}+${r.EAa}</td><td>${v.EAp}+${r.EAp}</td><td>${v.SA}+${r.SA}</td><td>${v.IMP}</td><td><b>${comRes}</b></td></tr>`;
  }
  html += `</tbody></table></div>Total I/O: <b>${t.totalIO}</b> · tags protocolo: <b>${t.tagsCom}</b> · total tags: <b>${t.totalTags}</b>`;
  addBot(html);
  disableInput();
  addPills([
    { label: gtcState.reservaPct === 20 ? 'Reserva → 10%' : 'Reserva → 20%', action: () => { gtcState.reservaPct = gtcState.reservaPct === 20 ? 10 : 20; gtcVerResumo(); } },
    { label: '↩ Menu', action: gtcMenu },
  ]);
}

// ─── CSV ───
function gtcExportarCSV() {
  const linhas = gtcLinhas();
  let csv = '﻿Quadro;Equipamento;Descrição;Função;Tipo;Qtd;Sinal;Protocolo;Tags;Origem\n';
  linhas.forEach(l => {
    csv += [l.quadro, l.equipamento, `"${l.desc}"`, l.funcao, l.tipo, l.qtd || 1, l.sinal, l.protocolo || '', l.tags || '', `"${l.origem}"`].join(';') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lista_pontos_gtc.csv';
  a.click();
  addBot('💾 CSV exportado (separador «;», pronto para o Excel).');
  gtcMenu();
}

// ─── Caderno imprimível ───
function gtcImprimirCaderno() {
  const linhas = gtcLinhas();
  const t = totais(linhas, gtcState.reservaPct);
  const proj = (typeof currentProject !== 'undefined' && currentProject) ? currentProject.nome : '';
  const hoje = new Date().toLocaleDateString('pt-PT');
  const obrig = gtcObrigacoes();
  const d = gtcState.dados;

  let corpo = `<section class="bloco">
    <h2>1. Dados do projecto</h2>
    <table class="tab"><tbody>
      <tr><td>Potência térmica nominal global</td><td class="n">${d.pc_global} kW</td></tr>
      <tr><td>Caudal «tudo-ar»</td><td class="n">${d.caudal_tudo_ar} m³/h</td></tr>
      <tr><td>Potência de rejeição</td><td class="n">${d.pot_rejeicao} kW</td></tr>
      <tr><td>Espaços c/ ocupação média &lt;50%</td><td class="n">${d.ocup_menor_50 ? 'Sim' : 'Não'}</td></tr>
      <tr><td>Caudal de ar novo mecânico</td><td class="n">${d.caudal_ar_novo} m³/h</td></tr>
      <tr><td>Solar térmico</td><td class="n">${d.area_solar} m²</td></tr>
      <tr><td>Multi-fracção / GES</td><td class="n">${d.multi_fraccao ? 'Sim' : 'Não'} / ${d.ges ? 'Sim' : 'Não'}</td></tr>
    </tbody></table>
  </section>
  <section class="bloco">
    <h2>2. Obrigações legais aplicáveis</h2>
    <ul class="obrig">${obrig.map(r => `<li>${r.texto} <span class="ref">[${r.origem}]</span></li>`).join('')}</ul>
  </section>`;

  let nSec = 3;
  if (gtcState.modoManual) {
    const mans = gerarMinimos(gtcState.equipamentos);
    mans.forEach(m => {
      corpo += `<section class="bloco">
        <h2>${nSec++}. ${m.equipamento} — ${m.template}</h2>
        <ul class="obrig">${m.itens.map(i => `<li>☐ ${i.t} <span class="ref">[${i.o}]</span></li>`).join('')}</ul>
      </section>`;
    });
    corpo += `<section class="bloco">
      <h2>${nSec}. Preparação para a EPBD 2029</h2>
      <p class="nota" style="font-size:9.5px">${(gtcState.dados.pc_global || 0) > 70
        ? 'Este edifício (' + gtcState.dados.pc_global + ' kW) ficará abrangido pela obrigação de sistemas de automação e controlo até 31-12-2029 (Directiva (UE) 2024/1275, art. 13.º/9 b — transposição nacional pendente). Recomenda-se: quadros eléctricos com espaço de reserva para DDC, sinais de estado/avaria cablados a régua de bornes (não apenas a lâmpadas), e equipamentos adquiridos com interface de comunicação disponível.'
        : 'Edifício abaixo de 70 kW: fora do âmbito previsível da EPBD 2029. Ainda assim, recomenda-se cablar estados/avarias a régua de bornes para facilitar futura integração.'}</p>
    </section>`;
    const tituloDoc = 'Controlo e Monitorização — Mínimos Regulamentares (PC <100 kW)';
    const html = gtcHtmlCaderno(tituloDoc, proj, hoje, corpo);
    const w = window.open('', '_blank');
    if (!w) { alert('O browser bloqueou a janela. Permita pop-ups para imprimir.'); return; }
    w.document.write(html);
    w.document.close();
    addBot('🖨 Caderno de mínimos aberto noutra janela — Ctrl+P → «Guardar como PDF».');
    gtcMenu();
    return;
  }
  const quadros = [...new Set(linhas.map(l => l.quadro))];
  quadros.forEach(q => {
    const doQ = linhas.filter(l => l.quadro === q);
    let rows = '';
    let eqA = '';
    doQ.forEach(l => {
      const eqCell = l.equipamento !== eqA ? l.equipamento : '';
      eqA = l.equipamento;
      const cel = tp => {
        if (l.tipo !== tp) return '<td class="n"></td>';
        return `<td class="n"><b>${l.qtd || 1}</b></td>`;
      };
      const prot = l.tipo === 'COM' ? `${l.protocolo} (${l.tags})` : '';
      rows += `<tr><td class="eq">${eqCell}</td><td>${l.desc}</td>${cel('ED')}${cel('SD')}${cel('EAa')}${cel('EAp')}${cel('SA')}${cel('IMP')}<td>${prot}</td><td class="orig">${l.origem}</td></tr>`;
    });
    const v = t.porQuadro[q], r = t.reserva[q];
    corpo += `<section class="bloco">
      <h2>${nSec++}. Lista de pontos — ${q}</h2>
      <table class="tab pontos">
        <thead><tr><th>Equipamento</th><th>Descrição do ponto</th><th>ED</th><th>SD</th><th>EAa</th><th>EAp</th><th>SA</th><th>IMP</th><th>Protocolo</th><th>Origem do requisito</th></tr></thead>
        <tbody>${rows}
        <tr class="tot"><td colspan="2">Total ${q}</td><td class="n">${v.ED}</td><td class="n">${v.SD}</td><td class="n">${v.EAa}</td><td class="n">${v.EAp}</td><td class="n">${v.SA}</td><td class="n">${v.IMP}</td><td colspan="2"></td></tr>
        <tr class="tot res"><td colspan="2">Reserva ${gtcState.reservaPct}% (mín. 2/tipo)</td><td class="n">+${r.ED}</td><td class="n">+${r.SD}</td><td class="n">+${r.EAa}</td><td class="n">+${r.EAp}</td><td class="n">+${r.SA}</td><td class="n">—</td><td colspan="2"></td></tr>
        </tbody>
      </table>
    </section>`;
  });

  corpo += `<section class="bloco">
    <h2>${nSec}. Resumo geral</h2>
    <table class="tab"><tbody>
      <tr><td>Total de pontos I/O físicos</td><td class="n"><b>${t.totalIO}</b></td></tr>
      <tr><td>Tags por protocolo (Modbus / M-Bus / BACnet)</td><td class="n"><b>${t.tagsCom}</b></td></tr>
      <tr><td>Total de tags do sistema</td><td class="n"><b>${t.totalTags}</b></td></tr>
    </tbody></table>
    <p class="nota">Convenções: ED/SD — entradas/saídas digitais · EAa — entrada analógica activa (0-10V / 4-20 mA) · EAp — passiva (Ni1000) · SA — saída analógica · IMP — contagem de impulsos (≥20 ms) · tags por protocolo não contam como I/O físico. Equipamentos com controlador de fábrica (chillers, VRF) são monitorizados por gateway; a escrita limita-se a autorização, setpoint e limitação de potência.</p>
  </section>`;

  const html = gtcHtmlCaderno('GTC — Lista de Pontos', proj, hoje, corpo);
  const w = window.open('', '_blank');
  if (!w) { alert('O browser bloqueou a janela. Permita pop-ups para imprimir.'); return; }
  w.document.write(html);
  w.document.close();
  addBot('🖨 Caderno aberto noutra janela — Ctrl+P → «Guardar como PDF» (activar «Gráficos de fundo»).');
  gtcMenu();
}

function gtcHtmlCaderno(titulo, proj, hoje, corpo) {
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}${proj ? ' — ' + proj : ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a2030; padding: 12mm 12mm; font-size: 10px; }
    header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2.5px solid #1a2030; padding-bottom: 6px; margin-bottom: 14px; }
    header .logo { font-size: 17px; font-weight: 800; letter-spacing: 1px; }
    header .logo span { color: #e87722; }
    header .meta { font-size: 9.5px; color: #555; text-align: right; }
    h2 { font-size: 12px; margin: 0 0 6px; color: #1a2030; border-left: 4px solid #e87722; padding-left: 7px; }
    section.bloco { margin-bottom: 14px; page-break-inside: avoid; }
    section.bloco:has(table.pontos) { page-break-inside: auto; }
    .tab { width: 100%; border-collapse: collapse; font-size: 9px; }
    .tab td, .tab th { border: 1px solid #c9cfda; padding: 2.5px 5px; text-align: left; vertical-align: top; }
    .tab th { background: #eef1f6; font-weight: 700; }
    .tab .n { text-align: center; }
    .tab .eq { font-weight: 700; white-space: nowrap; }
    .tab .orig { font-size: 7.5px; color: #556; }
    .tab tr.tot td { background: #eef1f6; font-weight: 700; }
    .tab tr.res td { background: #fbf3ea; font-weight: 600; }
    ul.obrig { padding-left: 16px; font-size: 9.5px; }
    ul.obrig li { margin-bottom: 3px; }
    ul.obrig .ref { color: #777; font-size: 8px; }
    p.nota { font-size: 8px; color: #667; margin-top: 6px; line-height: 1.5; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    @media print { body { padding: 10mm 11mm; } .tab th { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
  <header>
    <div class="logo">ALIOS <span>ONE</span> · ${titulo}</div>
    <div class="meta">${proj ? proj + '<br>' : ''}${hoje} · Portaria 138-I/2021 · EN 15232 / ISO 52120</div>
  </header>
  ${corpo}
  <script>window.onload = () => setTimeout(() => window.print(), 400);<\/script>
  </body></html>`;
}

// ─── Input handler ───
inputHandlers['gtc'] = function (val) {
  const st = gtcState;
  if (!st) return;

  if (st.esperando === 'proj_num') {
    const n = parseFloat(val.replace(',', '.'));
    if (isNaN(n) || n < 0) { addBot('Preciso de um número (≥0). Tenta outra vez.'); return; }
    addUser(val);
    document.getElementById('inp').value = '';
    disableInput();
    gtcRespProjecto(n);
    return;
  }

  if (st.esperando === 'eq_nome') {
    const nome = val || st.eqTemp.nome;
    addUser(nome);
    document.getElementById('inp').value = '';
    st.eqTemp.nome = nome;
    st.esperando = null;
    disableInput();
    gtcPedirQuadro();
    return;
  }

  if (st.esperando === 'eq_quadro') {
    const q = val || 'QGTC.1';
    addUser(q);
    document.getElementById('inp').value = '';
    st.eqTemp.quadro = q;
    st.esperando = null;
    disableInput();
    gtcProximaPerguntaEq();
    return;
  }

  if (st.esperando === 'eq_num') {
    const t = GTC_TEMPLATES[st.eqTemp.template];
    const qq = t.perguntas[st.eqPerguntaIdx];
    let n;
    if (val === '') n = qq.def;
    else {
      n = parseFloat(val.replace(',', '.'));
      if (isNaN(n) || n < 0) { addBot('Número inválido — tenta outra vez.'); return; }
    }
    addUser(String(n));
    document.getElementById('inp').value = '';
    st.esperando = null;
    disableInput();
    gtcRespEq(n);
    return;
  }
};

// Enter em campo vazio aceita a sugestão (nome/quadro/número por defeito)
// — o enviar() global ignora vazios, por isso tratamos aqui:
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter' || modo !== 'gtc' || !gtcState) return;
  const inp = document.getElementById('inp');
  if (!inp || document.activeElement !== inp || inp.value.trim() !== '') return;
  const st = gtcState;
  if (st.esperando === 'eq_nome') inputHandlers['gtc']('');
  else if (st.esperando === 'eq_quadro') inputHandlers['gtc']('');
  else if (st.esperando === 'eq_num') inputHandlers['gtc']('');
});

// ─── CSS próprio ───
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .gtc-lista { padding-left: 18px; margin: 6px 0; }
    .gtc-lista li { margin-bottom: 5px; }
    .gtc-quadro-tit { font-weight: 700; margin: 8px 0 4px; }
    .gtc-scroll { max-height: 300px; overflow: auto; border: 1px solid var(--border, #2a3450); border-radius: 8px; margin: 4px 0; }
    .gtc-tab { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    .gtc-tab th, .gtc-tab td { border-bottom: 1px solid var(--border, #2a3450); padding: 4px 7px; text-align: left; }
    .gtc-tab th { position: sticky; top: 0; background: var(--surface, #1a2238); }
    .dim { opacity: .65; font-size: .92em; }
  `;
  document.head.appendChild(style);
})();

// ─── Registo ───
registerTool('gtc', {
  id: 'lista_pontos',
  icon: '🎛️',
  name: 'Lista de Pontos',
  desc: 'GTC/SACE — pontos por equipamento, verificação legal 138-I, resumo DDCs',
  launch: iniciarListaPontos,
});
