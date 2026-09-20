// ═══════════════════════════════════════════════════
// ALIOS ONE — Módulo Electricidade: QE-AVAC Mapa de Circuitos
// qe_mapa.js — a peça de dimensionamento dos quadros AVAC
// Regras da casa (calibradas na obra NCH23-298, 09/2026):
//   · cabo dimensionado pelo MCA do fabricante
//   · disjuntor entre MCA e MFA (nunca acima do MFA)
//   · diferenciais: 3~ c/ VFD/EC → B; 1~ c/ electrónica → F;
//     restantes → A; NUNCA tipo AC
//   · contagem permanente se Pn > 12 kW [138-I, Tab.18]
//   · cabos XZ1 (frt,zh) em esteira; comando LiHCH à parte
//   · corte de emergência: bobina MN comandada pela CDI
// Vasco 🦆, 20/09/2026.
// ═══════════════════════════════════════════════════

registerTool('electricidade', {
  id: 'qe_mapa',
  icon: '🗒️',
  name: 'QE-AVAC — Mapa de circuitos',
  desc: 'Circuitos com regras da casa: cabo pelo MCA, disjuntor MCA↔MFA, diferenciais B/F/A, contagem 138-I',
  launch: iniciarQeMapa
});

// Iz (A) — XZ1 (frt,zh) multicondutor em esteira perfurada (valores prudentes de projecto)
const QM_IZ = [[1.5,15],[2.5,18],[4,27],[6,36],[10,50],[16,68],[25,89],[35,112],[50,134],[70,171],[95,207]];  // calibrada à prática da casa (NCH23-298)
const QM_DISJ = [6,10,13,16,20,25,32,40,50,63,80,100,125];
const QM_DIF  = [25,40,63,100,125];

const QM_TIPOS = {
  vrv:    { nome:'UE VRV / condensadora 3~', fases:3, dif:'B',
            q:[['etiqueta','Etiqueta do circuito? (ex.: VRF.01)'],['equip','Equipamento? (ex.: UE.1 — RXYA16A, 16 HP)'],['pn','Potência eléctrica Pn (kW)?'],['mca','MCA — corrente máx. do fabricante (A)?'],['mfa','MFA — protecção máx. (A)? (Enter se não indicado)']] },
  bc:     { nome:'Bomba de calor / chiller 3~ (VFD)', fases:3, dif:'B',
            q:[['etiqueta','Etiqueta? (ex.: BC.01)'],['equip','Equipamento? (ex.: EWYT090CZP-A2)'],['pn','Pn eléctrica (kW)?'],['mca','Corrente de dimensionamento (wires sizing / MCA) (A)?'],['mfa','Protecção máx. (A)? (Enter se não indicada)']] },
  uis:    { nome:'Grupo de UIs VRV (1~)', fases:1, dif:'A',
            q:[['etiqueta','Etiqueta? (ex.: VRF.01-UI a)'],['equip','Grupo? (ex.: UI1.1–1.6, ventiladores)'],['pn','Pn total do grupo (kW)?'],['mca','Corrente total estimada (A)?']] },
  split:  { nome:'Split / multisplit (1~)', fases:1, dif:'F',
            q:[['etiqueta','Etiqueta? (ex.: SPL.01)'],['equip','Conjunto? (ex.: FTXM25A/RXM25A9)'],['pn','Pn (kW)?'],['mca','Corrente nominal (A)?'],['mfa','MFA (A)? — nos splits costuma mandar (ex.: 13)']] },
  bomba:  { nome:'Bomba circuladora electrónica (1~)', fases:1, dif:'F',
            q:[['etiqueta','Etiqueta? (ex.: BB.01)'],['equip','Bomba? (ex.: MAGNA3 50-80 F)'],['pn','Pn (kW)?'],['mca','Corrente (A)?']] },
  resist: { nome:'Resistência eléctrica (1~)', fases:1, dif:'A',
            q:[['etiqueta','Etiqueta? (ex.: RAQ.01)'],['equip','Resistência? (ex.: hidrokit 6 kW)'],['pn','Potência (kW)?'],['duas','Há DUAS resistências a encravar? (s/n)']] },
  uta:    { nome:'UTAN / UTA c/ quadro de bordo (3~)', fases:3, dif:'B',
            q:[['etiqueta','Etiqueta? (ex.: UTA.01)'],['equip','Unidade? (ex.: ADT06ERD1)'],['pn','Pn (kW)?'],['mca','Corrente (A)?']] },
  vent:   { nome:'Ventilador / recuperador (1~)', fases:1, dif:'A',
            q:[['etiqueta','Etiqueta? (ex.: VE.01)'],['equip','Equipamento? (ex.: Sodeca CJK/EC-250)'],['pn','Pn (kW)?'],['mca','Corrente máx. (A)?']] },
  ctrl:   { nome:'Controlo (iTM / nó I/O / estações PR)', fases:1, dif:'A',
            q:[['etiqueta','Etiqueta? (ex.: CTR.01)'],['equip','Equipamento? (ex.: iTM DCM601B51)']] },
  livre:  { nome:'Outro (manual)', fases:1, dif:'A',
            q:[['etiqueta','Etiqueta?'],['equip','Equipamento?'],['fases','Monofásico ou trifásico? (1/3)'],['pn','Pn (kW)?'],['mca','Corrente de dimensionamento (A)?'],['mfa','Protecção máx. (A)? (Enter se n/a)'],['dif','Diferencial: A, F ou B?']] },
};

let qm = null;

function iniciarQeMapa() {
  modo = 'qe_mapa';
  setupChat(); setProgress(5); setSub('Electricidade — QE-AVAC Mapa de circuitos');
  setHeaderBtns([{ label: '← Ferramentas', action: () => showToolMenu(currentArea) }, { label: 'Novo', primary: true, action: iniciarQeMapa }]);
  qm = { quadro: '', circuitos: [], fila: [], tipo: null, tmp: {} };
  addBot('Mapa de circuitos do quadro AVAC — <strong>a peça de dimensionamento</strong> (os esquemas de execução ficam para o quadrista, como manda a nota da casa).');
  addBot('Regras embutidas: cabo pelo <strong>MCA</strong> · disjuntor entre <strong>MCA e MFA</strong> · diferenciais <strong>B/F/A</strong> (nunca AC) · contagem permanente &gt;12 kW · XZ1 (frt,zh).');
  addBot('Nome do quadro? (ex.: <em>QE.AVAC.P0</em>)');
  enableInput('QE.AVAC.P0');
}

function qmMenuTipos() {
  addBot('Adicionar circuito — que tipo de equipamento?');
  addPills(Object.entries(QM_TIPOS).map(([k,t]) => ({ label: t.nome, action: () => qmComecaTipo(k) }))
    .concat(qm.circuitos.length ? [{ label: '✅ Terminar e gerar o mapa ('+qm.circuitos.length+')', action: qmGerar }] : []));
}

function qmComecaTipo(k) {
  qm.tipo = k; qm.tmp = {}; qm.fila = QM_TIPOS[k].q.slice();
  if (k !== 'ctrl' && k !== 'livre') {
    const def = QM_TIPOS[k].fases;
    qm.fila.splice(1, 0, ['fases', 'Alimentação: monofásico ou trifásico? (1/3 — Enter = ' + def + '~)']);
  }
  qmPergunta();
}

function qmPergunta() {
  if (!qm.fila.length) { qmCalcula(); return; }
  addBot(qm.fila[0][1]);
  enableInput('…');
}

inputHandlers['qe_mapa'] = function(val) {
  addUser(val || '—'); disableInput();
  if (qm.passo === 'fs') { qm.passo = null; const fs = qmNum(val); qmGerarFinal(fs && fs>0 && fs<=1 ? fs : 1.0); return; }
  if (!qm.quadro) { qm.quadro = val.trim() || 'QE.AVAC'; addBot('Quadro <strong>'+qm.quadro+'</strong>. Vamos aos circuitos.'); qmMenuTipos(); return; }
  const [campo] = qm.fila.shift();
  qm.tmp[campo] = val.trim();
  qmPergunta();
};

function qmNum(x) { const v = parseFloat(String(x).replace(',','.')); return isNaN(v) ? null : v; }

function qmCalcula() {
  const t = QM_TIPOS[qm.tipo], d = qm.tmp;
  let fases = t.fases;
  if (d.fases) fases = d.fases.trim().startsWith('3') ? 3 : (d.fases.trim().startsWith('1') ? 1 : t.fases);
  if (qm.tipo==='livre') fases = d.fases==='3' ? 3 : 1;
  const pn = qmNum(d.pn) || 0;
  let mca = qmNum(d.mca);
  const mfa = qmNum(d.mfa);
  let dif = qm.tipo==='livre' ? (['A','F','B'].includes((d.dif||'').toUpperCase()) ? d.dif.toUpperCase() : 'A') : t.dif;
  if (dif==='B' && fases===1) dif = 'F';  // electrónica monofásica (ex.: mini-VRV mono) → tipo F
  if (dif==='F' && fases===3) dif = 'B';  // electrónica trifásica → tipo B
  const obs = [];

  if (qm.tipo==='ctrl') mca = 1;
  if (qm.tipo==='resist') { mca = fases===3 ? pn*1000/692.8 : pn*1000/230; if ((d.duas||'').toLowerCase().startsWith('s')) obs.push('⚡ KM c/ ENCRAVAMENTO eléctrico+mecânico com a resistência gémea (nunca simultâneas)'); }
  if (mca===null) { addBot('⚠️ Sem corrente não há dimensionamento — circuito ignorado.'); qmMenuTipos(); return; }

  // disjuntor: menor calibre >= MCA, tecto no MFA
  let disj = QM_DISJ.find(c => c >= mca);
  if (mfa) {
    if (mfa < mca) { obs.push('⚠️ MFA ('+mfa+' A) < MCA ('+mca+' A) — CONFIRMAR COM O FABRICANTE'); }
    if (disj > mfa) { disj = [...QM_DISJ].reverse().find(c => c <= mfa) || disj; obs.push('disjuntor limitado pelo MFA'); }
  }
  if (!disj) disj = 125;
  // splits: o MFA é o próprio disjuntor de projecto (prática da casa)
  if (qm.tipo==='split' && mfa) { disj = [...QM_DISJ].reverse().find(c => c <= mfa) || disj; }
  // mínimos de bom senso
  if (qm.tipo==='ctrl') disj = 6;
  if ((qm.tipo==='bomba'||qm.tipo==='vent') && disj < 10) disj = 10;

  // secção: Iz >= disjuntor; mínimo 2,5 mm² em potência (1,5 só em controlo)
  const secMin = (qm.tipo==='ctrl') ? 1.5 : 2.5;
  const sec = QM_IZ.find(([s,iz]) => iz >= disj && s >= secMin);
  const cabo = sec ? (fases===3?'5G':'3G') + String(sec[0]).replace('.',',') : '—';
  if (!sec) obs.push('⚠️ acima de 95 mm² — dimensionar à mão');

  const difCal = QM_DIF.find(c => c >= disj) || 125;
  if (pn > 12) obs.push('⚡ CONTAGEM PERMANENTE no circuito [138-I, Tab.18]');

  const c = { _in: mca, _fases: fases, etiqueta: d.etiqueta||'—', equip: d.equip||'—',
    alim: fases===3 ? '400V 3N~' : '230V 1~', pn,
    inmca: (qm.tipo==='resist'? mca.toFixed(1) : String(d.mca||'—')) + (mfa? ' / '+mfa : ''),
    disj: disj+'A C', dif: difCal+'A tipo '+dif, cabo, obs: obs.join('; ') };
  qm.circuitos.push(c);
  addBot('<strong>'+c.etiqueta+'</strong> — '+c.equip+'<br>'+c.alim+' · '+c.disj+' · '+c.dif+' · <strong>'+c.cabo+'</strong>' + (c.obs? '<br><em>'+c.obs+'</em>':''));
  qmMenuTipos();
}

function qmGerar() {
  qm.passo = 'fs';
  addBot('Antes do mapa, a <strong>cabeça do quadro</strong> — factor de simultaneidade para o geral? (<em>Enter = 1,0</em> — regra da casa: totalidade das cargas, reserva 30%)');
  enableInput('1,0');
}

function qmGerarFinal(fs) {
  const th = x=>'<th style="padding:3px 6px;border:1px solid #2e4880;font-size:12px">'+x+'</th>';
  const td = x=>'<td style="padding:3px 6px;border:1px solid #2e4880;font-size:12px">'+x+'</td>';
  let html = '<strong>'+qm.quadro+'</strong> — mapa de circuitos<br><div style="overflow-x:auto"><table style="border-collapse:collapse;margin-top:6px"><tr>'+
    ['Circuito','Equipamento','Alim.','Pn (kW)','In/MCA / MFA (A)','Disjuntor','Diferencial','Cabo XZ1 (frt,zh)','Observações'].map(th).join('')+'</tr>';
  qm.circuitos.forEach(c => { html += '<tr>'+[c.etiqueta,c.equip,c.alim,c.pn||'—',c.inmca,c.disj,c.dif,c.cabo,c.obs||''].map(td).join('')+'</tr>'; });
  html += '</table></div>';
  addBot(html);
  // ── cabeça do quadro ──
  const pnT = qm.circuitos.reduce((s,c)=>s+(c.pn||0),0);
  const inT = qm.circuitos.reduce((s,c)=>s+(c._fases===3? c._in : c._in/3),0) * fs;
  let geral = QM_DISJ.find(c=>c>=inT);
  const secG = geral ? QM_IZ.find(([sz,iz])=>iz>=geral && sz>=2.5) : null;
  qm.cabeca = { pnT, inT, fs, geral: geral? geral+'A' : '>125A — dimensionar à mão',
    cabo: secG? '5G'+String(secG[0]).replace('.',',') : 'a dimensionar' };
  addBot('<strong>CABEÇA DO QUADRO ('+qm.quadro+')</strong><br>'+
    'Potência instalada: <strong>'+pnT.toFixed(1)+' kW</strong> · Corrente de projecto (equiv. 3~, f.s. '+fs.toFixed(2).replace('.',',')+'): <strong>'+inT.toFixed(1)+' A</strong><br>'+
    'Interruptor/disjuntor geral: <strong>'+qm.cabeca.geral+'</strong> c/ <strong>bobina MN</strong> (CDI) · Alimentação (empreitada de electricidade): <strong>XZ1 '+qm.cabeca.cabo+'</strong> <em>(indicativa — confirmar no projecto eléctrico)</em><br>'+
    'Reserva de espaço: <strong>≥30%</strong> [CTG da casa]');
  addBot('<strong>Notas gerais do quadro</strong> (vão no TSV):<br>1. Corte de emergência por <strong>bobina de falta de tensão (MN)</strong> comandada pela CDI — segurança positiva, rearme manual.<br>2. Diferenciais B/F/A pela natureza da carga; <strong>nunca tipo AC</strong>.<br>3. Cabos pelo MCA do fabricante; disjuntor nunca acima do MFA.<br>4. Interligações de comando (F1/F2, UTA↔UE, termóstatos) em <strong>LiHCH</strong>, fora do QE — ver desenho de comando.<br>5. Este mapa é a peça de dimensionamento; esquemas de execução pelo quadrista, para aprovação.');
  addPills([
    { label: '🖨️ PDF do mapa', mantem: true, action: qmPDF },
    { label: '📋 Copiar TSV (colar no Excel)', mantem: true, action: qmCopiar },
    { label: '+ Mais circuitos', action: qmMenuTipos },
    { label: 'Novo quadro', action: iniciarQeMapa }
  ]);
}

function qmCopiar() {
  let tsv = qm.quadro+'\n'+['Circuito','Equipamento','Alimentação','Pn (kW)','In-MCA / MFA (A)','Disjuntor','Diferencial','Cabo XZ1 (frt,zh)','Observações'].join('\t')+'\n';
  qm.circuitos.forEach(c => { tsv += [c.etiqueta,c.equip,c.alim,c.pn||'',c.inmca,c.disj,c.dif,c.cabo,c.obs||''].join('\t')+'\n'; });
  if (qm.cabeca) tsv += '\nCABEÇA DO QUADRO\tPn instalada: '+qm.cabeca.pnT.toFixed(1)+' kW\tIn projecto (f.s. '+qm.cabeca.fs+'): '+qm.cabeca.inT.toFixed(1)+' A\tGeral: '+qm.cabeca.geral+' c/ bobina MN (CDI)\tAlimentação: XZ1 '+qm.cabeca.cabo+' (indicativa, pela empreitada de electricidade)\tReserva de espaço >=30%\n';
  tsv += '\nNOTAS GERAIS\n1. Corte de emergência: bobina de falta de tensão (MN) comandada pela CDI (segurança positiva; rearme manual). MX só com linha vigiada e alimentação socorrida.\n2. Diferenciais: 3~ c/ VFD/EC → tipo B; 1~ c/ electrónica → tipo F; restantes → tipo A. Nunca tipo AC.\n3. Cabos dimensionados pelo MCA do fabricante; disjuntor entre MCA e MFA.\n4. Contagem permanente nos circuitos >12 kW [Portaria 138-I, Tab.18].\n5. Comando em LiHCH (halogen-free), fora do QE.\n6. Este mapa constitui a peça de dimensionamento dos QE.AVAC; esquemas de execução pelo quadrista, para aprovação.\n';
  navigator.clipboard.writeText(tsv).then(()=>addBot('✓ TSV copiado — colar directo no Excel.'));
}


function qmPDF() {
  const hoje = new Date().toLocaleDateString('pt-PT');
  const esc = x => String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let linhas = qm.circuitos.map(c =>
    '<tr><td class="et">'+esc(c.etiqueta)+'</td><td class="eq">'+esc(c.equip)+'</td><td>'+esc(c.alim)+'</td><td>'+(c.pn||'—')+'</td><td>'+esc(c.inmca)+'</td><td>'+esc(c.disj)+'</td><td>'+esc(c.dif)+'</td><td><b>'+esc(c.cabo)+'</b></td><td class="obs">'+esc(c.obs)+'</td></tr>').join('');
  const cb = qm.cabeca;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>${esc(qm.quadro)} — Mapa de circuitos</title>
<style>
@page{size:A4 landscape;margin:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#111;margin:0;padding:12mm;font-size:10.5px}
h1{font-size:16px;margin:0 0 2px}h2{font-size:11px;font-weight:400;color:#555;margin:0 0 10px}
.top{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2.5px solid #123c5a;padding-bottom:6px;margin-bottom:10px}
.marca{font-size:13px;font-weight:700;color:#123c5a}
table{border-collapse:collapse;width:100%}
th{background:#123c5a;color:#fff;padding:4px 6px;font-size:9.5px;text-align:left}
td{border:0.5px solid #9fb0bd;padding:3.5px 6px;vertical-align:top}
tr:nth-child(even) td{background:#f2f6f9}
.et{font-weight:700;white-space:nowrap}.eq{min-width:150px}.obs{font-size:9px;color:#333}
.cabeca{margin-top:10px;border:1.5px solid #123c5a;border-radius:4px;padding:7px 10px;display:flex;gap:22px;flex-wrap:wrap}
.cabeca b{color:#123c5a}
.notas{margin-top:9px;font-size:9px;color:#333;column-count:2;column-gap:24px}
.rodape{margin-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#666;border-top:0.5px solid #9fb0bd;padding-top:5px}
</style></head><body>
<div class="top"><div><h1>${esc(qm.quadro)} — MAPA DE CIRCUITOS AVAC</h1>
<h2>Peça de dimensionamento · esquemas de execução pelo quadrista, para aprovação</h2></div>
<div class="marca">ALIOS ONE Cálculos</div></div>
<table><tr><th>Circuito</th><th>Equipamento</th><th>Alim.</th><th>Pn (kW)</th><th>In-MCA / MFA (A)</th><th>Disjuntor</th><th>Diferencial</th><th>Cabo XZ1 (frt,zh)</th><th>Observações</th></tr>${linhas}</table>
${cb ? '<div class="cabeca"><span>Potência instalada: <b>'+cb.pnT.toFixed(1)+' kW</b></span><span>Corrente de projecto (equiv. 3~, f.s. '+cb.fs+'): <b>'+cb.inT.toFixed(1)+' A</b></span><span>Geral: <b>'+esc(cb.geral)+'</b> c/ bobina MN (CDI)</span><span>Alimentação: <b>XZ1 '+esc(cb.cabo)+'</b> (indicativa — projecto eléctrico)</span><span>Reserva de espaço: <b>≥30%</b></span></div>' : ''}
<div class="notas">1. Corte de emergência por bobina de falta de tensão (MN) comandada pela CDI — segurança positiva, rearme manual; MX só com linha vigiada e alimentação socorrida. 2. Diferenciais: 3~ c/ VFD/EC → tipo B; 1~ c/ electrónica → tipo F; restantes → tipo A; nunca tipo AC. 3. Cabos dimensionados pelo MCA do fabricante; disjuntor nunca acima do MFA. 4. Contagem permanente nos circuitos &gt;12 kW [Portaria 138-I, Tab.18]. 5. Interligações de comando em LiHCH (halogen-free), fora do QE — ver desenho de comando. 6. Cabos de potência XZ1 (frt,zh) em esteira, com separação potência/comando.</div>
<div class="rodape"><span>ALIOS ONE Cálculos — mapa gerado em ${hoje}</span><span>Verificado: ______________________</span></div>
<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
  addBot('✓ Vista de impressão aberta — no diálogo, escolher <strong>Guardar como PDF</strong> (A4 deitado).');
}
