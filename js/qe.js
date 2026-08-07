// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Electricidade AVAC
// qe.js — Compositor de Sistema (v0.2)
//
// A ferramenta-índice: perguntas → blocos (parque_blocos.js)
// → características por equipamento → etiquetas de saída à
// moda da escola (Pn | In | protecção | cabo) + dossiers.
// In: catálogo primeiro; senão a fórmula da BB:
//   tri  = W / 400 / 1,73 / 0,8
//   mono = W / 230 / 0,8
// [BB + Vasco, 07/08/2026]
// ═══════════════════════════════════════════════════

let qeState = null;

function qeReset() {
  qeState = {
    fase: 'perguntas',   // perguntas → quantos → caract → fim
    pIdx: 0,
    puxados: [],
    parametros: {},
    respostas: {},
    // caracterização
    equipamentos: [],    // ids de blocos puxados (tipos)
    sistemas: [],
    pendentes: [],
    eqIdx: 0,            // tipo em caracterização
    instancias: [],      // [{tipo, nome, dados:{}}] — as máquinas reais
    instAtual: null,
    cIdx: 0,             // pergunta de característica actual
    aguarda: null,       // handler de texto: o que se espera
    contador: {},        // p/ nomes VE.01...
  };
}

// prefixos p/ nomes
const QE_PREFIXO = { ve: 'VE', uta: 'UTA', vrf: 'VRF', bc_reversivel: 'BC', solar_termico: 'SOL' };

// características por bloco (v0.2 — o mínimo p/ a etiqueta de saída)
const QE_CARACT = {
  ve: [
    { id: 'pn', q: 'Pn do motor (kW)?', tipo: 'num' },
    { id: 'fase', q: 'Monofásico ou trifásico?', pills: [{ v: 'mono', label: 'Mono' }, { v: 'tri', label: 'Tri' }] },
    { id: 'ec', q: 'Motor EC?', pills: [{ v: 'sim', label: 'Sim' }, { v: 'nao', label: 'Não' }] },
    { id: 'cmd', q: 'Como é comandado?', pills: [{ v: 'relogio', label: 'Relógio' }, { v: 'sonda', label: 'Sonda (term./higro.)' }, { v: 'continuo', label: 'Contínuo 24h' }, { v: 'manual', label: 'Só manual' }] },
    { id: 'in', q: 'In de chapa (A)? <span class="dim">(0 = calculo eu, c/ a tua fórmula)</span>', tipo: 'num' },
  ],
  uta: [
    { id: 'pn', q: 'Potência ELÉCTRICA total da UTA (kW)? <span class="dim">(a absorvida, não a térmica)</span>', tipo: 'num' },
    { id: 'fase', q: 'Monofásica ou trifásica?', pills: [{ v: 'mono', label: 'Mono' }, { v: 'tri', label: 'Tri' }] },
    { id: 'ctrl', q: 'Controlo da UTA? <span class="dim">(nos pequenos nem sempre há controlo integrado)</span>', pills: [{ v: 'fab', label: 'Integrado (fabricante)' }, { v: 'qe', label: 'Comandada pelo QE' }] },
    { id: 'in', q: 'In de chapa (A)? <span class="dim">(0 = calculo eu)</span>', tipo: 'num' },
  ],
  vrf: [
    { id: 'pn', q: 'Potência ELÉCTRICA da UE (kW)?', tipo: 'num' },
    { id: 'fase', q: 'UE monofásica ou trifásica?', pills: [{ v: 'mono', label: 'Mono' }, { v: 'tri', label: 'Tri' }] },
    { id: 'nuis', q: 'Quantas UIs?', tipo: 'num' },
    { id: 'in', q: 'In de chapa da UE (A)? <span class="dim">(0 = calculo eu)</span>', tipo: 'num' },
  ],
  bc_reversivel: [
    { id: 'pn', q: 'Potência ELÉCTRICA absorvida máxima (kW)? <span class="dim">(⚠ não é a térmica! ver chapa/catálogo)</span>', tipo: 'num' },
    { id: 'fase', q: 'Monofásica ou trifásica?', pills: [{ v: 'mono', label: 'Mono' }, { v: 'tri', label: 'Tri' }] },
    { id: 'in', q: 'In máx de chapa (A)? <span class="dim">(0 = calculo eu)</span>', tipo: 'num' },
  ],
  solar_termico: [
    { id: 'pn', q: 'Resistência de apoio (kW)? <span class="dim">(lembra: Joule ≤5% / 25 kW)</span>', tipo: 'num' },
    { id: 'fase', q: 'Resistência mono ou tri?', pills: [{ v: 'mono', label: 'Mono' }, { v: 'tri', label: 'Tri' }] },
  ],
};

// ─── Cálculo eléctrico (doutrina da casa) ───
function qeInCalc(pnKW, fase) {
  // a fórmula DELA, tal e qual
  return fase === 'tri' ? pnKW * 1000 / 400 / 1.73 / 0.8 : pnKW * 1000 / 230 / 0.8;
}

// faixas de guarda-motor comerciais
const QE_FAIXAS_GM = [[0.25,0.4],[0.4,0.63],[0.63,1],[1,1.6],[1.6,2.5],[2.5,4],[4,6.3],[6.3,10],[9,14],[13,18],[17,23],[20,25],[24,32],[30,40],[37,50],[48,65],[63,80]];
function qeFaixaGM(inA) {
  for (const [a, b] of QE_FAIXAS_GM) if (inA >= a && inA <= b) return `${a}..${b}A`;
  const f = QE_FAIXAS_GM.find(([a]) => a >= inA);
  return f ? `${f[0]}..${f[1]}A` : '>80A (dimensionar)';
}

// disjuntores comerciais — piso 16A [REGRA DA CASA 07/08, via Lopes:
// nunca <16A nem cabo <2,5 (RTIEBT só o impõe a tomadas; generalizar é
// doutrina de robustez — e os desenhos das 3 gerações confirmam-na).
// Ressalva: chapa do fabricante c/ protecção máx menor MANDA.]
const QE_DISJ = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
function qeDisj(inA) {
  const d = QE_DISJ.find(x => x >= inA * 1.1);
  return d ? `${d}A` : '>250A (dimensionar)';
}

// calibre do diferencial = escalão comercial ACIMA do disjuntor
// [REGRA DA CASA 07/08, via Lopes: o ID não se protege a si próprio —
// quem corta sobrecargas é o disjuntor; o ID só tem de aguentar]
const QE_DIF_CAL = [25, 40, 63, 80, 100, 125];
function qeDifCal(disjA) {
  const a = parseFloat(disjA) || 16;
  const d = QE_DIF_CAL.find(x => x > a);
  return d ? `${d}A` : '>125A (dimensionar)';
}

// tabela potência→secção da Malha 34 [ESCOLA-BB] — piso 2,5 [REGRA DA CASA]
const QE_SECCAO = [[20,'2,5'],[25,'4'],[32,'6'],[50,'10'],[63,'16'],[80,'25'],[100,'35'],[125,'50'],[160,'70'],[200,'95'],[250,'120'],[315,'185']];
function qeSeccao(calibreA) {
  const s = QE_SECCAO.find(([a]) => calibreA <= a);
  return s ? s[1] : '>185 (dimensionar)';
}

// cabo por tipo: mono 3G | motor tri 4G | tri c/ neutro 5G [ESCOLA]
function qeCabo(fase, comNeutro, seccao) {
  const g = fase === 'mono' ? '3G' : (comNeutro ? '5G' : '4G');
  return `XZ1 (frt,zh) ${g}${seccao}`;
}

// escalão PC do edifício (P0): b30 / b100 / b289 / b290
// <=30: Tab.18 não morde | 31-100: Tab.18 morde MAS sem GTC → sinalização
// no QUADRO | >=100: GTC | >=290: GTC classe A [138-I + prática BB]
function qePC() { return (qeState && qeState.parametros.pc) || 'b100'; }
function qeTemContagem(pnKW) { return pnKW > 12 && qePC() !== 'b30'; }
function qeSemGTC() { return qePC() === 'b30' || qePC() === 'b100'; }

// etiqueta de saída à moda do Lopes
function qeEtiquetaSaida(inst) {
  const b = PARQUE_BLOCOS[inst.tipo];
  const d = inst.dados;
  const linhas = [];
  const fase = d.fase || 'tri';
  const inCat = d.in > 0;
  const inA = inCat ? d.in : qeInCalc(d.pn, fase);
  const inTxt = inA.toFixed(1) + 'A' + (inCat ? '' : ' <span class="dim">(calc)</span>');

  if (inst.tipo === 've') {
    const prot = d.ec === 'sim' ? `disjuntor ${qeDisj(inA)}` : `guarda-motor ${qeFaixaGM(inA)}`;
    const calibre = d.ec === 'sim' ? parseFloat(qeDisj(inA)) || 10 : Math.max(10, inA * 1.25);
    const CMD_TXT = { relogio: 'KM + relógio c/ reserva de marcha (IH→KH)', sonda: 'KM + sonda (termóstato/higróstato)', continuo: 'serviço contínuo — sem comando (corta no disjuntor)', manual: 'KM + comutador (só manual)' };
    linhas.push(`${inst.nome} | Pn ${d.pn} kW | In ${inTxt} | ${prot} | ${qeCabo(fase, false, qeSeccao(calibre))}`);
    if (d.cmd) linhas.push(`<span class="dim">   comando: ${CMD_TXT[d.cmd]}</span>`);
    if (d.ec === 'sim') linhas.push(`<span class="dim">   motor EC: protecção do motor é da electrónica interna — disjuntor protege o CABO; diferencial tipo A mín. (fugas DC da electrónica)</span>`);
  } else if (inst.tipo === 'uta') {
    const disj = qeDisj(inA);
    linhas.push(`${inst.nome} | Pn el. ${d.pn} kW | In ${inTxt} | disjuntor ${disj} + dif. ${qeDifCal(disj)} tipo A | ${qeCabo(fase, fase !== 'mono', qeSeccao(parseFloat(disj) || 16))}`);
    if (qeTemContagem(d.pn)) linhas.push(`<span class="dim">   ⚡ >12 kW el. + PC>30 → CONTAGEM permanente neste circuito [LEI 138-I Tab.18, pág.22]</span>`);
    if (d.ctrl === 'qe') linhas.push(`<span class="dim">   comandada pelo QE: contactor + relógio/termóstato + Estado em lâmpada (sistema pequeno — a escada desce ao degrau 2)</span>`);
    else if (qeSemGTC()) linhas.push(`<span class="dim">   💡 sem GTC (PC<100): Avaria da UTA repetida em LÂMPADA no QE (contacto seco do fabricante) [REGRA-BB]</span>`);
  } else if (inst.tipo === 'vrf') {
    const disj = qeDisj(inA);
    linhas.push(`${inst.nome} (UE) | Pn el. ${d.pn} kW | In ${inTxt} | disjuntor ${disj} + dif. ${qeDifCal(disj)} tipo ${fase === 'tri' ? 'B' : 'F'} | ${qeCabo(fase, fase !== 'mono', qeSeccao(parseFloat(disj) || 16))}`);
    if (qeTemContagem(d.pn)) linhas.push(`<span class="dim">   ⚡ >12 kW el. + PC>30 → CONTAGEM permanente neste circuito [LEI 138-I Tab.18, pág.22]</span>`);
    if (qeSemGTC()) linhas.push(`<span class="dim">   💡 sem GTC (PC<100): alarme geral da UE em LÂMPADA no QE (contacto seco) [prática gtc_regras]</span>`);
    // UIs em grupos de <=5 por circuito [ESCOLA NCH: VC1 a VC5]
    qeGruposUIs(d.nuis).forEach(g => {
      linhas.push(`${inst.nome} (UI ${g}) | 3G2,5 - 16A + dif. 25A tipo A <span class="dim">(agrupar por piso na prática)</span>`);
    });
  } else if (inst.tipo === 'bc_reversivel') {
    const disj = qeDisj(inA);
    // inverter mono → tipo F (imunizado a HF); VFD trifásico → tipo B (fugas DC lisas cegam A/AC)
    const dif = `dif. ${qeDifCal(disj)} tipo ${fase === 'mono' ? 'F (inverter)' : 'B (VFD tri)'}`;
    linhas.push(`${inst.nome} | Pn el. ${d.pn} kW | In ${inTxt} | disjuntor ${disj} + ${dif} | ${qeCabo(fase, fase !== 'mono', qeSeccao(parseFloat(disj) || 25))}`);
    if (qeTemContagem(d.pn)) linhas.push(`<span class="dim">   ⚡ >12 kW el. + PC>30 → CONTAGEM permanente neste circuito [LEI 138-I Tab.18, pág.22]</span>`);
    if (qeSemGTC()) linhas.push(`<span class="dim">   💡 sem GTC (PC<100): Avaria da BC repetida em LÂMPADA no QE (contacto seco) [REGRA-BB]</span>`);
  } else if (inst.tipo === 'solar_termico') {
    const disj = qeDisj(inA);
    linhas.push(`${inst.nome} (resistência) | Pn ${d.pn} kW | In ${inTxt} | disjuntor ${disj} + contactor + relógio c/ reserva de marcha | ${qeCabo(fase, fase !== 'mono', qeSeccao(parseFloat(disj) || 10))}`);
    linhas.push(`${inst.nome} (bomba solar) | circuito próprio 3G2,5 - 16A <span class="dim">(comuta o controlador solar)</span>`);
  }
  return linhas;
}

// ─── Arranque ───
function iniciarCompositorQE() {
  qeReset();
  modo = 'qe';
  setupChat();
  setProgress(0);
  setSub('QE-AVAC — Compositor de Sistema');
  setHeaderBtns([{ label: '← Ferramentas', action: () => { modo = null; showToolMenu(currentArea); } }]);
  addBot('Vamos <b>compor o sistema</b>. ⚡<br>Primeiro as perguntas de arquitectura; depois vamos máquina a máquina buscar as características, e eu devolvo as <b>etiquetas de saída</b> de cada circuito.<br><span class="dim">v0.2 — blocos: VRF, UTA, VE, bomba de calor, solar. In de chapa primeiro; sem chapa, calculo com a tua fórmula (W/400/1,73/0,8 ou W/230/0,8) e marco «(calc)».</span>');
  qePergunta();
}

// ─── Fase 1: perguntas de arquitectura ───
function qePergunta() {
  while (qeState.pIdx < PARQUE_PERGUNTAS.length) {
    const p = PARQUE_PERGUNTAS[qeState.pIdx];
    if (p.so_se && !qeState.puxados.includes(p.so_se)) { qeState.pIdx++; continue; }
    break;
  }
  const p = PARQUE_PERGUNTAS[qeState.pIdx];
  if (!p) { qePrepararCaract(); return; }
  setProgress(Math.round(30 * qeState.pIdx / PARQUE_PERGUNTAS.length));
  addBot(p.texto);
  addPills(p.opcoes.map(o => ({
    label: o.label,
    action: () => {
      qeState.respostas[p.id] = o.v;
      (o.puxa || []).forEach(b => { if (!qeState.puxados.includes(b)) qeState.puxados.push(b); });
      if (o.parametriza) Object.assign(qeState.parametros, o.parametriza);
      qeState.pIdx++;
      qePergunta();
    },
  })));
}

// ─── Fase 2: expandir sistemas e perguntar quantidades ───
function qePrepararCaract() {
  qeState.puxados.forEach(id => {
    if (PARQUE_BLOCOS_SISTEMA[id]) {
      qeState.sistemas.push(id);
      PARQUE_BLOCOS_SISTEMA[id].compoe.forEach(c => {
        if (PARQUE_BLOCOS[c]) { if (!qeState.equipamentos.includes(c)) qeState.equipamentos.push(c); }
        else if (!qeState.pendentes.includes(c)) qeState.pendentes.push(c);
      });
    } else if (PARQUE_BLOCOS[id]) {
      if (!qeState.equipamentos.includes(id)) qeState.equipamentos.push(id);
    }
  });
  addBot(`Arquitectura fechada: <b>${qeState.equipamentos.map(id => PARQUE_BLOCOS[id].nome).join('</b>, <b>')}</b>.<br>Agora as máquinas, uma a uma. 🏭`);
  qeState.fase = 'quantos';
  qePerguntaQuantos();
}

function qePerguntaQuantos() {
  const id = qeState.equipamentos[qeState.eqIdx];
  if (!id) { qeRelatorio(); return; }
  const b = PARQUE_BLOCOS[id];
  setProgress(30 + Math.round(60 * qeState.eqIdx / qeState.equipamentos.length));
  // solar e BC: tipicamente 1 — pergunta na mesma (pode haver 2 BCs)
  addBot(`${b.icone} <b>${b.nome}</b> — quantas unidades?`);
  qeState.aguarda = 'quantos';
  enableInput('nº de unidades (ex.: 2)');
}

function qeCriarInstancias(n) {
  const id = qeState.equipamentos[qeState.eqIdx];
  const pref = QE_PREFIXO[id] || 'EQ';
  for (let i = 0; i < n; i++) {
    qeState.contador[pref] = (qeState.contador[pref] || 0) + 1;
    qeState.instancias.push({ tipo: id, nome: `${pref}.${String(qeState.contador[pref]).padStart(2, '0')}`, dados: {} });
  }
  // caracterizar as novas instâncias deste tipo
  qeState.instAtual = qeState.instancias.findIndex(x => x.tipo === id && Object.keys(x.dados).length === 0);
  qeState.cIdx = 0;
  qeCaractPergunta();
}

// ─── Fase 3: características por instância ───
function qeCaractPergunta() {
  const inst = qeState.instancias[qeState.instAtual];
  if (!inst) { qeProximoTipo(); return; }
  const perguntas = QE_CARACT[inst.tipo] || [];
  const c = perguntas[qeState.cIdx];
  if (!c) {
    // instância completa → próxima do mesmo tipo, ou próximo tipo
    const prox = qeState.instancias.findIndex((x, i) => i > qeState.instAtual && x.tipo === inst.tipo && Object.keys(x.dados).length === 0);
    if (prox >= 0) { qeState.instAtual = prox; qeState.cIdx = 0; qeCaractPergunta(); }
    else qeProximoTipo();
    return;
  }
  addBot(`<b>${inst.nome}</b> — ${c.q}`);
  if (c.pills) {
    qeState.aguarda = null;
    addPills(c.pills.map(o => ({
      label: o.label,
      action: () => { inst.dados[c.id] = o.v; qeState.cIdx++; qeCaractPergunta(); },
    })));
  } else {
    qeState.aguarda = 'caract';
    enableInput('valor (usa ponto ou vírgula)');
  }
}

function qeProximoTipo() {
  qeState.eqIdx++;
  qeState.instAtual = null;
  qePerguntaQuantos();
}

// handler de texto (números)
inputHandlers['qe'] = function (val) {
  const num = parseFloat(String(val).replace(',', '.'));
  if (isNaN(num) || num < 0) { addUser(val); addBot('Preciso de um número. 🦆'); return; }
  addUser(val);
  disableInput();
  if (qeState.aguarda === 'quantos') {
    const n = Math.round(num);
    if (n === 0) { qeProximoTipo(); return; }
    if (n > 30) { addBot('Mais de 30? Isso não é uma moradia, é um aeroporto — confirma. 😏'); enableInput('nº de unidades'); return; }
    qeCriarInstancias(n);
  } else if (qeState.aguarda === 'caract') {
    const inst = qeState.instancias[qeState.instAtual];
    const c = (QE_CARACT[inst.tipo] || [])[qeState.cIdx];
    inst.dados[c.id] = num;
    qeState.cIdx++;
    qeCaractPergunta();
  }
};

// ─── Fase 4: relatório ───
function qeRelatorio() {
  setProgress(95);
  const comMaquinas = qeState.instancias.length > 0;
  if (qePC() === 'b290') addBot('⚠ <b>PC ≥ 290 kW → GTC CLASSE A obrigatória</b> desde 01-01-2025 [138-I Tab.27/28]. A lista de pontos faz-se na ferramenta 🎛️ GTC; este quadro leva régua completa p/ o DDC.');
  if (qeSemGTC()) addBot('💡 <b>PC < 100 kW → sem GTC</b> (prática da casa): o QUADRO é o interface — sinalizações e contagens ficam nele (lâmpadas por máquina, contadores locais).');
  addBot(`<b>Sistema composto.</b> ${qeState.instancias.length} máquina${qeState.instancias.length !== 1 ? 's' : ''}${qeState.parametros.malha_agua ? ` · rede ${qeState.parametros.malha_agua}` : ''}.`);

  // regras das malhas de sistema
  qeState.sistemas.forEach(id => {
    const s = PARQUE_BLOCOS_SISTEMA[id];
    let sh = `<div class="qe-eq-tit">${s.icone} ${s.nome}${qeState.parametros[id] ? ' — ' + qeState.parametros[id] : ''}</div><ul class="qe-lista">`;
    s.regras.forEach(r => { sh += `<li>${qeEtiquetaTag(r)}</li>`; });
    sh += '</ul>';
    addBot(sh);
  });

  // ⚡ ETIQUETAS DE SAÍDA (o entregável novo da v0.2)
  if (comMaquinas) {
    let et = `<div class="qe-eq-tit">⚡ Etiquetas de saída (QE-AVAC)</div><div class="qe-etq">`;
    qeState.instancias.forEach(inst => {
      qeEtiquetaSaida(inst).forEach(l => { et += `<div>${l}</div>`; });
    });
    et += '</div><span class="dim">In (calc) = a tua fórmula: tri W/400/1,73/0,8 · mono W/230/0,8. Secções pela tabela da Malha 34. Confirmar sempre c/ chapa do fabricante quando ela chegar.</span>';
    addBot(et);
  }

  // dossiers por tipo (colapsáveis)
  qeState.equipamentos.forEach(id => {
    const b = PARQUE_BLOCOS[id];
    const qm = PARQUE_QUEM_MANDA[b.quem_manda];
    const minhas = qeState.instancias.filter(x => x.tipo === id).map(x => x.nome).join(', ');
    let d = `<details class="qe-det"><summary>${b.icone} <b>${b.nome}</b>${minhas ? ` <span class="dim">(${minhas})</span>` : ''} <span class="qe-badge">manda: ${qm.nome}</span></summary>`;
    d += `<div class="qe-sec-tit">🏭 Parque</div><ul class="qe-lista">`;
    d += `<li><span class="dim">campos:</span> ${b.parque.campos.join(' · ')}</li>`;
    (b.parque.regras_lei || []).forEach(r => { d += `<li>${qeEtiquetaTag(r)}</li>`; });
    (b.parque.avisos || []).forEach(a => { d += `<li>⚠ ${qeEtiquetaTag(a)}</li>`; });
    d += '</ul>';
    d += `<div class="qe-sec-tit">⚡ QE</div><ul class="qe-lista">`;
    d += `<li><b>Alimentação:</b> ${qeEtiquetaTag(b.qe.alimentacao)}</li>`;
    d += `<li><b>Arranque:</b> ${qeEtiquetaTag(b.qe.arranque)}</li>`;
    d += `<li><b>Protecção:</b> ${qeEtiquetaTag(b.qe.proteccao)}</li>`;
    d += `<li><b>Comando:</b> ${qeEtiquetaTag(b.qe.comando)}</li>`;
    d += `<li><b>Sinalização:</b> ${qeEtiquetaTag(b.qe.sinalizacao)}</li>`;
    d += '</ul>';
    d += `<div class="qe-sec-tit">🎛️ GTC</div><ul class="qe-lista"><li>${qeEtiquetaTag(b.gtc.resumo)}</li></ul>`;
    d += `<div class="qe-sec-tit">📄 Caderno</div><ul class="qe-lista"><li>${qeEtiquetaTag(b.caderno)}</li></ul>`;
    d += '</details>';
    addBot(d);
  });

  if (qeState.pendentes.length) {
    addBot(`<span class="dim">⚠ Blocos ainda por escrever (leva 2, c/ a lição do VFD): ${qeState.pendentes.join(', ')}.</span>`);
  }

  setProgress(100);
  const temMaquinas = qeState.instancias.length > 0;
  addPills([
    ...(temMaquinas ? [{ label: '📐 Ver esquema de princípio', action: () => qeMostrarUnifilar() }] : []),
    { label: '🔁 Compor outro sistema', action: () => iniciarCompositorQE() },
    { label: '← Ferramentas', action: () => { modo = null; showToolMenu(currentArea); } },
  ]);
}

// ═══ BONECADA v0.1 — esquema unifilar de princípio ═══
// Símbolos da casa (inventados c/ base nas 3 escolas): disjuntor =
// lâmina IEC; diferencial = oval no condutor (à Lopes); guarda-motor =
// lâmina em caixa; contactor = meia-lua; relógio = mostrador; motor =
// círculo M; resistência = rectângulo; equipamento c/ quadro próprio =
// caixa. Fundo branco = pronto a imprimir/DXF um dia.

// descreve cada saída como cadeia de aparelhos (deriva do bloco+dados)
function qeCircuitos() {
  const circ = [];
  qeState.instancias.forEach(inst => {
    const d = inst.dados;
    const fase = d.fase || 'tri';
    const inCat = d.in > 0;
    const inA = inCat ? d.in : qeInCalc(d.pn, fase);
    const inTxt = inA.toFixed(1) + 'A' + (inCat ? '' : '*');
    if (inst.tipo === 've') {
      const ec = d.ec === 'sim';
      const cmd = d.cmd || 'relogio';
      const comKM = cmd !== 'continuo';
      circ.push({
        nome: inst.nome, fase,
        cadeia: (ec ? ['disj', 'dif'] : ['gm', 'dif']).concat(comKM ? ['km'] : []),
        prot: ec ? qeDisj(inA) : qeFaixaGM(inA),
        dif: 'A', carga: 'motor',
        info: [`${d.pn} kW · ${inTxt}`, qeCaboTxt(inst)],
        extra: ec ? 'EC' : null,
        cmdTipo: cmd, temGM: !ec,
        relogio: cmd === 'relogio',
      });
    } else if (inst.tipo === 'uta') {
      const utaQE = d.ctrl === 'qe';
      circ.push({ nome: inst.nome, fase, cadeia: utaQE ? ['disj', 'dif', 'km'] : ['disj', 'dif'], prot: qeDisj(inA), dif: 'A', carga: 'caixa', cargaTxt: 'UTA', info: [`${d.pn} kW · ${inTxt}`, qeCaboTxt(inst)], cont: qeTemContagem(d.pn), cmdTipo: utaQE ? 'relogio' : null, temGM: false, relogio: utaQE });
    } else if (inst.tipo === 'vrf') {
      circ.push({ nome: inst.nome + ' UE', fase, cadeia: ['disj', 'dif'], prot: qeDisj(inA), dif: fase === 'tri' ? 'B' : 'F', carga: 'caixa', cargaTxt: 'VRF', info: [`${d.pn} kW · ${inTxt}`, qeCaboTxt(inst)], cont: qeTemContagem(d.pn) });
      qeGruposUIs(d.nuis).forEach(g => {
        circ.push({ nome: `${inst.nome} UI ${g}`, fase: 'mono', cadeia: ['disj', 'dif'], prot: '16A', dif: 'A', carga: 'caixa', cargaTxt: 'UIs', info: [`UI ${g}`, '3G2,5'] });
      });
    } else if (inst.tipo === 'bc_reversivel') {
      circ.push({ nome: inst.nome, fase, cadeia: ['disj', 'dif'], prot: qeDisj(inA), dif: fase === 'tri' ? 'B' : 'F', carga: 'caixa', cargaTxt: 'BC', info: [`${d.pn} kW · ${inTxt}`, qeCaboTxt(inst)], cont: qeTemContagem(d.pn) });
    } else if (inst.tipo === 'solar_termico') {
      circ.push({ nome: inst.nome + ' res.', fase, cadeia: ['disj', 'dif', 'km', 'ih'], prot: qeDisj(inA), dif: 'A', carga: 'resist', info: [`${d.pn} kW · ${inTxt}`, qeCaboTxt(inst)] });
      circ.push({ nome: inst.nome + ' bomba', fase: 'mono', cadeia: ['disj', 'dif'], prot: '16A', dif: 'A', carga: 'motor', info: ['ctrl. solar', '3G2,5'] });
    }
  });
  return circ;
}

// UIs em grupos de <=5 por circuito [ESCOLA NCH: "VC1 a VC5"] → ["1-5","6-10",...]
function qeGruposUIs(n) {
  const g = [];
  for (let i = 1; i <= n; i += 5) g.push(`${i}-${Math.min(i + 4, n)}`);
  return g;
}

function qeCaboTxt(inst) {
  // reaproveita a etiqueta: última coluna
  const l = qeEtiquetaSaida(inst)[0] || '';
  const m = l.match(/XZ1 \(frt,zh\) \S+/);
  return m ? m[0].replace('XZ1 (frt,zh) ', '') : '';
}

// desenha o unifilar em SVG (fundo branco, imprimível)
// SIMBOLOGIA NCH: blocos extraídos de QUADROS.dxf (js/qe_simbolos.js)
function qeSVGUnifilar() {
  const circ = qeCircuitos();
  const PASSO = 150, X0 = 150, LARG = X0 + circ.length * PASSO + 40, ALT = 470;
  let s = '';
  const ln = (x1, y1, x2, y2, w) => { s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${w || 1.6}"/>`; };
  const txt = (x, y, t, sz, anc, bold) => { s += `<text x="${x}" y="${y}" font-size="${sz || 11}" text-anchor="${anc || 'middle'}" font-family="Arial" ${bold ? 'font-weight="bold"' : ''} fill="#111">${t}</text>`; };
  // coloca um símbolo NCH: eixo vertical em x, topo em yTopo, c/ altura px.
  // devolve o y de saída (fundo do símbolo). cor p/ os preenchimentos.
  const simb = (chave, x, yTopo, altura, cor) => {
    const S = QE_SIMB[chave]; if (!S) return yTopo;
    const [mx, my, Mx, My] = S.bb;
    const k = altura / (My - my);
    s += `<g transform="translate(${x},${yTopo + k * My}) scale(${k},${-k})" stroke="#111" stroke-width="${(1.5 / k).toFixed(4)}" fill="none" color="${cor || '#111'}" stroke-linecap="round">${S.f}</g>`;
    return yTopo + altura;
  };

  // cabeçalho + cartucho mini
  txt(LARG / 2, 30, 'QE-AVAC — ESQUEMA DE PRINCÍPIO (UNIFILAR)', 15, 'middle', true);
  txt(LARG / 2, 48, `${circ.length} saídas${qeState.parametros.malha_agua ? ' · rede ' + qeState.parametros.malha_agua : ''} · In* = calculado (W/400/1,73/0,8 · W/230/0,8) — confirmar c/ chapa`, 10);

  // entrada + IG (símbolo NCH: interruptor aberto)
  const YBAR = 120;
  txt(40, YBAR - 46, '400/230V', 10, 'start');
  txt(40, YBAR - 34, '3F+N 50Hz', 10, 'start');
  ln(60, YBAR - 62, 60, YBAR - 30);
  simb('int_aberto', 60, YBAR - 30, 28);
  txt(75, YBAR - 14, 'IG', 11, 'start', true);
  txt(75, YBAR - 2, '(dimensionar c/ simultaneidade)', 8.5, 'start');
  // barramento
  ln(60, YBAR, X0 + (circ.length - 1) * PASSO + 40, YBAR, 3.5);

  circ.forEach((c, i) => {
    const x = X0 + i * PASSO;
    let y = YBAR;
    ln(x, YBAR, x, y += 14);
    // cadeia de aparelhos (simbologia NCH)
    c.cadeia.forEach(ap => {
      if (ap === 'disj') {
        y = simb('disjuntor', x, y, 28);
        txt(x + 9, y - 10, c.prot, 9.5, 'start');
      } else if (ap === 'gm') {
        y = simb('disj_motor', x, y, 34);
        txt(x + 12, y - 16, 'DM ' + c.prot, 9.5, 'start');
      } else if (ap === 'dif') {
        y = simb('int_dif', x, y, 28);
        txt(x + 9, y - 8, 'dif. ' + c.dif, 9.5, 'start');
        if (c.cont) { // contagem >12 kW el. [LEI 138-I Tab.18]
          ln(x, y, x, y + 6); y += 6;
          y = simb('contador', x, y, 22);
          txt(x + 13, y - 6, 'kWh', 9, 'start');
        }
      } else if (ap === 'km') {
        ln(x, y, x, y += 6);
        y = simb('contactor', x, y, 26);
        txt(x + 9, y - 8, 'KM', 9.5, 'start');
      } else if (ap === 'ih') {
        // relógio ao lado, afastado da cadeia (sem pisar o KM nem o cabo)
        simb('relogio', x + 48, y - 16, 14);
        txt(x + 60, y - 5, 'IH', 9, 'start');
        ln(x + 40, y - 9, x + 34, y - 9, 1); // tracinho de ligação ao KM
        ln(x, y, x, y += 6);
      }
    });
    // fase
    txt(x + 8, y + 12, c.fase === 'mono' ? '1F+N' : '3F+N', 8.5, 'start');
    ln(x, y, x, y += 30);
    // cabo
    txt(x + 6, y - 8, c.info[1] || '', 8.5, 'start');
    // carga
    if (c.carga === 'motor') {
      s += `<circle cx="${x}" cy="${y + 18}" r="17" fill="none" stroke="#111" stroke-width="1.6"/>`;
      txt(x, y + 17, 'M', 12, 'middle', true);
      txt(x, y + 29, c.fase === 'mono' ? '1~' : '3~', 9);
      if (c.extra === 'EC') txt(x + 21, y + 10, 'EC', 8.5, 'start', true);
      y += 35;
    } else if (c.carga === 'resist') {
      s += `<rect x="${x - 8}" y="${y}" width="16" height="30" fill="none" stroke="#111" stroke-width="1.6"/>`;
      y += 30;
    } else {
      s += `<rect x="${x - 26}" y="${y}" width="52" height="30" fill="none" stroke="#111" stroke-width="1.6"/>`;
      txt(x, y + 19, c.cargaTxt || 'EQ', 11, 'middle', true);
      y += 30;
    }
    // etiquetas
    txt(x, y + 16, c.nome, 10.5, 'middle', true);
    txt(x, y + 29, c.info[0] || '', 9);
    if (c.relogio) txt(x, y + 41, 'Man/0/Aut + IH→KH', 8);
  });

  // rodapé de doutrina
  txt(40, ALT - 18, 'Regras: piso 16A/2,5mm² [Lopes] · relógio c/ reserva de marcha [BB] · sinalização Estado+Avaria por circuito, nunca agrupada [BB] · dif. B em VFD tri / F em inverter mono', 8.5, 'start');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARG}" height="${ALT}" viewBox="0 0 ${LARG} ${ALT}"><rect width="${LARG}" height="${ALT}" fill="#fff"/>${s}</svg>`;
}

// ═══ ESQUEMA DE COMANDO v0.1 (escola do Lopes, simbologia NCH) ═══
// Multifilar entre barras L-cmd / N-cmd: comutador Man/0/Aut,
// relógio IH → relé KH (multiplicação), encravamento DM em série c/
// a bobina, lâmpadas Estado (verde) + Avaria (vermelha) POR máquina.
function qeSVGComando() {
  const todos = qeCircuitos();
  const cmd = todos.filter(c => c.cadeia.includes('km'));
  const temRelogio = cmd.some(c => c.relogio && !c.nome.includes('res.'));
  const GRUPO = 210, X0 = temRelogio ? 260 : 90;
  const LARG = X0 + cmd.length * GRUPO + 30, ALT = 470;
  const YL = 110, YN = 380; // barras
  let s = '';
  const ln = (x1, y1, x2, y2, w) => { s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111" stroke-width="${w || 1.4}"/>`; };
  const txt = (x, y, t, sz, anc, bold) => { s += `<text x="${x}" y="${y}" font-size="${sz || 10}" text-anchor="${anc || 'middle'}" font-family="Arial" ${bold ? 'font-weight="bold"' : ''} fill="#111">${t}</text>`; };
  const simb = (chave, x, yTopo, altura, cor) => {
    const S = QE_SIMB[chave]; if (!S) return yTopo;
    const [mx, my, Mx, My] = S.bb;
    const k = altura / (My - my);
    s += `<g transform="translate(${x},${yTopo + k * My}) scale(${k},${-k})" stroke="#111" stroke-width="${(1.5 / k).toFixed(4)}" fill="none" color="${cor || '#111'}" stroke-linecap="round">${S.f}</g>`;
    return yTopo + altura;
  };
  const bobina = (x, y, nome) => { // bobina = rectângulo A1/A2 (à Lopes)
    s += `<rect x="${x - 16}" y="${y}" width="32" height="20" fill="none" stroke="#111" stroke-width="1.5"/>`;
    txt(x, y + 14, nome, 10, 'middle', true);
    txt(x + 21, y + 4, 'A1', 7.5, 'start'); txt(x + 21, y + 22, 'A2', 7.5, 'start');
    return y + 20;
  };

  txt(LARG / 2, 30, 'QE-AVAC — ESQUEMA DE COMANDO', 15, 'middle', true);
  txt(LARG / 2, 48, 'escola: relógio→relé, Man/0/Aut, encravamentos em série, Estado+Avaria por máquina', 10);
  // barras
  ln(40, YL, LARG - 20, YL, 3); txt(40, YL - 8, 'L cmd (230V AC)', 9.5, 'start', true);
  ln(40, YN, LARG - 20, YN, 3); txt(40, YN + 14, 'N cmd', 9.5, 'start', true);

  // cabeça: IH → KH1 (o relógio multiplica por relé — NUNCA comanda directo)
  if (temRelogio) {
    const x = 110;
    let y = YL;
    ln(x, YL, x, y += 26);
    simb('relogio', x, y, 22); txt(x + 20, y + 14, 'IH', 10, 'start', true); y += 22;
    ln(x, y, x, y + 130); y += 130;
    y = bobina(x, y, 'KH1');
    ln(x, y, x, YN);
    txt(x, YN + 30, 'relógio → relé KH1', 9, 'middle', true);
    txt(x, YN + 42, '(c/ reserva de marcha)', 8.5);
    ln(190, YL, 190, YN, 0.7); // separador
  }

  cmd.forEach((c, i) => {
    const x = X0 + i * GRUPO, xE = x + 70, xA = x + 125;
    const solar = c.nome.includes('res.');
    let y = YL;
    // ── coluna de comando ──
    ln(x, YL, x, y += 20);
    if (solar) {
      // resistência: SEM manual [REGRA-BB] — termóstato como contacto
      simb('int_aberto', x, y, 20);
      txt(x + 8, y + 12, 'termóstato', 8, 'start');
    } else {
      // comutador Man/0/Aut (símbolo NCH)
      simb('comutador', x, y, 20);
      txt(x - 14, y + 8, 'Man', 8, 'end');
      txt(x + 14, y + 8, '0/Aut', 8, 'start');
    }
    y += 20; ln(x, y, x, y += 12);
    // contacto automático: relógio (KH1) / sonda / IH nocturno no solar
    if (c.cmdTipo !== 'manual') {
      simb('int_aberto', x, y, 24);
      const rot = solar ? 'IH (noite)' : (c.cmdTipo === 'sonda' ? 'sonda' : 'KH1 13-14');
      txt(x + 8, y + 14, rot, 8.5, 'start');
      y += 24; ln(x, y, x, y += 12);
    }
    // encravamento DM em série (só quando há guarda-motor)
    if (c.temGM) {
      simb('int_aberto', x, y, 24);
      txt(x + 8, y + 14, 'DM 13-14', 8.5, 'start');
      y += 24; ln(x, y, x, y += 12);
    }
    y = bobina(x, y, 'KM');
    ln(x, y, x, YN);
    // ── lâmpada Estado (verde): contacto KM ──
    ln(xE, YL, xE, YL + 40);
    simb('int_aberto', xE, YL + 40, 24); txt(xE + 7, YL + 54, 'KM 13-14', 8, 'start');
    ln(xE, YL + 64, xE, YN - 46);
    simb('lamp_verde', xE, YN - 46, 34, '#0a8a0a');
    ln(xE, YN - 12, xE, YN);
    txt(xE, YN + 14 + 12, 'Estado', 8.5);
    // ── lâmpada Avaria (vermelha): contacto NF do DM ── (só c/ guarda-motor)
    if (c.temGM) {
      ln(xA, YL, xA, YL + 40);
      simb('int_fechado', xA, YL + 40, 24); txt(xA + 7, YL + 54, 'DM 21-22', 8, 'start');
      ln(xA, YL + 64, xA, YN - 46);
      simb('lamp_verm', xA, YN - 46, 34, '#c01414');
      ln(xA, YN - 12, xA, YN);
      txt(xA, YN + 26, 'Avaria', 8.5);
    }
    txt(x + 55, YN + 44, c.nome, 10.5, 'middle', true);
    if (i < cmd.length - 1) ln(x + GRUPO - 35, YL, x + GRUPO - 35, YN, 0.7);
  });

  txt(40, ALT - 30, 'Comando: 230V AC [REGRA DA CASA 07/08] c/ 4 salvaguardas: campo comuta contactos secos · entradas GTC nunca a 230V · nunca misturar tensões no mesmo cabo · protecção própria do comando. 24V só automação/GTC/campo electrónico.', 8.5, 'start');
  txt(40, ALT - 16, 'Bornes de telesinalização Estado/Avaria por máquina (a régua GTC) ficam implícitos — v0.2 desenha-os. Sinalização POR máquina, NUNCA agrupada [REGRA-BB].', 8.5, 'start');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARG}" height="${ALT}" viewBox="0 0 ${LARG} ${ALT}"><rect width="${LARG}" height="${ALT}" fill="#fff"/>${s}</svg>`;
}

function qeMostrarComando() {
  const cmd = qeCircuitos().filter(c => c.cadeia.includes('km'));
  if (!cmd.length) { addBot('Este sistema não tem circuitos comandados no QE (tudo entregue a controladores de fabricante) — não há comando para desenhar. 🦆'); return; }
  const svg = qeSVGComando();
  addBot(`<div class="qe-eq-tit">🔌 Esquema de comando</div><div class="qe-svg-wrap">${svg}</div><span class="dim">Comando v0.1 — só as máquinas comandadas pelo QE (${cmd.map(c => c.nome).join(', ')}).</span>`);
  addPills([
    { label: '⬇ Descarregar SVG (comando)', action: () => {
      const blob = new Blob([qeSVGComando()], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qe_avac_comando.svg';
      a.click();
    } },
    { label: '🔁 Compor outro sistema', action: () => iniciarCompositorQE() },
    { label: '← Ferramentas', action: () => { modo = null; showToolMenu(currentArea); } },
  ]);
}

function qeMostrarUnifilar() {
  const svg = qeSVGUnifilar();
  addBot(`<div class="qe-eq-tit">📐 Esquema de princípio</div><div class="qe-svg-wrap">${svg}</div><span class="dim">Bonecada v0.1 — símbolos da casa em estreia. Arrasta para o lado se não couber.</span>`);
  addPills([
    { label: '🔌 Ver esquema de comando', action: () => qeMostrarComando() },
    { label: '⬇ Descarregar SVG', action: () => {
      const blob = new Blob([qeSVGUnifilar()], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qe_avac_unifilar.svg';
      a.click();
    } },
    { label: '🔁 Compor outro sistema', action: () => iniciarCompositorQE() },
    { label: '← Ferramentas', action: () => { modo = null; showToolMenu(currentArea); } },
  ]);
}

// ─── Helpers ───
function qeEtiquetaTag(txt) {
  return txt.replace(/\[(PRATICA|LEI|ESCOLA|REGRA-BB|DOUTRINA)([^\]]*)\]/g,
    '<span class="qe-tag">$1$2</span>');
}

// ─── Estilos ───
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .qe-eq-tit { font-weight: 700; margin: 2px 0 6px; }
    .qe-sec-tit { font-weight: 700; margin: 10px 0 4px; opacity: .9; }
    .qe-lista { padding-left: 18px; margin: 4px 0; }
    .qe-lista li { margin-bottom: 5px; }
    .qe-det { border: 1px solid var(--border, #2a3450); border-radius: 10px; padding: 8px 12px; margin: 2px 0; }
    .qe-det summary { cursor: pointer; font-size: 1.02em; }
    .qe-badge { font-size: .78em; opacity: .75; border: 1px solid var(--border, #2a3450); border-radius: 20px; padding: 2px 9px; margin-left: 6px; }
    .qe-tag { font-size: .78em; opacity: .6; font-family: 'JetBrains Mono', monospace; }
    .qe-etq { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; border: 1px solid var(--border, #2a3450); border-radius: 8px; padding: 8px 10px; margin: 4px 0; overflow-x: auto; }
    .qe-etq div { margin-bottom: 4px; white-space: nowrap; }
    .qe-svg-wrap { overflow-x: auto; border-radius: 8px; margin: 4px 0; background: #fff; }
    .qe-svg-wrap svg { display: block; }
  `;
  document.head.appendChild(style);
})();

// ─── Registo ───
registerTool('electricidade', {
  id: 'compositor_qe',
  icon: '⚡',
  name: 'QE-AVAC — Compositor',
  desc: 'Perguntas → blocos do parque → características → etiquetas de saída, GTC e caderno',
  launch: iniciarCompositorQE,
});
